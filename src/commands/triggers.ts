import { Database } from '../lib/database';
import { Logger } from '../lib/logger';
import { GlobalOptions, MigrationResult, TriggerInfo } from '../types';

export class TriggersCommand {
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
            const triggers = await this.getTriggers(source, schema, options.trigger, options.table);

            this.logger.info(`Found ${triggers.length} trigger(s)`);

            const sqlStatements: string[] = [];
            let itemsProcessed = 0;
            const errors: string[] = [];

            for (const trigger of triggers) {
                sqlStatements.push(trigger.definition);

                if (!options.dryRun) {
                    try {
                        await target.query(trigger.definition);
                        this.logger.success(`Trigger: ${trigger.trigger_name} on ${trigger.table_name}`);
                    } catch (e: any) {
                        const errorMsg = `${trigger.trigger_name}: ${e.message}`;
                        this.logger.error(errorMsg);
                        errors.push(errorMsg);
                    }
                }
                itemsProcessed++;
            }

            // Write SQL file
            const sqlContent = sqlStatements.join('\n\n');
            const filename = options.trigger
                ? `triggers-${schema}-${options.trigger}.sql`
                : `triggers-${schema}.sql`;
            this.logger.writeSqlFile(filename, sqlContent);

            return {
                success: errors.length === 0,
                message: `Triggers migration completed`,
                details: {
                    itemsProcessed,
                    errors: errors.length > 0 ? errors : undefined,
                    sqlFiles: this.logger.getSqlFiles()
                }
            };

        } finally {
            await source.disconnect();
            await target.disconnect();
        }
    }

    private async getTriggers(
        db: Database,
        schema: string,
        triggerName?: string,
        tableName?: string
    ): Promise<TriggerInfo[]> {
        let query = `
            SELECT 
                n.nspname as schema,
                c.relname as table_name,
                t.tgname as trigger_name,
                pg_get_triggerdef(t.oid) as definition,
                CASE 
                    WHEN t.tgtype & 2 = 2 THEN 'BEFORE'
                    WHEN t.tgtype & 64 = 64 THEN 'INSTEAD OF'
                    ELSE 'AFTER'
                END as event
            FROM pg_trigger t
            JOIN pg_class c ON t.tgrelid = c.oid
            JOIN pg_namespace n ON c.relnamespace = n.oid
            WHERE n.nspname = $1 
            AND NOT t.tgisinternal
        `;

        const params: any[] = [schema];
        let paramIndex = 2;

        if (triggerName) {
            query += ` AND t.tgname = $${paramIndex}`;
            params.push(triggerName);
            paramIndex++;
        }

        if (tableName) {
            query += ` AND c.relname = $${paramIndex}`;
            params.push(tableName);
        }

        query += ` ORDER BY c.relname, t.tgname`;

        const result = await db.query(query, params);
        return result.rows;
    }
}
