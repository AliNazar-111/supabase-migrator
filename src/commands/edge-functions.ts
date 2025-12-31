import { execSync } from 'child_process';
import { Logger } from '../lib/logger';
import { GlobalOptions, MigrationResult } from '../types/index';
import * as fs from 'fs';
import * as path from 'path';

export class EdgeFunctionsCommand {
    private logger: Logger;

    constructor(logger: Logger) {
        this.logger = logger;
    }

    async execute(options: GlobalOptions): Promise<MigrationResult> {
        if (!options.source || !options.target) {
            throw new Error('Both --source and --target connection strings are required to extract project references');
        }

        const sourceRef = this.extractProjectRef(options.source);
        const targetRef = this.extractProjectRef(options.target);

        this.logger.info(`Source Project Ref: ${sourceRef}`);
        this.logger.info(`Target Project Ref: ${targetRef}`);

        if (options.token) {
            process.env.SUPABASE_ACCESS_TOKEN = options.token;
        }

        try {
            // 1. List functions from source
            this.logger.info('Fetching edge functions from source...');
            const functions = this.listFunctions(sourceRef);

            if (functions.length === 0) {
                return {
                    success: true,
                    message: 'No edge functions found in source project'
                };
            }

            this.logger.info(`Found ${functions.length} function(s): ${functions.join(', ')}`);

            const tempDir = path.join(process.cwd(), 'temp_edge_functions');
            if (fs.existsSync(tempDir)) {
                fs.rmSync(tempDir, { recursive: true, force: true });
            }
            fs.mkdirSync(tempDir, { recursive: true });

            let itemsProcessed = 0;
            const errors: string[] = [];

            for (const name of functions) {
                try {
                    this.logger.info(`\nProcessing function: ${name}`);

                    // 2. Download from source
                    this.logger.info(`  Downloading ${name} from source...`);
                    execSync(`supabase functions download ${name} --project-ref ${sourceRef} --use-api`, {
                        cwd: tempDir,
                        stdio: 'inherit'
                    });

                    // 3. Deploy to target
                    this.logger.info(`  Deploying ${name} to target...`);
                    execSync(`supabase functions deploy ${name} --project-ref ${targetRef} --use-api`, {
                        cwd: tempDir,
                        stdio: 'inherit'
                    });

                    this.logger.success(`  Successfully migrated ${name}`);
                    itemsProcessed++;
                } catch (e: any) {
                    const errorMsg = `Failed to migrate ${name}: ${e.message}`;
                    this.logger.error(errorMsg);
                    errors.push(errorMsg);
                }
            }

            // Cleanup
            fs.rmSync(tempDir, { recursive: true, force: true });

            return {
                success: errors.length === 0,
                message: `Edge functions migration completed. ${itemsProcessed} migrated, ${errors.length} failed.`,
                details: {
                    itemsProcessed,
                    errors: errors.length > 0 ? errors : undefined
                }
            };

        } catch (error: any) {
            return {
                success: false,
                message: `Edge functions migration failed: ${error.message}`
            };
        }
    }

    private extractProjectRef(connectionString: string): string {
        // Source pattern: postgresql://postgres:[password]@db.[REF].supabase.co:5432/postgres
        const match = connectionString.match(/@db\.([a-z0-9]+)\.supabase\.co/);
        if (!match) {
            throw new Error(`Could not extract project reference from connection string: ${connectionString}`);
        }
        return match[1];
    }

    private listFunctions(projectRef: string): string[] {
        try {
            const output = execSync(`supabase functions list --project-ref ${projectRef} --output json`, {
                encoding: 'utf8'
            });
            const data = JSON.parse(output);
            return data.map((f: any) => f.slug || f.name);
        } catch (e: any) {
            // Fallback for non-json output if CLI version is old
            const output = execSync(`supabase functions list --project-ref ${projectRef}`, {
                encoding: 'utf8'
            });
            const lines = output.split('\n');
            const functions: string[] = [];

            // Skip header lines (usually top 3) and look for slugs
            for (let i = 3; i < lines.length; i++) {
                const parts = lines[i].split('|').map(p => p.trim());
                if (parts.length > 2 && parts[2]) {
                    functions.push(parts[2]);
                }
            }
            return functions;
        }
    }
}
