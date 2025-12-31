import { Database } from '../lib/database';
import { Logger } from '../lib/logger';
import * as fs from 'fs';
import * as path from 'path';

export class FunctionsExporter {
    private db: Database;
    private logger: Logger;
    private outputDir: string;

    constructor(db: Database, logger: Logger, outputDir: string) {
        this.db = db;
        this.logger = logger;
        this.outputDir = outputDir;
    }

    async exportFunctions(schemaName: string = 'public'): Promise<string> {
        this.logger.info('Exporting functions...');

        const functions = await this.getFunctions(schemaName);

        if (functions.length === 0) {
            this.logger.info('No functions found');
            return '';
        }

        const sqlStatements: string[] = [];

        sqlStatements.push(`-- Functions for schema: ${schemaName}`);
        sqlStatements.push(`-- Generated: ${new Date().toISOString()}`);
        sqlStatements.push('');

        for (const func of functions) {
            sqlStatements.push(`-- Function: ${func.name}`);
            sqlStatements.push(func.definition);
            sqlStatements.push('');
        }

        const functionsFile = path.join(this.outputDir, `functions-${schemaName}.sql`);
        fs.writeFileSync(functionsFile, sqlStatements.join('\n'));

        this.logger.success(`Functions exported: ${functionsFile} (${functions.length} functions)`);

        return functionsFile;
    }

    private async getFunctions(schemaName: string): Promise<any[]> {
        const result = await this.db.query(`
            SELECT 
                n.nspname as schema,
                p.proname as name,
                pg_get_functiondef(p.oid) as definition,
                l.lanname as language,
                CASE 
                    WHEN p.provolatile = 'i' THEN 'IMMUTABLE'
                    WHEN p.provolatile = 's' THEN 'STABLE'
                    ELSE 'VOLATILE'
                END as volatility
            FROM pg_proc p
            JOIN pg_namespace n ON p.pronamespace = n.oid
            JOIN pg_language l ON p.prolang = l.oid
            LEFT JOIN pg_depend d ON d.objid = p.oid AND d.deptype = 'e'
            WHERE n.nspname = $1
            AND p.prokind = 'f' 
            AND d.objid IS NULL -- Exclude extension-owned functions
            ORDER BY p.proname
        `, [schemaName]);

        return result.rows;
    }
}
