import { Database } from '../lib/database';
import { Logger } from '../lib/logger';
import * as fs from 'fs';
import * as path from 'path';

export interface DataExportOptions {
    format: 'sql' | 'json';
    batchSize: number;
    tableName?: string;
}

export class DataExporter {
    private db: Database;
    private logger: Logger;
    private outputDir: string;

    constructor(db: Database, logger: Logger, outputDir: string) {
        this.db = db;
        this.logger = logger;
        this.outputDir = outputDir;
    }

    async exportData(schemaName: string, options: DataExportOptions): Promise<string[]> {
        const dataDir = path.join(this.outputDir, 'data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        const exportedFiles: string[] = [];

        if (options.tableName) {
            // Export single table
            const file = await this.exportTable(schemaName, options.tableName, dataDir, options);
            if (file) exportedFiles.push(file);
        } else {
            // Export all tables
            const tables = await this.getTablesInDependencyOrder(schemaName);
            this.logger.info(`Exporting data from ${tables.length} tables...`);

            for (const table of tables) {
                const file = await this.exportTable(schemaName, table, dataDir, options);
                if (file) exportedFiles.push(file);
            }
        }

        return exportedFiles;
    }

    private async exportTable(
        schemaName: string,
        tableName: string,
        dataDir: string,
        options: DataExportOptions
    ): Promise<string | null> {
        try {
            // Get row count
            const countRes = await this.db.query(
                `SELECT COUNT(*) FROM "${schemaName}"."${tableName}"`
            );
            const totalRows = parseInt(countRes.rows[0].count);

            if (totalRows === 0) {
                this.logger.info(`${tableName}: 0 rows (skipped)`);
                return null;
            }

            this.logger.info(`Exporting ${tableName}: ${totalRows} rows`);

            if (options.format === 'sql') {
                return await this.exportTableAsSQL(schemaName, tableName, dataDir, totalRows, options.batchSize);
            } else {
                return await this.exportTableAsJSON(schemaName, tableName, dataDir, totalRows, options.batchSize);
            }
        } catch (error: any) {
            this.logger.error(`Failed to export ${tableName}: ${error.message}`);
            return null;
        }
    }

    private async exportTableAsSQL(
        schemaName: string,
        tableName: string,
        dataDir: string,
        totalRows: number,
        batchSize: number
    ): Promise<string> {
        const filename = path.join(dataDir, `${schemaName}.${tableName}.sql`);
        const writeStream = fs.createWriteStream(filename);

        // Header
        writeStream.write(`-- Data for table: ${schemaName}.${tableName}\n`);
        writeStream.write(`-- Generated: ${new Date().toISOString()}\n`);
        writeStream.write(`-- Total rows: ${totalRows}\n\n`);

        // Disable triggers during import
        writeStream.write(`SET session_replication_role = replica;\n\n`);

        let offset = 0;
        let processedRows = 0;

        // Try to get primary key for consistent ordering
        const pkRes = await this.db.query(`
            SELECT a.attname
            FROM pg_index i
            JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
            WHERE i.indrelid = ($1 || '.' || $2)::regclass
            AND i.indisprimary;
        `, [schemaName, tableName]).catch(() => ({ rows: [] }));

        const pkCols = pkRes.rows.map((r: any) => `"${r.attname}"`).join(', ');
        const orderBy = pkCols ? `ORDER BY ${pkCols}` : '';

        while (offset < totalRows) {
            const result = await this.db.query(
                `SELECT * FROM "${schemaName}"."${tableName}" ${orderBy} LIMIT $1 OFFSET $2`,
                [batchSize, offset]
            );

            const rows = result.rows;

            for (const row of rows) {
                const columns = Object.keys(row);
                const values = Object.values(row).map(v => this.escapeSQLValue(v));

                const insertSQL = `INSERT INTO "${schemaName}"."${tableName}" (${columns.map(c => `"${c}"`).join(', ')}) VALUES (${values.join(', ')});\n`;
                writeStream.write(insertSQL);
                processedRows++;
            }

            offset += batchSize;

            if (totalRows > batchSize && offset % (batchSize * 10) === 0) {
                this.logger.info(`  ${tableName}: ${Math.min(offset, totalRows)}/${totalRows}`);
            }
        }

        // Re-enable triggers
        writeStream.write(`\nSET session_replication_role = DEFAULT;\n`);

        writeStream.end();

        this.logger.success(`${tableName}: ${processedRows} rows exported to SQL`);

        return filename;
    }

    private async exportTableAsJSON(
        schemaName: string,
        tableName: string,
        dataDir: string,
        totalRows: number,
        batchSize: number
    ): Promise<string> {
        const filename = path.join(dataDir, `${schemaName}.${tableName}.json`);
        const writeStream = fs.createWriteStream(filename);

        writeStream.write('[\n');

        let offset = 0;
        let processedRows = 0;
        let isFirst = true;

        // Try to get primary key for consistent ordering
        const pkRes = await this.db.query(`
            SELECT a.attname
            FROM pg_index i
            JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
            WHERE i.indrelid = ($1 || '.' || $2)::regclass
            AND i.indisprimary;
        `, [schemaName, tableName]).catch(() => ({ rows: [] }));

        const pkCols = pkRes.rows.map((r: any) => `"${r.attname}"`).join(', ');
        const orderBy = pkCols ? `ORDER BY ${pkCols}` : '';

        while (offset < totalRows) {
            const result = await this.db.query(
                `SELECT * FROM "${schemaName}"."${tableName}" ${orderBy} LIMIT $1 OFFSET $2`,
                [batchSize, offset]
            );

            const rows = result.rows;

            for (const row of rows) {
                if (!isFirst) {
                    writeStream.write(',\n');
                }
                writeStream.write('  ' + JSON.stringify(row));
                isFirst = false;
                processedRows++;
            }

            offset += batchSize;

            if (totalRows > batchSize && offset % (batchSize * 10) === 0) {
                this.logger.info(`  ${tableName}: ${Math.min(offset, totalRows)}/${totalRows}`);
            }
        }

        writeStream.write('\n]\n');
        writeStream.end();

        this.logger.success(`${tableName}: ${processedRows} rows exported to JSON`);

        return filename;
    }

    public escapeSQLValue(value: any): string {
        if (value === null || value === undefined) {
            return 'NULL';
        }

        if (typeof value === 'number' || typeof value === 'boolean') {
            return String(value);
        }

        if (value instanceof Date) {
            return `'${value.toISOString()}'`;
        }

        if (typeof value === 'object') {
            // Handle arrays and JSON objects
            return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
        }

        // String - escape single quotes
        return `'${String(value).replace(/'/g, "''")}'`;
    }

    public async getTablesInDependencyOrder(schemaName: string): Promise<string[]> {
        // 1. Get ALL tables in the schema first
        const allTablesRes = await this.db.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = $1 
            AND table_type = 'BASE TABLE'
            ORDER BY table_name
        `, [schemaName]);

        const allTableNames = allTablesRes.rows.map((r: any) => r.table_name);

        if (allTableNames.length === 0) return [];

        // 2. Try to get dependent tables using a recursive CTE
        // This CTE finds tables and their maximum dependency depth
        const depResult = await this.db.query(`
            WITH RECURSIVE fk_deps AS (
                -- Direct foreign key relationships
                SELECT 
                    tc.table_name as source_table,
                    ccu.table_name as target_table
                FROM information_schema.table_constraints tc
                JOIN information_schema.constraint_column_usage ccu
                    ON ccu.constraint_schema = tc.constraint_schema
                    AND ccu.constraint_name = tc.constraint_name
                WHERE tc.table_schema = $1
                AND tc.constraint_type = 'FOREIGN KEY'
                AND ccu.table_schema = $1 -- Only consider dependencies within the same schema for ordering
                AND tc.table_name != ccu.table_name -- Ignore self-references
            ),
            dep_depth AS (
                -- Base case: tables with no incoming FKs (from other tables in the same schema)
                SELECT 
                    t.table_name,
                    0 as depth
                FROM information_schema.tables t
                WHERE t.table_schema = $1
                AND t.table_type = 'BASE TABLE'
                AND NOT EXISTS (
                    SELECT 1 FROM fk_deps fd WHERE fd.source_table = t.table_name
                )
                
                UNION ALL
                
                -- Recursive case: tables that depend on tables we've already found
                SELECT 
                    fd.source_table,
                    dd.depth + 1
                FROM fk_deps fd
                JOIN dep_depth dd ON fd.target_table = dd.table_name
                WHERE dd.depth < 20 -- Prevent infinite loops in case of cycles
            )
            SELECT table_name, MAX(depth) as max_depth
            FROM dep_depth
            GROUP BY table_name
            ORDER BY max_depth ASC
        `, [schemaName]);

        const orderedTables: string[] = depResult.rows.map((r: any) => r.table_name);

        // 3. Merge with all tables to ensure none are missed
        // We start with the ordered ones, then add any that weren't included (e.g. part of a cycle)
        const finalTables = [...orderedTables];

        for (const tableName of allTableNames) {
            if (!finalTables.includes(tableName)) {
                finalTables.push(tableName);
            }
        }

        return finalTables;
    }
}
