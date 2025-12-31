#!/usr/bin/env node

import { Command } from 'commander';
import { Logger } from './lib/logger';
import { SchemaCommand } from './commands/schema';
import { DataCommand } from './commands/data';
import { FunctionsCommand } from './commands/functions';
import { TriggersCommand } from './commands/triggers';
import { BucketsCommand } from './commands/buckets';
import { ExportPoliciesCommand } from './commands/export-policies';
import { MigrateAllCommand } from './commands/migrate-all';
import { DeleteCommand } from './commands/delete';
import { ExportCommand } from './commands/export';
import { ImportCommand } from './commands/import';
import { EdgeFunctionsCommand } from './commands/edge-functions';
import { Database } from './lib/database';
import { FunctionsExporter } from './lib/functions-exporter';
import { GlobalOptions } from './types/index';

const program = new Command();

const packageJson = require('../package.json');

program
    .name('supabase-migrator')
    .description('Complete migration and cleanup toolkit for Supabase PostgreSQL databases')
    .version(packageJson.version);

// Global options helper
function addGlobalOptions(cmd: Command): Command {
    return cmd
        .option('-s, --source <url>', 'Source database connection string')
        .option('-t, --target <url>', 'Target database connection string')
        .option('--schema <name>', 'Schema name (default: public)', 'public')
        .option('--table <name>', 'Table name (for table-specific operations)')
        .option('--function <name>', 'Function name (for function-specific operations)')
        .option('--trigger <name>', 'Trigger name (for trigger-specific operations)')
        .option('--bucket <name>', 'Bucket name (for bucket-specific operations)')
        .option('--dry-run', 'Perform a dry run without making changes', false)
        .option('--force', 'Skip confirmation prompts for destructive operations', false)
        .option('--source-url <url>', 'Source Supabase project URL (for storage)')
        .option('--source-key <key>', 'Source Supabase service role key (for storage)')
        .option('--target-url <url>', 'Target Supabase project URL (for storage)')
        .option('--target-key <key>', 'Target Supabase service role key (for storage)')
        .option('--token <token>', 'Supabase Access Token (Personal Access Token)')
        .option('-o, --output <folder>', 'Output folder for SQL files and logs', './supabase-migrator');
}

// migrate:schema
addGlobalOptions(program.command('migrate:schema'))
    .description('Migrate database schema (tables, types, constraints, indexes)')
    .action(async (options: GlobalOptions) => {
        const logger = new Logger(options.output);
        const command = new SchemaCommand(logger);
        try {
            const result = await command.execute(options);
            logger.summary(result);
            process.exit(result.success ? 0 : 1);
        } catch (error: any) {
            logger.error(error.message);
            process.exit(1);
        }
    });

// migrate:data
addGlobalOptions(program.command('migrate:data'))
    .description('Migrate table data')
    .option('--truncate', 'Truncate target tables before inserting data', false)
    .option('--batch-size <n>', 'Batch size for data migration', '1000')
    .action(async (options: GlobalOptions) => {
        options.batchSize = parseInt(options.batchSize as any) || 1000;
        const logger = new Logger(options.output);
        const command = new DataCommand(logger);
        try {
            const result = await command.execute(options);
            logger.summary(result);
            process.exit(result.success ? 0 : 1);
        } catch (error: any) {
            logger.error(error.message);
            process.exit(1);
        }
    });

// migrate:functions
addGlobalOptions(program.command('migrate:functions'))
    .description('Migrate database functions')
    .action(async (options: GlobalOptions) => {
        const logger = new Logger(options.output);
        const command = new FunctionsCommand(logger);
        try {
            const result = await command.execute(options);
            logger.summary(result);
            process.exit(result.success ? 0 : 1);
        } catch (error: any) {
            logger.error(error.message);
            process.exit(1);
        }
    });

// migrate:triggers
addGlobalOptions(program.command('migrate:triggers'))
    .description('Migrate database triggers')
    .action(async (options: GlobalOptions) => {
        const logger = new Logger(options.output);
        const command = new TriggersCommand(logger);
        try {
            const result = await command.execute(options);
            logger.summary(result);
            process.exit(result.success ? 0 : 1);
        } catch (error: any) {
            logger.error(error.message);
            process.exit(1);
        }
    });

// migrate:all
addGlobalOptions(program.command('migrate:all'))
    .description('Migrate everything (schema, functions, triggers, data)')
    .option('--include-data', 'Include data migration (default: true)', true)
    .option('--data-only', 'Migrate only data, skip schema', false)
    .option('--truncate', 'Truncate target tables before inserting data', false)
    .option('--batch-size <n>', 'Batch size for data migration', '1000')
    .action(async (options: GlobalOptions) => {
        options.batchSize = parseInt(options.batchSize as any) || 1000;
        const logger = new Logger(options.output);
        const command = new MigrateAllCommand(logger);
        try {
            const result = await command.execute(options);
            logger.summary(result);
            process.exit(result.success ? 0 : 1);
        } catch (error: any) {
            logger.error(error.message);
            process.exit(1);
        }
    });

// migrate:edge-functions
addGlobalOptions(program.command('migrate:edge-functions'))
    .description('Migrate Supabase Edge Functions between projects')
    .action(async (options: GlobalOptions) => {
        const logger = new Logger(options.output);
        const command = new EdgeFunctionsCommand(logger);
        try {
            const result = await command.execute(options);
            logger.summary(result);
            process.exit(result.success ? 0 : 1);
        } catch (error: any) {
            logger.error(error.message);
            process.exit(1);
        }
    });

