import { Database } from '../lib/database';
import { Logger } from '../lib/logger';
import { GlobalOptions, MigrationResult } from '../types/index';

export class SchemaCommand {
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
            const sqlStatements: string[] = [];
            let itemsProcessed = 0;

            // 1. Migrate Extensions
            this.logger.info('Migrating extensions...');
            const extensions = await this.getExtensions(source);
            for (const ext of extensions) {
                const sql = `CREATE EXTENSION IF NOT EXISTS "${ext.extname}" SCHEMA ${schema};`;
                sqlStatements.push(sql);

                if (!options.dryRun) {
                    try {
                        await target.query(sql);
                        this.logger.success(`Extension: ${ext.extname}`);
                    } catch (e: any) {
                        this.logger.warn(`Extension ${ext.extname} may require superuser privileges`);
                    }
                }
                itemsProcessed++;
            }

            // 2. Migrate Custom Types
            this.logger.info('Migrating custom types...');
            const types = await this.getCustomTypes(source, schema);
            for (const type of types) {
                sqlStatements.push(type.definition);

                if (!options.dryRun) {
                    try {
                        await target.query(type.definition);
                        this.logger.success(`Type: ${type.typename}`);
                    } catch (e: any) {
                        this.logger.warn(`Type ${type.typename}: ${e.message}`);
                    }
                }
                itemsProcessed++;
            }

            // 3. Migrate Tables
            this.logger.info('Migrating table structures...');
            const tables = await this.getTables(source, schema);

            for (const table of tables) {
                if (options.table && table.table_name !== options.table) {
                    continue;
                }

                const createTableSql = await this.getTableDefinition(source, schema, table.table_name);
                sqlStatements.push(createTableSql);

                if (!options.dryRun) {
                    try {
                        await target.query(createTableSql);
                        this.logger.success(`Table: ${table.table_name}`);
                    } catch (e: any) {
                        this.logger.error(`Table ${table.table_name}: ${e.message}`);
                    }
                }
                itemsProcessed++;
            }

            // 4. Migrate Constraints
            this.logger.info('Migrating constraints...');
            const constraints = await this.getConstraints(source, schema);
            for (const constraint of constraints) {
                if (options.table && constraint.table_name !== options.table) {
                    continue;
                }

                sqlStatements.push(constraint.definition);

                if (!options.dryRun) {
                    try {
                        await target.query(constraint.definition);
                        this.logger.success(`Constraint: ${constraint.constraint_name}`);
                    } catch (e: any) {
                        this.logger.warn(`Constraint ${constraint.constraint_name}: ${e.message}`);
                    }
                }
                itemsProcessed++;
            }

            // 5. Migrate Indexes
            this.logger.info('Migrating indexes...');
            const indexes = await this.getIndexes(source, schema);
            for (const index of indexes) {
                if (options.table && index.tablename !== options.table) {
                    continue;
                }

                sqlStatements.push(index.indexdef);

                if (!options.dryRun) {
                    try {
                        await target.query(index.indexdef);
                        this.logger.success(`Index: ${index.indexname}`);
                    } catch (e: any) {
                        this.logger.warn(`Index ${index.indexname}: ${e.message}`);
                    }
                }
                itemsProcessed++;
            }

            // 6. Migrate Views
            this.logger.info('Migrating views...');
            const views = await this.getViews(source, schema);
            for (const view of views) {
                sqlStatements.push(view.definition);

                if (!options.dryRun) {
                    try {
                        await target.query(view.definition);
                        this.logger.success(`View: ${view.viewname}`);
                    } catch (e: any) {
                        this.logger.warn(`View ${view.viewname}: ${e.message}`);
                    }
                }
                itemsProcessed++;
            }

            // Write SQL file
            const sqlContent = sqlStatements.join(';\n\n') + ';';
            const filename = options.table
                ? `schema-${schema}-${options.table}.sql`
                : `schema-${schema}.sql`;
            this.logger.writeSqlFile(filename, sqlContent);

