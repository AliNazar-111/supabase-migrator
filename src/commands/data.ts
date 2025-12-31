import { Database } from '../lib/database';
import { Logger } from '../lib/logger';
import { GlobalOptions, MigrationResult } from '../types';

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
            let tables: string[];

            if (options.table) {
                tables = [options.table];
                this.logger.info(`Migrating table: ${options.table}`);
            } else {
                const tablesRes = await source.query(`
                    SELECT table_name 
                    FROM information_schema.tables 
                    WHERE table_schema = $1 
                    AND table_type = 'BASE TABLE'
                    ORDER BY table_name
                `, [schema]);
                tables = tablesRes.rows.map((r: any) => r.table_name);
                this.logger.info(`Found ${tables.length} tables to migrate`);
            }

            let totalRows = 0;
            const errors: string[] = [];
            const batchSize = options.batchSize || 1000;

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

        while (offset < totalCount) {
            const dataRes = await source.query(
                `SELECT * FROM "${schema}"."${tableName}" LIMIT $1 OFFSET $2`,
                [batchSize, offset]
            );

            const rows = dataRes.rows;

            for (const row of rows) {
                const keys = Object.keys(row).map(k => `"${k}"`).join(', ');
                const values = Object.values(row);
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
                    // Silent fail for individual rows
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