// migrate:buckets
addGlobalOptions(program.command('migrate:buckets'))
    .description('Migrate storage buckets')
    .action(async (options: GlobalOptions) => {
        const logger = new Logger(options.output);
        const command = new BucketsCommand(logger);
        try {
            const result = await command.execute(options);
            logger.summary(result);
            process.exit(result.success ? 0 : 1);
        } catch (error: any) {
            logger.error(error.message);
            process.exit(1);
        }
    });

// export:database
addGlobalOptions(program.command('export:database'))
    .description('Export complete database (schema, functions, triggers, data)')
    .option('--include-data', 'Include data export (default: true)', true)
    .option('--data-only', 'Export only data, skip schema', false)
    .option('--format <type>', 'Data export format: sql or json', 'sql')
    .option('--batch-size <n>', 'Batch size for data export', '1000')
    .action(async (options: GlobalOptions) => {
        options.batchSize = parseInt(options.batchSize as any) || 1000;
        const logger = new Logger(options.output);
        const command = new ExportCommand(logger);
        try {
            const result = await command.execute(options);
            logger.summary(result);
            process.exit(result.success ? 0 : 1);
        } catch (error: any) {
            logger.error(error.message);
            process.exit(1);
        }
    });

// export:functions
addGlobalOptions(program.command('export:functions'))
    .description('Export only functions from a schema to SQL file')
    .action(async (options: GlobalOptions) => {
        if (!options.source) {
            console.error('Error: --source is required');
            process.exit(1);
        }
        const logger = new Logger(options.output);
        const db = new Database({ connectionString: options.source });
        try {
            await db.connect();
            const outputDir = options.output || './supabase-migrator';
            const schema = options.schema || 'public';
            const exporter = new FunctionsExporter(db, logger, outputDir);
            const file = await exporter.exportFunctions(schema);
            if (file) {
                logger.info(`Exported to: ${file}`);
            }
            process.exit(0);
        } catch (error: any) {
            logger.error(error.message);
            process.exit(1);
        } finally {
            await db.disconnect();
        }
    });

// export:bucket-policies
addGlobalOptions(program.command('export:bucket-policies'))
    .description('Export storage bucket policies to SQL file')
    .action(async (options: GlobalOptions) => {
        const logger = new Logger(options.output);
        const command = new ExportPoliciesCommand(logger);
        try {
            const result = await command.execute(options);
            logger.summary(result);
            process.exit(result.success ? 0 : 1);
        } catch (error: any) {
            logger.error(error.message);
            process.exit(1);
        }
    });

// import:database
addGlobalOptions(program.command('import:database'))
    .description('Import database from SQL files (apply migrations)')
    .option('--source <dir>', 'Migration directory containing SQL files (overrides --source connection string)')
    .action(async (options: GlobalOptions) => {
        const logger = new Logger(options.output);
        const command = new ImportCommand(logger);
        try {
            // For import, --source is the migration directory, not a connection string
            // --target is the database connection string
            const result = await command.execute(options);
            logger.summary(result);
            process.exit(result.success ? 0 : 1);
        } catch (error: any) {
            logger.error(error.message);
            process.exit(1);
        }
    });


// delete:data
addGlobalOptions(program.command('delete:data'))
    .description('Delete data from one table or all tables')
    .option('--all', 'Delete data from all tables in schema')
    .option('--truncate', 'Use TRUNCATE instead of DELETE (default: true)', true)
    .option('--restart-identity', 'Restart identity sequences (default: true)', true)
    .option('--cascade', 'Use CASCADE option (default: true)', true)
    .option('--exclude-table <name>', 'Exclude table from deletion (repeatable)', (value: string, previous: string[]) => {
        return previous ? [...previous, value] : [value];
    }, [])
    .action(async (options: GlobalOptions) => {
        const logger = new Logger(options.output);
        const command = new DeleteCommand(logger);
        try {
            const result = await command.deleteData(options);
            logger.summary(result);
            process.exit(result.success ? 0 : 1);
        } catch (error: any) {
            logger.error(error.message);
            process.exit(1);
        }
    });


// delete:function
addGlobalOptions(program.command('delete:function'))
    .description('Delete one function or all functions')
    .option('--all', 'Delete all functions in schema')
    .option('--signature <sig>', 'Function signature for overloaded functions (e.g., "my_func(text, int)")')
    .action(async (options: GlobalOptions) => {
        const logger = new Logger(options.output);
        const command = new DeleteCommand(logger);
        try {
            const result = await command.deleteFunction(options);
            logger.summary(result);
            process.exit(result.success ? 0 : 1);
        } catch (error: any) {
            logger.error(error.message);
            process.exit(1);
        }
    });


// delete:trigger
addGlobalOptions(program.command('delete:trigger'))
    .description('Delete one trigger or all triggers')
    .option('--all', 'Delete all triggers in schema')
    .action(async (options: GlobalOptions) => {
        const logger = new Logger(options.output);
        const command = new DeleteCommand(logger);
        try {
            const result = await command.deleteTrigger(options);
            logger.summary(result);
            process.exit(result.success ? 0 : 1);
        } catch (error: any) {
            logger.error(error.message);
            process.exit(1);
        }
    });

// delete:all
addGlobalOptions(program.command('delete:all'))
    .description('FULL CLEANUP: Delete all triggers, functions, and tables in schema')
    .action(async (options: GlobalOptions) => {
        const logger = new Logger(options.output);
        const command = new DeleteCommand(logger);
        try {
            const result = await command.deleteAll(options);
            logger.summary(result);
            process.exit(result.success ? 0 : 1);
        } catch (error: any) {
            logger.error(error.message);
            process.exit(1);
        }
    });

program.parse();
