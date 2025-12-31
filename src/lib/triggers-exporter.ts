import { Database } from '../lib/database';
import { Logger } from '../lib/logger';
import * as fs from 'fs';
import * as path from 'path';

export class TriggersExporter {
    private db: Database;
    private logger: Logger;
    private outputDir: string;

    constructor(db: Database, logger: Logger, outputDir: string) {
        this.db = db;
        this.logger = logger;
        this.outputDir = outputDir;
    }

    async exportTriggers(schemaName: string = 'public'): Promise<string> {
        this.logger.info('Exporting triggers...');

        const triggers = await this.getTriggers(schemaName);

        if (triggers.length === 0) {
            this.logger.info('No triggers found');
            return '';
        }

        const sqlStatements: string[] = [];

        sqlStatements.push(`-- Triggers for schema: ${schemaName}`);
        sqlStatements.push(`-- Generated: ${new Date().toISOString()}`);
        sqlStatements.push('');

        for (const trigger of triggers) {
            sqlStatements.push(`-- Trigger: ${trigger.trigger_name} on ${trigger.table_name}`);
            sqlStatements.push(trigger.definition + ';');
            sqlStatements.push('');
        }

        const triggersFile = path.join(this.outputDir, `triggers-${schemaName}.sql`);
        fs.writeFileSync(triggersFile, sqlStatements.join('\n'));

        this.logger.success(`Triggers exported: ${triggersFile} (${triggers.length} triggers)`);

        return triggersFile;
    }

    private async getTriggers(schemaName: string): Promise<any[]> {
        const result = await this.db.query(`
            SELECT 
                n.nspname as schema,
                c.relname as table_name,
                t.tgname as trigger_name,
                pg_get_triggerdef(t.oid) as definition,
                CASE 
                    WHEN t.tgtype & 2 = 2 THEN 'BEFORE'
                    WHEN t.tgtype & 64 = 64 THEN 'INSTEAD OF'
                    ELSE 'AFTER'
                END as timing,
                CASE 
                    WHEN t.tgtype & 4 = 4 THEN 'INSERT'
                    WHEN t.tgtype & 8 = 8 THEN 'DELETE'
                    WHEN t.tgtype & 16 = 16 THEN 'UPDATE'
                    ELSE 'OTHER'
                END as event
            FROM pg_trigger t
            JOIN pg_class c ON t.tgrelid = c.oid
            JOIN pg_namespace n ON c.relnamespace = n.oid
            WHERE n.nspname = $1 
            AND NOT t.tgisinternal
            ORDER BY c.relname, t.tgname
        `, [schemaName]);

        return result.rows;
    }
}
