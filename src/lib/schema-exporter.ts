import { Database } from '../lib/database';
import { Logger } from '../lib/logger';
import * as fs from 'fs';
import * as path from 'path';

export class SchemaExporter {
    private db: Database;
    private logger: Logger;
    private outputDir: string;

    constructor(db: Database, logger: Logger, outputDir: string) {
        this.db = db;
        this.logger = logger;
        this.outputDir = outputDir;
    }

    async exportSchema(schemaName: string = 'public'): Promise<string[]> {
        const sqlFiles: string[] = [];
        const sqlStatements: string[] = [];

        // Header
        sqlStatements.push(`-- Schema: ${schemaName}`);
        sqlStatements.push(`-- Generated: ${new Date().toISOString()}`);
        sqlStatements.push('');

        // 1. Create schema if not exists
        sqlStatements.push(`CREATE SCHEMA IF NOT EXISTS "${schemaName}";`);
        sqlStatements.push('');

        // 2. Extensions
        this.logger.info('Exporting extensions...');
        const extensions = await this.getExtensions();
        if (extensions.length > 0) {
            sqlStatements.push('-- Extensions');
            for (const ext of extensions) {
                sqlStatements.push(`CREATE EXTENSION IF NOT EXISTS "${ext.extname}" SCHEMA ${ext.extnamespace || 'public'};`);
            }
            sqlStatements.push('');
        }

        // 3. Custom Types (Enums)
        this.logger.info('Exporting custom types...');
        const types = await this.getCustomTypes(schemaName);
        if (types.length > 0) {
            sqlStatements.push('-- Custom Types');
            for (const type of types) {
                sqlStatements.push(type.definition);
            }
            sqlStatements.push('');
        }

        // 4. Sequences
        this.logger.info('Exporting sequences...');
        const sequences = await this.getSequences(schemaName);
        if (sequences.length > 0) {
            sqlStatements.push('-- Sequences');
            for (const seq of sequences) {
                sqlStatements.push(seq.definition);
            }
            sqlStatements.push('');
        }

        // 5. Tables
        this.logger.info('Exporting tables...');
        const tables = await this.getTables(schemaName);
        if (tables.length > 0) {
            sqlStatements.push('-- Tables');
            for (const table of tables) {
                const tableDef = await this.getTableDefinition(schemaName, table.table_name);
                sqlStatements.push(tableDef);
                sqlStatements.push('');
            }
        }

        // 6. Primary Keys and Unique Constraints
        this.logger.info('Exporting constraints...');
        const constraints = await this.getConstraints(schemaName, ['PRIMARY KEY', 'UNIQUE']);
        if (constraints.length > 0) {
            sqlStatements.push('-- Primary Keys and Unique Constraints');
            for (const constraint of constraints) {
                sqlStatements.push(constraint.definition + ';');
            }
            sqlStatements.push('');
        }

        // 7. Indexes
        this.logger.info('Exporting indexes...');
        const indexes = await this.getIndexes(schemaName);
        if (indexes.length > 0) {
            sqlStatements.push('-- Indexes');
            for (const index of indexes) {
                sqlStatements.push(index.indexdef + ';');
            }
            sqlStatements.push('');
        }

        // 8. Foreign Keys
        const foreignKeys = await this.getConstraints(schemaName, ['FOREIGN KEY']);
        if (foreignKeys.length > 0) {
            sqlStatements.push('-- Foreign Keys');
            for (const fk of foreignKeys) {
                sqlStatements.push(fk.definition + ';');
            }
            sqlStatements.push('');
        }

        // 9. Check Constraints
        const checkConstraints = await this.getConstraints(schemaName, ['CHECK']);
        if (checkConstraints.length > 0) {
            sqlStatements.push('-- Check Constraints');
            for (const check of checkConstraints) {
                sqlStatements.push(check.definition + ';');
            }
            sqlStatements.push('');
        }

        // 10. Views
        this.logger.info('Exporting views...');
        const views = await this.getViews(schemaName);
        if (views.length > 0) {
            sqlStatements.push('-- Views');
            for (const view of views) {
                sqlStatements.push(view.definition);
                sqlStatements.push('');
            }
        }

        // Write schema.sql
        const schemaFile = path.join(this.outputDir, `schema-${schemaName}.sql`);
        fs.writeFileSync(schemaFile, sqlStatements.join('\n'));
        sqlFiles.push(schemaFile);
        this.logger.success(`Schema exported: ${schemaFile}`);

        return sqlFiles;
    }

    private async getExtensions(): Promise<any[]> {
        const result = await this.db.query(`
            SELECT 
                e.extname,
                n.nspname as extnamespace
            FROM pg_extension e
            LEFT JOIN pg_namespace n ON e.extnamespace = n.oid
            WHERE e.extname NOT IN ('plpgsql')
            ORDER BY e.extname
        `);
        return result.rows;
    }

    private async getCustomTypes(schemaName: string): Promise<any[]> {
        const result = await this.db.query(`
            SELECT 
                t.typname as typename,
                array_agg(e.enumlabel ORDER BY e.enumsortorder) as enumvalues
            FROM pg_type t
            JOIN pg_enum e ON t.oid = e.enumtypid
            JOIN pg_namespace n ON t.typnamespace = n.oid
            WHERE n.nspname = $1
            GROUP BY t.typname
            ORDER BY t.typname
        `, [schemaName]);

        return result.rows.map((row: any) => ({
            typename: row.typename,
            definition: `CREATE TYPE "${schemaName}"."${row.typename}" AS ENUM (${row.enumvalues.map((v: string) => `'${v}'`).join(', ')});`
        }));
    }

