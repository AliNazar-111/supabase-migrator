export interface DatabaseConfig {
    connectionString: string;
    ssl?: {
        rejectUnauthorized: boolean;
    };
}

export interface GlobalOptions {
    source?: string;
    target?: string;
    schema?: string;
    table?: string;
    function?: string;
    trigger?: string;
    bucket?: string;
    dryRun?: boolean;
    force?: boolean;
    output?: string;
    includeData?: boolean;
    dataOnly?: boolean;
    truncate?: boolean;
    batchSize?: number;
    sourceUrl?: string;
    sourceKey?: string;
    targetUrl?: string;
    targetKey?: string;
    token?: string;
    sourceToken?: string;
    targetToken?: string;
}

export interface MigrationResult {
    success: boolean;
    message: string;
    details?: {
        itemsProcessed?: number;
        rowsMigrated?: number;
        errors?: string[];
        sqlFiles?: string[];
        duration?: number;
    };
}

export interface TableInfo {
    schema: string;
    table_name: string;
    row_count?: number;
}

export interface FunctionInfo {
    schema: string;
    name: string;
    definition: string;
    language: string;
}

export interface TriggerInfo {
    schema: string;
    table_name: string;
    trigger_name: string;
    definition: string;
    event: string;
}

export interface BucketInfo {
    id: string;
    name: string;
    public: boolean;
    file_size_limit?: number;
    allowed_mime_types?: string[];
    owner?: string;
    created_at?: string;
    updated_at?: string;
}

export interface PolicyInfo {
    schemaname: string;
    tablename: string;
    policyname: string;
    permissive: string;
    roles: string;
    cmd: string;
    qual?: string;
    with_check?: string;
}
