import { Database } from '../lib/database';
import { Logger } from '../lib/logger';
import * as fs from 'fs';
import * as path from 'path';

export interface MigrationStep {
    name: string;
    file: string;
    order: number;
    type: 'schema' | 'functions' | 'triggers' | 'data';
}

export interface MigrationRunResult {
    step: string;
    status: 'started' | 'succeeded' | 'failed' | 'skipped';
    error?: string;
    duration?: number;
}

export class MigrationRunner {
    private db: Database;
    private logger: Logger;
    private dryRun: boolean;

    constructor(db: Database, logger: Logger, dryRun: boolean = false) {
        this.db = db;
        this.logger = logger;
        this.dryRun = dryRun;
    }

    async runMigrations(migrationDir: string, schema: string = 'public'): Promise<MigrationRunResult[]> {
        const results: MigrationRunResult[] = [];

        // Discover migration files
        const steps = this.discoverMigrationFiles(migrationDir, schema);

        if (steps.length === 0) {
            this.logger.warn('No migration files found');
            return results;
        }

        this.logger.info(`Found ${steps.length} migration files`);

        if (this.dryRun) {
            this.logger.info('[DRY RUN MODE] - No changes will be applied');
        }

        // Execute in order
        for (const step of steps) {
            const result = await this.executeStep(step);
            results.push(result);

            if (result.status === 'failed' && !this.dryRun) {
                this.logger.error(`Migration failed at step: ${step.name}`);
                this.logger.error('Stopping migration process');
                break;
            }
        }

        return results;
    }

    private discoverMigrationFiles(migrationDir: string, schema: string): MigrationStep[] {
        const steps: MigrationStep[] = [];

        // 1. Schema file
        const schemaFile = path.join(migrationDir, `schema-${schema}.sql`);
        if (fs.existsSync(schemaFile)) {
            steps.push({
                name: 'Schema',
                file: schemaFile,
                order: 1,
                type: 'schema'
            });
        }

        // 2. Functions file
        const functionsFile = path.join(migrationDir, `functions-${schema}.sql`);
        if (fs.existsSync(functionsFile)) {
            steps.push({
                name: 'Functions',
                file: functionsFile,
                order: 2,
                type: 'functions'
            });
        }

        // 3. Triggers file
        const triggersFile = path.join(migrationDir, `triggers-${schema}.sql`);
        if (fs.existsSync(triggersFile)) {
            steps.push({
                name: 'Triggers',
                file: triggersFile,
                order: 3,
                type: 'triggers'
            });
        }

        // 4. Data files
        const dataDir = path.join(migrationDir, 'data');
        if (fs.existsSync(dataDir)) {
            const dataFiles = fs.readdirSync(dataDir)
                .filter(f => f.startsWith(`${schema}.`) && f.endsWith('.sql'))
                .sort(); // Alphabetical order (dependency order should be preserved from export)

            dataFiles.forEach((file, index) => {
                const tableName = file.replace(`${schema}.`, '').replace('.sql', '');
                steps.push({
                    name: `Data: ${tableName}`,
                    file: path.join(dataDir, file),
                    order: 4 + index,
                    type: 'data'
                });
            });
        }

        return steps.sort((a, b) => a.order - b.order);
    }

    private async executeStep(step: MigrationStep): Promise<MigrationRunResult> {
        const startTime = Date.now();

        this.logger.info(`\n${'='.repeat(60)}`);
        this.logger.info(`STEP: ${step.name}`);
        this.logger.info(`File: ${step.file}`);
        this.logger.info(`Type: ${step.type}`);
        this.logger.info('='.repeat(60));

        const result: MigrationRunResult = {
            step: step.name,
            status: 'started'
        };

        try {
            // Read SQL file
            const sql = fs.readFileSync(step.file, 'utf-8');

            if (!sql.trim()) {
                this.logger.warn('File is empty, skipping');
                result.status = 'skipped';
                return result;
            }

            // Make SQL idempotent
            const idempotentSql = this.makeIdempotent(sql, step.type);

            if (this.dryRun) {
                this.logger.info('[DRY RUN] Would execute:');
                this.logger.info(this.truncateForDisplay(idempotentSql));
                result.status = 'succeeded';
                result.duration = Date.now() - startTime;
                return result;
            }

            // Execute SQL
            this.logger.info('Executing...');
            await this.db.query(idempotentSql);

            const duration = Date.now() - startTime;
            result.status = 'succeeded';
            result.duration = duration;

            this.logger.success(`Completed in ${duration}ms`);

            return result;

        } catch (error: any) {
            const duration = Date.now() - startTime;
            result.status = 'failed';
            result.error = error.message;
            result.duration = duration;

            this.logger.error(`Failed after ${duration}ms`);
            this.logger.error(`Error: ${error.message}`);

            if (error.detail) {
                this.logger.error(`Detail: ${error.detail}`);
            }
            if (error.hint) {
                this.logger.error(`Hint: ${error.hint}`);
            }

            return result;
        }
    }

    private makeIdempotent(sql: string, type: MigrationStep['type']): string {
        let idempotentSql = sql;

        switch (type) {
            case 'schema':
                // Replace CREATE SCHEMA with CREATE SCHEMA IF NOT EXISTS
                idempotentSql = idempotentSql.replace(
                    /CREATE SCHEMA\s+"?(\w+)"?/gi,
                    'CREATE SCHEMA IF NOT EXISTS "$1"'
                );

                // CREATE TABLE already has IF NOT EXISTS from export
                // ALTER TABLE ADD CONSTRAINT is idempotent (will fail if exists, but that's ok)
                break;

            case 'functions':
                // Replace CREATE FUNCTION with CREATE OR REPLACE FUNCTION
                idempotentSql = idempotentSql.replace(
                    /CREATE FUNCTION/gi,
                    'CREATE OR REPLACE FUNCTION'
                );
                break;

            case 'triggers':
                // Add DROP TRIGGER IF EXISTS before each CREATE TRIGGER
                idempotentSql = idempotentSql.replace(
                    /CREATE TRIGGER\s+"?(\w+)"?\s+(?:BEFORE|AFTER|INSTEAD OF)\s+(?:INSERT|UPDATE|DELETE|TRUNCATE)(?:\s+OR\s+(?:INSERT|UPDATE|DELETE|TRUNCATE))*\s+ON\s+"?(\w+)"?"?(\w+)"?/gi,
                    (match, triggerName, schema, table) => {
                        const fullTable = table ? `"${schema}"."${table}"` : `"${schema}"`;
                        return `DROP TRIGGER IF EXISTS "${triggerName}" ON ${fullTable};\n${match}`;
                    }
                );
                break;

            case 'data':
                // Data files already have session_replication_role handling
                // INSERT ... ON CONFLICT DO NOTHING is already idempotent
                break;
        }

        return idempotentSql;
    }

    private truncateForDisplay(sql: string, maxLines: number = 20): string {
        const lines = sql.split('\n');
        if (lines.length <= maxLines) {
            return sql;
        }

        const truncated = lines.slice(0, maxLines).join('\n');
        return `${truncated}\n... (${lines.length - maxLines} more lines)`;
    }
}
