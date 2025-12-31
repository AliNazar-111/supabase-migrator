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

        while (offset < totalRows) {
            const result = await this.db.query(
                `SELECT * FROM "${schemaName}"."${tableName}" LIMIT $1 OFFSET $2`,
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

        while (offset < totalRows) {
            const result = await this.db.query(
                `SELECT * FROM "${schemaName}"."${tableName}" LIMIT $1 OFFSET $2`,
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

    private async getTablesInDependencyOrder(schemaName: string): Promise<string[]> {
        // Get all tables with their foreign key dependencies
        const result = await this.db.query(`
            WITH RECURSIVE dep_graph AS (
                -- Base case: tables with no dependencies
                SELECT 
                    t.table_name,
                    0 as depth,
                    ARRAY[t.table_name] as path
                FROM information_schema.tables t
                WHERE t.table_schema = $1
                AND t.table_type = 'BASE TABLE'
                AND NOT EXISTS (
                    SELECT 1 
                    FROM information_schema.table_constraints tc
                    WHERE tc.table_schema = $1
                    AND tc.table_name = t.table_name
                    AND tc.constraint_type = 'FOREIGN KEY'
                )
                
                UNION
                
                -- Recursive case: tables depending on already processed tables
                SELECT 
                    t.table_name,
                    dg.depth + 1,
                    dg.path || t.table_name
                FROM information_schema.tables t
                JOIN information_schema.table_constraints tc 
                    ON tc.table_schema = t.table_schema 
                    AND tc.table_name = t.table_name
                JOIN information_schema.constraint_column_usage ccu
                    ON ccu.constraint_schema = tc.constraint_schema
                    AND ccu.constraint_name = tc.constraint_name
                JOIN dep_graph dg 
                    ON dg.table_name = ccu.table_name
                WHERE t.table_schema = $1
                AND t.table_type = 'BASE TABLE'
                AND tc.constraint_type = 'FOREIGN KEY'
                AND NOT t.table_name = ANY(dg.path)
            )
            SELECT DISTINCT table_name
            FROM dep_graph
            ORDER BY MAX(depth), table_name
        `, [schemaName]);

        if (result.rows.length > 0) {
            return result.rows.map((r: any) => r.table_name);
        }

        // Fallback: simple alphabetical order if dependency analysis fails
        const fallbackResult = await this.db.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = $1 
            AND table_type = 'BASE TABLE'
            ORDER BY table_name
        `, [schemaName]);

        return fallbackResult.rows.map((r: any) => r.table_name);
    }
}
