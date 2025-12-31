import { ExportCommand } from '../src/commands/export';
import { ImportCommand } from '../src/commands/import';
import { Logger } from '../src/lib/logger';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config();

/**
 * This example demonstrates the Export-then-Import workflow
 * which is safer and allows for manual review of SQL files.
 */
async function runExportImportWorkflow() {
    const outputDir = './export-test';
    const logger = new Logger(outputDir);

    const sourceDb = process.env.SOURCE_CONNECTION_STRING;
    const targetDb = process.env.TARGET_CONNECTION_STRING;

    if (!sourceDb || !targetDb) {
        console.error('Please set SOURCE_CONNECTION_STRING and TARGET_CONNECTION_STRING in .env');
        process.exit(1);
    }

    // 1. Export
    console.log('--- STEP 1: EXPORTING ---');
    const exportCmd = new ExportCommand(logger);
    await exportCmd.execute({
        source: sourceDb,
        schema: 'public',
        includeData: true,
        output: outputDir
    });

    // 2. Import (Dry Run)
    console.log('\n--- STEP 2: IMPORTING (DRY RUN) ---');
    const importCmd = new ImportCommand(logger);
    await importCmd.execute({
        target: targetDb,
        source: outputDir, // For import command, source is the migration directory
        dryRun: true
    });

    console.log('\nWorkflow completed! Check the output directory for SQL files.');
    console.log('To apply the changes, run the import command with dryRun: false');
}

runExportImportWorkflow().catch(console.error);
