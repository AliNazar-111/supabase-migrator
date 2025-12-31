import { Database } from '../lib/database';
import { Logger } from '../lib/logger';
import { GlobalOptions, MigrationResult, PolicyInfo } from '../types';

export class ExportPoliciesCommand {
    private logger: Logger;

    constructor(logger: Logger) {
        this.logger = logger;
    }

    async execute(options: GlobalOptions): Promise<MigrationResult> {
        if (!options.source) {
            throw new Error('--source connection string is required to read policies from source DB');
        }

        const source = new Database({ connectionString: options.source });

        try {
            await source.connect();

            this.logger.info(`Reading policies from: ${source.getMaskedConnectionString()}`);
            this.logger.info('Introspecting storage policies...');

            // Query specifically for storage policies, often grouped by bucket
            const policiesRes = await source.query(`
                SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
                FROM pg_policies
                WHERE schemaname = 'storage'
                ORDER BY tablename, policyname
            `);

            const policies: PolicyInfo[] = policiesRes.rows;
            this.logger.info(`Found ${policies.length} storage policies`);

            const sqlStatements: string[] = [
                '/* =========================================================================',
                '   STORAGE POLICIES EXPORT',
                '   =========================================================================',
                '',
                '   INSTRUCTIONS:',
                '   1. Open the Supabase Dashboard of your TARGET project.',
                '   2. Navigate to the SQL Editor.',
                '   3. Create a new query.',
                '   4. Paste the content of this file and click "Run".',
                '',
                '   NOTE: You may need to manually adjust specific roles (e.g., authenticated, anon) ',
                '   if they differ between environments or if custom roles are used.',
                '   ========================================================================= */',
                '',
                '-- Ensure RLS is enabled on storage tables',
                'ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;',
                'ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;',
                ''
            ];

            // Group policies by table for better readability
            const grouped = policies.reduce((acc: any, p) => {
                if (!acc[p.tablename]) acc[p.tablename] = [];
                acc[p.tablename].push(p);
                return acc;
            }, {});

            for (const tablename of Object.keys(grouped)) {
                sqlStatements.push(`-- #########################################################################`);
                sqlStatements.push(`-- POLICIES FOR TABLE: storage.${tablename}`);
                sqlStatements.push(`-- #########################################################################`);
                sqlStatements.push('');

                for (const p of grouped[tablename]) {
                    sqlStatements.push(`-- Name: ${p.policyname}`);
                    sqlStatements.push(`DROP POLICY IF EXISTS "${p.policyname}" ON storage.${tablename};`);

                    let roles = 'PUBLIC';
                    if (p.roles) {
                        const cleanRoles = p.roles.replace(/[{}]/g, '').trim();
                        roles = cleanRoles || 'PUBLIC';
                    }

                    let createSQL = `CREATE POLICY "${p.policyname}" ON storage.${tablename}`;

                    if (p.permissive === 'RESTRICTIVE') {
                        createSQL += ` AS RESTRICTIVE`;
                    } else {
                        createSQL += ` AS PERMISSIVE`;
                    }

                    createSQL += ` FOR ${p.cmd}`;
                    createSQL += ` TO ${roles}`;

                    // Handle USING clause
                    if (p.qual) {
                        createSQL += ` USING (${p.qual})`;
                    }

                    // Handle WITH CHECK clause
                    if (p.with_check) {
                        createSQL += ` WITH CHECK (${p.with_check})`;
                    }

                    createSQL += `;`;

                    sqlStatements.push(createSQL);
                    sqlStatements.push('');
                }
            }

            const sqlContent = sqlStatements.join('\n');
            const filepath = this.logger.writeSqlFile('bucket-policies.sql', sqlContent);

            this.logger.success(`Storage policies exported to: bucket-policies.sql`);
            this.logger.info('IMPORTANT: Run this file manually in the target Supabase SQL Editor.');

            return {
                success: true,
                message: `Storage policies exported successfully`,
                details: {
                    itemsProcessed: policies.length,
                    sqlFiles: this.logger.getSqlFiles()
                }
            };

        } finally {
            await source.disconnect();
        }
    }
}
