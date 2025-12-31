import { SchemaCommand } from './schema';
import { DataCommand } from './data';
import { FunctionsCommand } from './functions';
import { TriggersCommand } from './triggers';
import { Logger } from '../lib/logger';
import { GlobalOptions, MigrationResult } from '../types/index';

export class MigrateAllCommand {
    private logger: Logger;

    constructor(logger: Logger) {
        this.logger = logger;
    }

    async execute(options: GlobalOptions): Promise<MigrationResult> {
        if (!options.source || !options.target) {
            throw new Error('Both --source and --target are required');
        }

        this.logger.info('Starting complete migration...');
        this.logger.info('This will migrate: schema, functions, triggers, and data');

        const results: any[] = [];
        let totalErrors: string[] = [];

        try {
            // 1. Migrate Schema
            this.logger.info('\n' + '='.repeat(60));
            this.logger.info('STEP 1: Migrating Schema');
            this.logger.info('='.repeat(60));
            const schemaCmd = new SchemaCommand(this.logger);
            const schemaResult = await schemaCmd.execute(options);
            results.push({ step: 'schema', ...schemaResult });
            if (schemaResult.details?.errors) {
                totalErrors = totalErrors.concat(schemaResult.details.errors);
            }

            // 2. Migrate Functions
            this.logger.info('\n' + '='.repeat(60));
            this.logger.info('STEP 2: Migrating Functions');
            this.logger.info('='.repeat(60));
            const functionsCmd = new FunctionsCommand(this.logger);
            const functionsResult = await functionsCmd.execute(options);
            results.push({ step: 'functions', ...functionsResult });
            if (functionsResult.details?.errors) {
                totalErrors = totalErrors.concat(functionsResult.details.errors);
            }

            // 3. Migrate Triggers
            this.logger.info('\n' + '='.repeat(60));
            this.logger.info('STEP 3: Migrating Triggers');
            this.logger.info('='.repeat(60));
            const triggersCmd = new TriggersCommand(this.logger);
            const triggersResult = await triggersCmd.execute(options);
            results.push({ step: 'triggers', ...triggersResult });
            if (triggersResult.details?.errors) {
                totalErrors = totalErrors.concat(triggersResult.details.errors);
            }

            // 4. Migrate Data (if not schema-only)
            if (!options.dataOnly && options.includeData !== false) {
                this.logger.info('\n' + '='.repeat(60));
                this.logger.info('STEP 4: Migrating Data');
                this.logger.info('='.repeat(60));
                const dataCmd = new DataCommand(this.logger);
                const dataResult = await dataCmd.execute(options);
                results.push({ step: 'data', ...dataResult });
                if (dataResult.details?.errors) {
                    totalErrors = totalErrors.concat(dataResult.details.errors);
                }
            }

            // Summary
            this.logger.info('\n' + '='.repeat(60));
            this.logger.info('MIGRATION SUMMARY');
            this.logger.info('='.repeat(60));

            for (const result of results) {
                const status = result.success ? '' : '';
                this.logger.info(`${status} ${result.step}: ${result.message}`);
            }

            const allSuccess = results.every(r => r.success);

            return {
                success: allSuccess,
                message: allSuccess
                    ? 'Complete migration finished successfully'
                    : 'Complete migration finished with errors',
                details: {
                    itemsProcessed: results.reduce((sum, r) => sum + (r.details?.itemsProcessed || 0), 0),
                    rowsMigrated: results.reduce((sum, r) => sum + (r.details?.rowsMigrated || 0), 0),
                    errors: totalErrors.length > 0 ? totalErrors : undefined,
                    sqlFiles: this.logger.getSqlFiles()
                }
            };

        } catch (error: any) {
            return {
                success: false,
                message: `Migration failed: ${error.message}`,
                details: {
                    errors: [error.message]
                }
            };
        }
    }
}
