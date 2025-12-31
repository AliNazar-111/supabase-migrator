import { Database } from '../lib/database';
import { Logger } from '../lib/logger';
import { GlobalOptions, MigrationResult } from '../types';

export class DeleteCommand {
    private logger: Logger;

    constructor(logger: Logger) {
        this.logger = logger;
    }

    // ========== DELETE DATA ==========

    async deleteData(options: GlobalOptions): Promise<MigrationResult> {
        if (!options.source) {
            throw new Error('--source is required');
        }

        if (!options.force && !options.dryRun) {
            throw new Error('This is a destructive operation. Use --force to confirm or --dry-run to preview');
        }

        const db = new Database({ connectionString: options.source });

        try {
            await db.connect();

            const schema = options.schema || 'public';
            const truncate = (options as any).truncate !== false; // Default to true
            const restartIdentity = (options as any).restartIdentity !== false; // Default to true
            const cascade = (options as any).cascade !== false; // Default to true
            const excludeTables = (options as any).excludeTable || [];
            const excludeArray = Array.isArray(excludeTables) ? excludeTables : [excludeTables].filter(Boolean);

            if (options.table) {
                return await this.deleteTableData(
                    db,
                    schema,
                    options.table,
                    truncate,
                    restartIdentity,
                    cascade,
                    options.dryRun || false
                );
            } else if ((options as any).all) {
                return await this.deleteAllData(
                    db,
                    schema,
                    truncate,
                    restartIdentity,
                    cascade,
                    excludeArray,
                    options.dryRun || false
                );
            } else {
                throw new Error('Either --table or --all is required');
            }

        } finally {
            await db.disconnect();
        }
    }

    private async deleteTableData(
        db: Database,
        schema: string,
        table: string,
        truncate: boolean,
        restartIdentity: boolean,
        cascade: boolean,
        dryRun: boolean
    ): Promise<MigrationResult> {
        this.logger.info(`Deleting data from ${schema}.${table}...`);

        // Get row count
        const countRes = await db.query(`SELECT COUNT(*) FROM "${schema}"."${table}"`);
        const count = parseInt(countRes.rows[0].count);

        if (truncate) {
            const options = [];
            if (restartIdentity) options.push('RESTART IDENTITY');
            if (cascade) options.push('CASCADE');
            const optionsStr = options.length > 0 ? ' ' + options.join(' ') : '';
            const sql = `TRUNCATE TABLE "${schema}"."${table}"${optionsStr};`;

            if (dryRun) {
                this.logger.dryRun(`Would execute: ${sql}`);
                this.logger.dryRun(`Would truncate ${count} rows from ${table}`);
                return {
                    success: true,
                    message: `Dry run: ${count} rows would be truncated`,
                    details: { rowsMigrated: count }
                };
            }

            await db.query(sql);
            this.logger.success(`Truncated ${count} rows from ${table}`);

            return {
                success: true,
                message: `Truncated ${count} rows from ${table}`,
                details: { rowsMigrated: count }
            };
        } else {
            // Use DELETE
            const sql = `DELETE FROM "${schema}"."${table}";`;

            if (dryRun) {
                this.logger.dryRun(`Would execute: ${sql}`);
                this.logger.dryRun(`Would delete ${count} rows from ${table}`);
                return {
                    success: true,
                    message: `Dry run: ${count} rows would be deleted`,
                    details: { rowsMigrated: count }
                };
            }

            const result = await db.query(sql);
            const rowCount = result.rowCount || 0;

            this.logger.success(`Deleted ${rowCount} rows from ${table}`);

            return {
                success: true,
                message: `Deleted ${rowCount} rows from ${table}`,
                details: { rowsMigrated: rowCount }
            };
        }
    }