    private async getSequences(schemaName: string): Promise<any[]> {
        const result = await this.db.query(`
            SELECT 
                sequence_name,
                data_type,
                start_value,
                minimum_value,
                maximum_value,
                increment
            FROM information_schema.sequences
            WHERE sequence_schema = $1
            ORDER BY sequence_name
        `, [schemaName]);

        return result.rows.map((row: any) => ({
            sequence_name: row.sequence_name,
            definition: `CREATE SEQUENCE IF NOT EXISTS "${schemaName}"."${row.sequence_name}" AS ${row.data_type} INCREMENT ${row.increment} MINVALUE ${row.minimum_value} MAXVALUE ${row.maximum_value} START ${row.start_value};`
        }));
    }

    private async getTables(schemaName: string): Promise<any[]> {
        const result = await this.db.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = $1 
            AND table_type = 'BASE TABLE'
            ORDER BY table_name
        `, [schemaName]);
        return result.rows;
    }

    private async getTableDefinition(schemaName: string, tableName: string): Promise<string> {
        const colsRes = await this.db.query(`
            SELECT 
                column_name, 
                data_type, 
                is_nullable, 
                udt_name, 
                column_default,
                character_maximum_length,
                numeric_precision,
                numeric_scale
            FROM information_schema.columns
            WHERE table_schema = $1 AND table_name = $2
            ORDER BY ordinal_position
        `, [schemaName, tableName]);

        const columns = colsRes.rows.map((c: any) => {
            let type = c.data_type;

            // Handle specific types
            if (type === 'USER-DEFINED') {
                type = `"${schemaName}"."${c.udt_name}"`;
            } else if (type === 'ARRAY') {
                type = c.udt_name;
            } else if (type === 'character varying' && c.character_maximum_length) {
                type = `varchar(${c.character_maximum_length})`;
            } else if (type === 'character' && c.character_maximum_length) {
                type = `char(${c.character_maximum_length})`;
            } else if (type === 'numeric' && c.numeric_precision) {
                if (c.numeric_scale) {
                    type = `numeric(${c.numeric_precision},${c.numeric_scale})`;
                } else {
                    type = `numeric(${c.numeric_precision})`;
                }
            }

            let def = `    "${c.column_name}" ${type}`;

            if (c.column_default) {
                def += ` DEFAULT ${c.column_default}`;
            }

            if (c.is_nullable === 'NO') {
                def += ' NOT NULL';
            }

            return def;
        }).join(',\n');

        return `CREATE TABLE IF NOT EXISTS "${schemaName}"."${tableName}" (\n${columns}\n);`;
    }

    private async getConstraints(schemaName: string, types: string[]): Promise<any[]> {
        const result = await this.db.query(`
            SELECT
                tc.table_name,
                tc.constraint_name,
                tc.constraint_type,
                pg_get_constraintdef(c.oid) as constraint_def
            FROM information_schema.table_constraints tc
            JOIN pg_constraint c ON c.conname = tc.constraint_name
            JOIN pg_namespace n ON n.oid = c.connamespace
            WHERE tc.table_schema = $1
            AND tc.constraint_type = ANY($2)
            ORDER BY 
                CASE tc.constraint_type
                    WHEN 'PRIMARY KEY' THEN 1
                    WHEN 'UNIQUE' THEN 2
                    WHEN 'CHECK' THEN 3
                    WHEN 'FOREIGN KEY' THEN 4
                END,
                tc.table_name,
                tc.constraint_name
        `, [schemaName, types]);

        return result.rows.map((row: any) => ({
            table_name: row.table_name,
            constraint_name: row.constraint_name,
            constraint_type: row.constraint_type,
            definition: `ALTER TABLE "${schemaName}"."${row.table_name}" ADD CONSTRAINT "${row.constraint_name}" ${row.constraint_def}`
        }));
    }

    private async getIndexes(schemaName: string): Promise<any[]> {
        const result = await this.db.query(`
            SELECT
                schemaname,
                tablename,
                indexname,
                indexdef
            FROM pg_indexes
            WHERE schemaname = $1
            AND indexname NOT LIKE '%_pkey'
            AND indexname NOT IN (
                SELECT constraint_name 
                FROM information_schema.table_constraints 
                WHERE table_schema = $1 
                AND constraint_type IN ('PRIMARY KEY', 'UNIQUE')
            )
            ORDER BY tablename, indexname
        `, [schemaName]);

        return result.rows;
    }

    private async getViews(schemaName: string): Promise<any[]> {
        const result = await this.db.query(`
            SELECT 
                table_name as viewname,
                view_definition
            FROM information_schema.views
            WHERE table_schema = $1
            ORDER BY table_name
        `, [schemaName]);

        return result.rows.map((row: any) => ({
            viewname: row.viewname,
            definition: `CREATE OR REPLACE VIEW "${schemaName}"."${row.viewname}" AS\n${row.view_definition};`
        }));
    }
}
