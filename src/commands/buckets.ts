import { Logger } from '../lib/logger';
import { StorageAdmin } from '../lib/storage-admin';
import { GlobalOptions, MigrationResult, BucketInfo } from '../types/index';

export class BucketsCommand {
    private logger: Logger;

    constructor(logger: Logger) {
        this.logger = logger;
    }

    async execute(options: GlobalOptions): Promise<MigrationResult> {
        const sourceUrl = options.sourceUrl;
        const sourceKey = options.sourceKey;
        const targetUrl = options.targetUrl;
        const targetKey = options.targetKey;

        if (!sourceUrl || !sourceKey || !targetUrl || !targetKey) {
            throw new Error('Supabase URL and Service Role Key are required for both source and target projects. Use --source-url, --source-key, --target-url, --target-key.');
        }

        const source = new StorageAdmin(sourceUrl, sourceKey);
        const target = new StorageAdmin(targetUrl, targetKey);

        try {
            this.logger.info('Connecting to storage services...');

            let buckets: BucketInfo[] = [];

            if (options.bucket) {
                const b = await source.getBucket(options.bucket);
                if (b) buckets = [b];
                else throw new Error(`Bucket ${options.bucket} not found in source project`);
            } else {
                buckets = await source.listBuckets();
            }

            this.logger.info(`Found ${buckets.length} bucket(s) in source`);

            let itemsProcessed = 0;
            const errors: string[] = [];

            for (const bucket of buckets) {
                try {
                    const existing = await target.getBucket(bucket.id);

                    if (!existing) {
                        if (!options.dryRun) {
                            await target.createBucket(bucket);
                            this.logger.success(`Created bucket: ${bucket.id} (public: ${bucket.public})`);
                        } else {
                            this.logger.dryRun(`Would create bucket: ${bucket.id} (public: ${bucket.public})`);
                        }
                    } else {
                        if (!options.dryRun) {
                            await target.updateBucket(bucket);
                            this.logger.success(`Updated bucket: ${bucket.id} (public: ${bucket.public})`);
                        } else {
                            this.logger.dryRun(`Would update bucket: ${bucket.id} (public: ${bucket.public})`);
                        }
                    }
                } catch (e: any) {
                    const errorMsg = `${bucket.id}: ${e.message}`;
                    this.logger.error(errorMsg);
                    errors.push(errorMsg);
                }
                itemsProcessed++;
            }

            return {
                success: errors.length === 0,
                message: `Buckets migration completed`,
                details: {
                    itemsProcessed,
                    errors: errors.length > 0 ? errors : undefined
                }
            };

        } catch (error: any) {
            this.logger.error(`Migration failed: ${error.message}`);
            return {
                success: false,
                message: `Migration failed: ${error.message}`
            };
        }
    }
}