    private async deleteAllData(
        db: Database,
        schema: string,
        truncate: boolean,
        restartIdentity: boolean,
        cascade: boolean,
        excludeTables: string[],
        dryRun: boolean
    ): Promise<MigrationResult> {
        this.logger.warn('Deleting all data from all tables...');

        // Get all tables
        const tablesRes = await db.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = $1 
            AND table_type = 'BASE TABLE'
            ORDER BY table_name
        `, [schema]);

        let tables = tablesRes.rows.map((r: any) => r.table_name);

        // Exclude tables
        if (excludeTables.length > 0) {
            this.logger.info(`Excluding tables: ${excludeTables.join(', ')}`);
            tables = tables.filter((t: string) => !excludeTables.includes(t));
        }

        this.logger.info(`Found ${tables.length} tables to process`);

        if (dryRun) {
            this.logger.dryRun('Would delete data from:');
            tables.forEach((t: string) => this.logger.info(`  - ${t}`));

            if (truncate) {
                const options = [];
                if (restartIdentity) options.push('RESTART IDENTITY');
                if (cascade) options.push('CASCADE');
                const optionsStr = options.length > 0 ? ' ' + options.join(' ') : '';
                this.logger.dryRun(`Using: TRUNCATE TABLE ... ${optionsStr}`);
            } else {
                this.logger.dryRun('Using: DELETE FROM ...');
            }

            return {
                success: true,
                message: `Dry run: ${tables.length} tables would be cleaned`,
                details: { itemsProcessed: tables.length }
            };
        }

        let totalDeleted = 0;
        const errors: string[] = [];

        if (truncate) {
            // Use TRUNCATE for all tables
            const options = [];
            if (restartIdentity) options.push('RESTART IDENTITY');
            if (cascade) options.push('CASCADE');
            const optionsStr = options.length > 0 ? ' ' + options.join(' ') : '';

            for (const table of tables) {
                try {
                    const countRes = await db.query(`SELECT COUNT(*) FROM "${schema}"."${table}"`);
                    const count = parseInt(countRes.rows[0].count);

                    await db.query(`TRUNCATE TABLE "${schema}"."${table}"${optionsStr};`);
                    totalDeleted += count;
                    this.logger.success(`${table}: ${count} rows truncated`);
                } catch (e: any) {
                    const errorMsg = `${table}: ${e.message}`;
                    this.logger.error(errorMsg);
                    errors.push(errorMsg);
                }
            }
        } else {
            // Use DELETE with session_replication_role
            await db.query('SET session_replication_role = replica;');

            for (const table of tables) {
                try {
                    const result = await db.query(`DELETE FROM "${schema}"."${table}";`);
                    const rowCount = result.rowCount || 0;
                    totalDeleted += rowCount;
                    this.logger.success(`${table}: ${rowCount} rows deleted`);
                } catch (e: any) {
                    const errorMsg = `${table}: ${e.message}`;
                    this.logger.error(errorMsg);
                    errors.push(errorMsg);
                }
            }

            await db.query('SET session_replication_role = DEFAULT;');

            // Reset sequences if using DELETE
            if (restartIdentity) {
                const sequencesRes = await db.query(`
                    SELECT sequence_name 
                    FROM information_schema.sequences 
                    WHERE sequence_schema = $1
                `, [schema]);

                for (const seq of sequencesRes.rows) {
                    try {
                        await db.query(`ALTER SEQUENCE "${schema}"."${seq.sequence_name}" RESTART WITH 1;`);
                        this.logger.info(`Reset sequence: ${seq.sequence_name}`);
                    } catch (e: any) {
                        this.logger.warn(`Failed to reset sequence ${seq.sequence_name}`);
                    }
                }
            }
        }

        return {
            success: errors.length === 0,
            message: `Deleted ${totalDeleted} rows from ${tables.length} tables`,
            details: {
                itemsProcessed: tables.length,
                rowsMigrated: totalDeleted,
                errors: errors.length > 0 ? errors : undefined
            }
        };
    }

    // ========== DELETE FUNCTIONS ==========

    async deleteFunction(options: GlobalOptions): Promise<MigrationResult> {
        if (!options.source) {
            throw new Error('--source is required');
        }

        if (!options.force && !options.dryRun) {
            throw new Error('This is a destructive operation. Use --force to confirm or --dry-run to preview');
        }

        const db = new Database({ connectionString: options.source });

        try {
            await db.connect();

            const schema = options.schema || 'public';
            const signature = (options as any).signature;

            if (options.function) {
                return await this.deleteSingleFunction(
                    db,
                    schema,
                    options.function,
                    signature,
                    options.dryRun || false
                );
            } else if ((options as any).all) {
                return await this.deleteAllFunctions(db, schema, options.dryRun || false);
            } else {
                throw new Error('Either --function or --all is required');
            }

        } finally {
            await db.disconnect();
        }
    }

    private async deleteSingleFunction(
        db: Database,
        schema: string,
        functionName: string,
        signature: string | undefined,
        dryRun: boolean
    ): Promise<MigrationResult> {
        let sql: string;

        if (signature) {
            // Use exact signature
            sql = `DROP FUNCTION IF EXISTS "${schema}"."${signature}" CASCADE;`;
        } else {
            // Get all overloads of this function
            const overloadsRes = await db.query(`
                SELECT 
                    p.proname as name,
                    pg_get_function_identity_arguments(p.oid) as args
                FROM pg_proc p
                JOIN pg_namespace n ON p.pronamespace = n.oid
                WHERE n.nspname = $1 AND p.proname = $2
            `, [schema, functionName]);

            const overloads = overloadsRes.rows;

            if (overloads.length === 0) {
                return {
                    success: false,
                    message: `Function ${functionName} not found in schema ${schema}`
                };
            }

            if (overloads.length > 1) {
                this.logger.warn(`Found ${overloads.length} overloads of ${functionName}:`);
                overloads.forEach((o: any) => {
                    this.logger.info(`  - ${o.name}(${o.args})`);
                });
                this.logger.warn('Use --signature to specify which overload to delete');
                this.logger.warn('Or all overloads will be deleted');
            }

            if (dryRun) {
                this.logger.dryRun('Would delete:');
                overloads.forEach((o: any) => {
                    this.logger.dryRun(`  DROP FUNCTION IF EXISTS "${schema}"."${o.name}"(${o.args}) CASCADE;`);
                });
                return {
                    success: true,
                    message: `Dry run: ${overloads.length} function(s) would be deleted`
                };
            }

            // Delete all overloads
            for (const overload of overloads) {
                const dropSql = `DROP FUNCTION IF EXISTS "${schema}"."${overload.name}"(${overload.args}) CASCADE;`;
                await db.query(dropSql);
                this.logger.success(`Deleted function: ${overload.name}(${overload.args})`);
            }

            return {
                success: true,
                message: `Deleted ${overloads.length} function(s) named ${functionName}`
            };
        }

        if (dryRun) {
            this.logger.dryRun(`Would execute: ${sql}`);
            return { success: true, message: 'Dry run completed' };
        }

        await db.query(sql);
        this.logger.success(`Deleted function: ${signature || functionName}`);

        return {
            success: true,
            message: `Function ${signature || functionName} deleted`
        };
    }

    private async deleteAllFunctions(
        db: Database,
        schema: string,
        dryRun: boolean
    ): Promise<MigrationResult> {
        // Get all user-defined functions (exclude extensions and system schemas)
        const functionsRes = await db.query(`
            SELECT 
                p.proname as name,
                pg_get_function_identity_arguments(p.oid) as args
            FROM pg_proc p
            JOIN pg_namespace n ON p.pronamespace = n.oid
            WHERE n.nspname = $1
            AND p.prokind = 'f'  -- Only functions, not procedures
            ORDER BY p.proname
        `, [schema]);

        const functions = functionsRes.rows;
        this.logger.info(`Found ${functions.length} functions`);

        if (dryRun) {
            this.logger.dryRun('Would delete functions:');
            functions.forEach((f: any) => this.logger.info(`  - ${f.name}(${f.args})`));
            return { success: true, message: `Dry run: ${functions.length} functions would be deleted` };
        }

        const errors: string[] = [];

        for (const func of functions) {
            try {
                await db.query(`DROP FUNCTION IF EXISTS "${schema}"."${func.name}"(${func.args}) CASCADE;`);
                this.logger.success(`Deleted function: ${func.name}(${func.args})`);
            } catch (e: any) {
                const errorMsg = `Failed to delete function ${func.name}(${func.args}): ${e.message}`;
                this.logger.error(errorMsg);
                errors.push(errorMsg);
            }
        }

        return {
            success: errors.length === 0,
            message: `Deleted ${functions.length} functions`,
            details: {
                itemsProcessed: functions.length,
                errors: errors.length > 0 ? errors : undefined
            }
        };
    }

    // ========== DELETE TRIGGERS ==========

    async deleteTrigger(options: GlobalOptions): Promise<MigrationResult> {
        if (!options.source) {
            throw new Error('--source is required');
        }

        if (!options.force && !options.dryRun) {
            throw new Error('This is a destructive operation. Use --force to confirm or --dry-run to preview');
        }

        const db = new Database({ connectionString: options.source });

        try {
            await db.connect();

            const schema = options.schema || 'public';

            if (options.trigger && options.table) {
                return await this.deleteSingleTrigger(
                    db,
                    schema,
                    options.trigger,
                    options.table,
                    options.dryRun || false
                );
            } else if ((options as any).all) {
                return await this.deleteAllTriggers(db, schema, options.dryRun || false);
            } else {
                throw new Error('Either (--trigger and --table) or --all is required');
            }

        } finally {
            await db.disconnect();
        }
    }

    private async deleteSingleTrigger(
        db: Database,
        schema: string,
        triggerName: string,
        tableName: string,
        dryRun: boolean
    ): Promise<MigrationResult> {
        const sql = `DROP TRIGGER IF EXISTS "${triggerName}" ON "${schema}"."${tableName}" CASCADE;`;

        if (dryRun) {
            this.logger.dryRun(`Would execute: ${sql}`);
            return { success: true, message: 'Dry run completed' };
        }

        await db.query(sql);
        this.logger.success(`Deleted trigger: ${triggerName} on ${tableName}`);

        return {
            success: true,
            message: `Trigger ${triggerName} deleted from ${tableName}`
        };
    }

    private async deleteAllTriggers(
        db: Database,
        schema: string,
        dryRun: boolean
    ): Promise<MigrationResult> {
        // Get all user-defined triggers (exclude internal triggers)
        const triggersRes = await db.query(`
            SELECT 
                t.tgname as trigger_name,
                c.relname as table_name
            FROM pg_trigger t
            JOIN pg_class c ON t.tgrelid = c.oid
            JOIN pg_namespace n ON c.relnamespace = n.oid
            WHERE n.nspname = $1 
            AND NOT t.tgisinternal
            ORDER BY c.relname, t.tgname
        `, [schema]);

        const triggers = triggersRes.rows;
        this.logger.info(`Found ${triggers.length} user-defined triggers`);

        if (dryRun) {
            this.logger.dryRun('Would delete triggers:');
            triggers.forEach((t: any) => this.logger.info(`  - ${t.trigger_name} on ${t.table_name}`));
            return { success: true, message: `Dry run: ${triggers.length} triggers would be deleted` };
        }

        const errors: string[] = [];

        for (const trigger of triggers) {
            try {
                await db.query(`DROP TRIGGER IF EXISTS "${trigger.trigger_name}" ON "${schema}"."${trigger.table_name}" CASCADE;`);
                this.logger.success(`Deleted trigger: ${trigger.trigger_name} on ${trigger.table_name}`);
            } catch (e: any) {
                const errorMsg = `Failed to delete trigger ${trigger.trigger_name}: ${e.message}`;
                this.logger.error(errorMsg);
                errors.push(errorMsg);
            }
        }

        return {
            success: errors.length === 0,
            message: `Deleted ${triggers.length} triggers`,
            details: {
                itemsProcessed: triggers.length,
                errors: errors.length > 0 ? errors : undefined
            }
        };
    }
}
