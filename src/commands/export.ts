import { Database } from '../lib/database';
import { Logger } from '../lib/logger';
import { SchemaExporter } from '../lib/schema-exporter';
import { FunctionsExporter } from '../lib/functions-exporter';
import { TriggersExporter } from '../lib/triggers-exporter';
import { DataExporter } from '../lib/data-exporter';
import { GlobalOptions, MigrationResult } from '../types/index';

export class ExportCommand {
    private logger: Logger;

    constructor(logger: Logger) {
        this.logger = logger;
    }

    async execute(options: GlobalOptions): Promise<MigrationResult> {
        if (!options.source) {
            throw new Error('--source is required');
        }

        const db = new Database({ connectionString: options.source });

        try {
            await db.connect();

            this.logger.info(`Source: ${db.getMaskedConnectionString()}`);
            this.logger.info(`Output: ${options.output || './supabase-migrator'}`);

            const schema = options.schema || 'public';
            const outputDir = options.output || './supabase-migrator';
            const allFiles: string[] = [];

            // 1. Export Schema
            if (!options.dataOnly) {
                this.logger.info('\n' + '='.repeat(60));
                this.logger.info('EXPORTING SCHEMA');
                this.logger.info('='.repeat(60));

                const schemaExporter = new SchemaExporter(db, this.logger, outputDir);
                const schemaFiles = await schemaExporter.exportSchema(schema);
                allFiles.push(...schemaFiles);

                // 2. Export Functions
                this.logger.info('\n' + '='.repeat(60));
                this.logger.info('EXPORTING FUNCTIONS');
                this.logger.info('='.repeat(60));

                const functionsExporter = new FunctionsExporter(db, this.logger, outputDir);
                const functionsFile = await functionsExporter.exportFunctions(schema);
                if (functionsFile) allFiles.push(functionsFile);

                // 3. Export Triggers
                this.logger.info('\n' + '='.repeat(60));
                this.logger.info('EXPORTING TRIGGERS');
                this.logger.info('='.repeat(60));

                const triggersExporter = new TriggersExporter(db, this.logger, outputDir);
                const triggersFile = await triggersExporter.exportTriggers(schema);
                if (triggersFile) allFiles.push(triggersFile);
            }

            // 4. Export Data
            if (options.includeData !== false) {
                this.logger.info('\n' + '='.repeat(60));
                this.logger.info('EXPORTING DATA');
                this.logger.info('='.repeat(60));

                const dataExporter = new DataExporter(db, this.logger, outputDir);
                const format = (options as any).format || 'sql';
                const batchSize = options.batchSize || 1000;

                const dataFiles = await dataExporter.exportData(schema, {
                    format,
                    batchSize,
                    tableName: options.table
                });

                allFiles.push(...dataFiles);
            }

            this.logger.info('\n' + '='.repeat(60));
            this.logger.info('EXPORT SUMMARY');
            this.logger.info('='.repeat(60));
            this.logger.info(`Total files generated: ${allFiles.length}`);
            this.logger.info(`Output directory: ${outputDir}`);

            return {
                success: true,
                message: `Export completed successfully`,
                details: {
                    itemsProcessed: allFiles.length,
                    sqlFiles: allFiles
                }
            };

        } finally {
            await db.disconnect();
        }
    }
}
