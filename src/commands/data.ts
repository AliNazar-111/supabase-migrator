import { Database } from '../lib/database';
import { Logger } from '../lib/logger';
import { GlobalOptions, MigrationResult } from '../types/index';
import { DataExporter } from '../lib/data-exporter';

export class DataCommand {
    private logger: Logger;

    constructor(logger: Logger) {
        this.logger = logger;
    }

    async execute(options: GlobalOptions): Promise<MigrationResult> {
        if (!options.source || !options.target) {
            throw new Error('Both --source and --target are required');
        }

        const source = new Database({ connectionString: options.source });
        const target = new Database({ connectionString: options.target });

        try {
            await source.connect();
            await target.connect();

            this.logger.info(`Source: ${source.getMaskedConnectionString()}`);
            this.logger.info(`Target: ${target.getMaskedConnectionString()}`);

            const schema = options.schema || 'public';

            // Use DataExporter to get tables in correct dependency order
            const dataExporter = new DataExporter(source, this.logger, './temp');
            const tables = options.table
                ? [options.table]
                : await dataExporter.getTablesInDependencyOrder(schema);

            this.logger.info(`Found ${tables.length} tables to migrate`);

            let totalRows = 0;
            const errors: string[] = [];
            const batchSize = options.batchSize || 1000;

            // Disable triggers and foreign keys during migration
            await target.query('SET session_replication_role = replica');

            try {
                for (const table of tables) {
                    try {
                        if (options.truncate && !options.dryRun) {
                            this.logger.info(`Truncating ${table}...`);
                            await target.query(`TRUNCATE TABLE "${schema}"."${table}" CASCADE`);
                        }

                        const rowCount = await this.migrateTable(
                            source,
                            target,
                            schema,
                            table,
                            options.dryRun || false,
                            batchSize
                        );

                        totalRows += rowCount;
                        this.logger.success(`${table}: ${rowCount} rows`);
                    } catch (error: any) {
                        const errorMsg = `${table}: ${error.message}`;
                        this.logger.error(errorMsg);
                        errors.push(errorMsg);
                    }
                }

                return {
                    success: errors.length === 0,
                    message: `Data migration completed. ${totalRows} total rows migrated.`,
                    details: {
                        itemsProcessed: tables.length,
                        rowsMigrated: totalRows,
                        errors: errors.length > 0 ? errors : undefined
                    }
                };
            } finally {
                await target.query('SET session_replication_role = DEFAULT');
            }
        } finally {
            await source.disconnect();
            await target.disconnect();
        }
    }

    private async migrateTable(
        source: Database,
        target: Database,
        schema: string,
        tableName: string,
        dryRun: boolean,
        batchSize: number
    ): Promise<number> {
        // Get total count
        const countRes = await source.query(`SELECT COUNT(*) FROM "${schema}"."${tableName}"`);
        const totalCount = parseInt(countRes.rows[0].count);

        if (dryRun) {
            this.logger.dryRun(`Would migrate ${totalCount} rows from ${tableName}`);
            return totalCount;
        }

        if (totalCount === 0) {
            return 0;
        }

        // Fetch data in batches
        let offset = 0;
        let successCount = 0;

        // Try to get primary key for consistent ordering
        const pkRes = await source.query(`
            SELECT a.attname
            FROM pg_index i
            JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
            WHERE i.indrelid = ($1 || '.' || $2)::regclass
            AND i.indisprimary;
        `, [schema, tableName]).catch(() => ({ rows: [] }));

        const pkCols = pkRes.rows.map((r: any) => `"${r.attname}"`).join(', ');
        const orderBy = pkCols ? `ORDER BY ${pkCols}` : '';

        while (offset < totalCount) {
            const result = await source.query(
                `SELECT * FROM "${schema}"."${tableName}" ${orderBy} LIMIT $1 OFFSET $2`,
                [batchSize, offset]
            );

            const rows = result.rows;

            for (const row of rows) {
                const keys = Object.keys(row).map(k => `"${k}"`).join(', ');
                const values = Object.values(row).map(v => {
                    // Handle JSONB objects
                    if (v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) {
                        return JSON.stringify(v);
                    }
                    // Handle JSONB arrays (Array of objects)
                    // Postgres arrays are usually arrays of strings/numbers
                    if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'object' && !(v[0] instanceof Date)) {
                        return JSON.stringify(v);
                    }
                    return v;
                });
                const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');

                const insertSQL = `
                    INSERT INTO "${schema}"."${tableName}" (${keys}) 
                    VALUES (${placeholders}) 
                    ON CONFLICT DO NOTHING
                `;

                try {
                    await target.query(insertSQL, values);
                    successCount++;
                } catch (e: any) {
                    if (e.message.includes('duplicate key value')) {
                        // Ignore duplicates
                    } else {
                        const rowId = row.id || row.uuid || row.slug || 'unknown';
                        this.logger.warn(`  Failed row [ID: ${rowId}] in ${tableName}: ${e.message}`);
                    }
                }
            }

            offset += batchSize;

            if (totalCount > batchSize) {
                this.logger.info(`  Progress: ${Math.min(offset, totalCount)}/${totalCount}`);
            }
        }

        return successCount;
    }
}
