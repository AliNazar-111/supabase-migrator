import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { BucketInfo } from '../types';

export class StorageAdmin {
    private client: SupabaseClient;

    constructor(url: string, key: string) {
        this.client = createClient(url, key, {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        });
    }

    async listBuckets(): Promise<BucketInfo[]> {
        const { data, error } = await this.client.storage.listBuckets();
        if (error) throw error;
        return data as BucketInfo[];
    }

    async getBucket(id: string): Promise<BucketInfo | null> {
        const { data, error } = await this.client.storage.getBucket(id);
        if (error) {
            if (error.message.includes('not found')) return null;
            throw error;
        }
        return data as BucketInfo;
    }

    async createBucket(bucket: BucketInfo): Promise<void> {
        const { error } = await this.client.storage.createBucket(bucket.id, {
            public: bucket.public,
            fileSizeLimit: bucket.file_size_limit,
            allowedMimeTypes: bucket.allowed_mime_types
        });
        if (error) throw error;
    }

    async updateBucket(bucket: BucketInfo): Promise<void> {
        const { error } = await this.client.storage.updateBucket(bucket.id, {
            public: bucket.public,
            fileSizeLimit: bucket.file_size_limit,
            allowedMimeTypes: bucket.allowed_mime_types
        });
        if (error) throw error;
    }
}