            return {
                success: true,
                message: 'Schema migration completed',
                details: {
                    itemsProcessed,
                    sqlFiles: this.logger.getSqlFiles()
                }
            };

        } finally {
            await source.disconnect();
            await target.disconnect();
        }
    }

    private async getExtensions(db: Database): Promise<any[]> {
        const result = await db.query(`
            SELECT extname 
            FROM pg_extension 
            WHERE extname NOT IN ('plpgsql')
        `);
        return result.rows;
    }

    private async getCustomTypes(db: Database, schema: string): Promise<any[]> {
        const result = await db.query(`
            SELECT 
                t.typname as typename,
                string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) as enumvalues
            FROM pg_type t
            JOIN pg_enum e ON t.oid = e.enumtypid
            JOIN pg_namespace n ON t.typnamespace = n.oid
            WHERE n.nspname = $1
            GROUP BY t.typname
        `, [schema]);

        return result.rows.map((row: any) => ({
            typename: row.typename,
            definition: `CREATE TYPE ${schema}.${row.typename} AS ENUM (${row.enumvalues.split(',').map((v: string) => `'${v}'`).join(', ')})`
        }));
    }

    private async getTables(db: Database, schema: string): Promise<any[]> {
        const result = await db.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = $1 
            AND table_type = 'BASE TABLE'
            ORDER BY table_name
        `, [schema]);
        return result.rows;
    }

    private async getTableDefinition(db: Database, schema: string, tableName: string): Promise<string> {
        const colsRes = await db.query(`
            SELECT 
                column_name, 
                data_type, 
                is_nullable, 
                udt_name, 
                column_default,
                character_maximum_length
            FROM information_schema.columns
            WHERE table_schema = $1 AND table_name = $2
            ORDER BY ordinal_position
        `, [schema, tableName]);

        const colDefs = colsRes.rows.map((c: any) => {
            let type = c.data_type;
            if (type === 'USER-DEFINED') type = c.udt_name;
            if (type === 'ARRAY') type = c.udt_name;
            if (type === 'character varying' && c.character_maximum_length) {
                type = `varchar(${c.character_maximum_length})`;
            }

            let def = `    "${c.column_name}" ${type}`;
            if (c.column_default) def += ` DEFAULT ${c.column_default}`;
            if (c.is_nullable === 'NO') def += ' NOT NULL';

            return def;
        }).join(',\n');

        return `CREATE TABLE IF NOT EXISTS "${schema}"."${tableName}" (\n${colDefs}\n)`;
    }

    private async getConstraints(db: Database, schema: string): Promise<any[]> {
        const result = await db.query(`
            SELECT
                tc.table_name,
                tc.constraint_name,
                tc.constraint_type,
                pg_get_constraintdef(c.oid) as constraint_def
            FROM information_schema.table_constraints tc
            JOIN pg_constraint c ON c.conname = tc.constraint_name
            JOIN pg_namespace n ON n.oid = c.connamespace
            WHERE tc.table_schema = $1
            AND tc.constraint_type IN ('PRIMARY KEY', 'FOREIGN KEY', 'UNIQUE', 'CHECK')
            ORDER BY 
                CASE tc.constraint_type
                    WHEN 'PRIMARY KEY' THEN 1
                    WHEN 'UNIQUE' THEN 2
                    WHEN 'CHECK' THEN 3
                    WHEN 'FOREIGN KEY' THEN 4
                END
        `, [schema]);

        return result.rows.map((row: any) => ({
            table_name: row.table_name,
            constraint_name: row.constraint_name,
            definition: `ALTER TABLE "${schema}"."${row.table_name}" ADD CONSTRAINT "${row.constraint_name}" ${row.constraint_def}`
        }));
    }

    private async getIndexes(db: Database, schema: string): Promise<any[]> {
        const result = await db.query(`
            SELECT
                schemaname,
                tablename,
                indexname,
                indexdef
            FROM pg_indexes
            WHERE schemaname = $1
            AND indexname NOT LIKE '%_pkey'
            ORDER BY tablename, indexname
        `, [schema]);

        return result.rows;
    }

    private async getViews(db: Database, schema: string): Promise<any[]> {
        const result = await db.query(`
            SELECT 
                table_name as viewname,
                view_definition
            FROM information_schema.views
            WHERE table_schema = $1
            ORDER BY table_name
        `, [schema]);

        return result.rows.map((row: any) => ({
            viewname: row.viewname,
            definition: `CREATE OR REPLACE VIEW "${schema}"."${row.viewname}" AS\n${row.view_definition};`
        }));
    }
}
