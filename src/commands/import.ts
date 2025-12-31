import { Database } from '../lib/database';
import { Logger } from '../lib/logger';
import { MigrationRunner } from '../lib/migration-runner';
import { GlobalOptions, MigrationResult } from '../types/index';

export class ImportCommand {
    private logger: Logger;

    constructor(logger: Logger) {
        this.logger = logger;
    }

    async execute(options: GlobalOptions): Promise<MigrationResult> {
        if (!options.target) {
            throw new Error('--target is required');
        }

        if (!options.source) {
            throw new Error('--source (migration directory) is required');
        }

        const db = new Database({ connectionString: options.target });

        try {
            await db.connect();

            this.logger.info(`Target: ${db.getMaskedConnectionString()}`);
            this.logger.info(`Migration Directory: ${options.source}`);

            const schema = options.schema || 'public';
            const dryRun = options.dryRun || false;

            if (dryRun) {
                this.logger.warn('[DRY RUN MODE] No changes will be applied');
            }

            const runner = new MigrationRunner(db, this.logger, dryRun);
            const results = await runner.runMigrations(options.source, schema);

            // Summary
            this.logger.info('\n' + '='.repeat(60));
            this.logger.info('MIGRATION SUMMARY');
            this.logger.info('='.repeat(60));

            const succeeded = results.filter(r => r.status === 'succeeded').length;
            const failed = results.filter(r => r.status === 'failed').length;
            const skipped = results.filter(r => r.status === 'skipped').length;

            this.logger.info(`Total steps: ${results.length}`);
            this.logger.success(`Succeeded: ${succeeded}`);
            if (failed > 0) {
                this.logger.error(`Failed: ${failed}`);
            }
            if (skipped > 0) {
                this.logger.warn(`Skipped: ${skipped}`);
            }

            // Detailed results
            this.logger.info('\nDetailed Results:');
            for (const result of results) {
                const icon = result.status === 'succeeded' ? '' :
                    result.status === 'failed' ? '' :
                        result.status === 'skipped' ? '⏭️' : '⏳';

                const duration = result.duration ? ` (${result.duration}ms)` : '';
                this.logger.info(`${icon} ${result.step}${duration}`);

                if (result.error) {
                    this.logger.error(`   Error: ${result.error}`);
                }
            }

            const allSucceeded = failed === 0;

            return {
                success: allSucceeded,
                message: allSucceeded
                    ? `Migration completed successfully (${succeeded} steps)`
                    : `Migration completed with ${failed} error(s)`,
                details: {
                    itemsProcessed: results.length,
                    errors: results.filter(r => r.status === 'failed').map(r => r.error || 'Unknown error')
                }
            };

        } finally {
            await db.disconnect();
        }
    }
}
