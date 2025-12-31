import { MigrateAllCommand } from '../src/commands/migrate-all';
import { Logger } from '../src/lib/logger';
import * as dotenv from 'dotenv';

dotenv.config();

async function runCompleteMigration() {
    const logger = new Logger('./output');
    const command = new MigrateAllCommand(logger);

    const options = {
        source: process.env.SOURCE_CONNECTION_STRING,
        target: process.env.TARGET_CONNECTION_STRING,
        schema: 'public',
        includeData: true,
        batchSize: 1000,
        dryRun: false
    };

    if (!options.source || !options.target) {
        console.error('Please set SOURCE_CONNECTION_STRING and TARGET_CONNECTION_STRING in .env');
        process.exit(1);
    }

    console.log('Starting complete migration from example script...');
    const result = await command.execute(options);

    if (result.success) {
        console.log('Migration completed successfully!');
    } else {
        console.error('Migration failed with errors:', result.details?.errors);
    }
}

runCompleteMigration().catch(console.error);
