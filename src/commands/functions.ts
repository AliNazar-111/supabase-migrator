import { Database } from '../lib/database';
import { Logger } from '../lib/logger';
import { GlobalOptions, MigrationResult, FunctionInfo } from '../types/index';

export class FunctionsCommand {
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
            const functions = await this.getFunctions(source, schema, options.function);

            this.logger.info(`Found ${functions.length} function(s)`);

            const sqlStatements: string[] = [];
            let itemsProcessed = 0;
            const errors: string[] = [];

            for (const func of functions) {
                sqlStatements.push(func.definition);

                if (!options.dryRun) {
                    try {
                        await target.query(func.definition);
                        this.logger.success(`Function: ${func.name}`);
                    } catch (e: any) {
                        const errorMsg = `${func.name}: ${e.message}`;
                        this.logger.error(errorMsg);
                        errors.push(errorMsg);
                    }
                }
                itemsProcessed++;
            }

            // Write SQL file
            const sqlContent = sqlStatements.join('\n\n');
            const filename = options.function
                ? `functions-${schema}-${options.function}.sql`
                : `functions-${schema}.sql`;
            this.logger.writeSqlFile(filename, sqlContent);

            return {
                success: errors.length === 0,
                message: `Functions migration completed`,
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

    private async getFunctions(db: Database, schema: string, functionName?: string): Promise<FunctionInfo[]> {
        let query = `
            SELECT 
                n.nspname as schema,
                p.proname as name,
                pg_get_functiondef(p.oid) as definition,
                l.lanname as language
            FROM pg_proc p
            JOIN pg_namespace n ON p.pronamespace = n.oid
            JOIN pg_language l ON p.prolang = l.oid
            LEFT JOIN pg_depend d ON d.objid = p.oid AND d.deptype = 'e'
            WHERE n.nspname = $1
            AND d.objid IS NULL -- Exclude extension-owned functions
        `;

        const params: any[] = [schema];

        if (functionName) {
            query += ` AND p.proname = $2`;
            params.push(functionName);
        }

        query += ` ORDER BY p.proname`;

        const result = await db.query(query, params);
        return result.rows;
    }
}
