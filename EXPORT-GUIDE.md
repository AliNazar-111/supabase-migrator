# Database Export Feature

## Overview

The `export:database` command provides comprehensive PostgreSQL introspection and SQL/JSON export functionality using native PostgreSQL catalog tables.

## Features

### Schema Export
Generates SQL to recreate:
- ✅ **Schemas** - Schema definitions
- ✅ **Extensions** - PostgreSQL extensions
- ✅ **Custom Types** - Enum types and custom types
- ✅ **Sequences** - Auto-increment sequences
- ✅ **Tables** - Complete table definitions with columns, defaults, data types
- ✅ **Constraints** - Primary keys, unique constraints, foreign keys, check constraints
- ✅ **Indexes** - All indexes (excluding those created by constraints)
- ✅ **Views** - View definitions

### Functions Export
- ✅ Complete function definitions using `pg_get_functiondef()`
- ✅ Includes function body, parameters, return types, language

### Triggers Export
- ✅ Complete trigger definitions using `pg_get_triggerdef()`
- ✅ Includes timing (BEFORE/AFTER), events (INSERT/UPDATE/DELETE)

### Data Export
- ✅ **SQL Format** - INSERT statements with proper escaping
- ✅ **JSON Format** - JSON array of objects
- ✅ **Streaming/Batched** - Memory-efficient processing
- ✅ **Dependency Order** - Tables exported in FK-safe order
- ✅ **Session Replication Role** - Disables triggers during import

## PostgreSQL Catalog Tables Used

### Schema Introspection
- `information_schema.tables` - Table listing
- `information_schema.columns` - Column definitions
- `information_schema.table_constraints` - Constraints
- `information_schema.sequences` - Sequence definitions
- `information_schema.views` - View definitions
- `pg_indexes` - Index definitions
- `pg_extension` - Extensions
- `pg_type` + `pg_enum` - Custom enum types
- `pg_constraint` - Constraint details

### Functions & Triggers
- `pg_proc` - Function definitions
- `pg_trigger` - Trigger definitions
- `pg_get_functiondef()` - Function DDL
- `pg_get_triggerdef()` - Trigger DDL
- `pg_get_constraintdef()` - Constraint DDL

## Usage

### Export Complete Database

```bash
supabase-migrator export:database \
  --source "postgresql://postgres:pass@db.example.supabase.co:5432/postgres" \
  --schema public \
  --output ./export
```

### Export Schema Only (No Data)

```bash
supabase-migrator export:database \
  --source "postgresql://..." \
  --schema public \
  --include-data false
```

### Export Data Only (No Schema)

```bash
supabase-migrator export:database \
  --source "postgresql://..." \
  --schema public \
  --data-only
```

### Export Specific Table

```bash
supabase-migrator export:database \
  --source "postgresql://..." \
  --table users \
  --format json
```

### Export with JSON Format

```bash
supabase-migrator export:database \
  --source "postgresql://..." \
  --format json \
  --batch-size 5000
```

## Output Structure

```
./supabase-migrator/
├── schema-public.sql          # Complete schema DDL
├── functions-public.sql       # All functions
├── triggers-public.sql        # All triggers
├── data/
│   ├── public.users.sql       # User data (SQL format)
│   ├── public.posts.sql       # Posts data
│   └── public.comments.sql    # Comments data
└── migration-TIMESTAMP.log    # Detailed log
```

### JSON Format Output

```
./supabase-migrator/
├── schema-public.sql
├── functions-public.sql
├── triggers-public.sql
├── data/
│   ├── public.users.json      # User data (JSON format)
│   ├── public.posts.json
│   └── public.comments.json
└── migration-TIMESTAMP.log
```

## Schema Export Details

### Table Definition Example

```sql
CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "email" varchar(255) NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "metadata" jsonb
);

ALTER TABLE "public"."users" ADD CONSTRAINT "users_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."users" ADD CONSTRAINT "users_email_key" UNIQUE (email);

CREATE INDEX "idx_users_email" ON "public"."users" USING btree (email);
```

### Custom Type Example

```sql
CREATE TYPE "public"."user_role" AS ENUM ('admin', 'user', 'guest');
```

### Sequence Example

```sql
CREATE SEQUENCE IF NOT EXISTS "public"."users_id_seq" AS bigint INCREMENT 1 MINVALUE 1 MAXVALUE 9223372036854775807 START 1;
```

## Data Export Details

### SQL Format

```sql
-- Data for table: public.users
-- Generated: 2025-12-31T10:00:00.000Z
-- Total rows: 1000

SET session_replication_role = replica;

INSERT INTO "public"."users" ("id", "email", "created_at") VALUES ('123e4567-e89b-12d3-a456-426614174000', 'user@example.com', '2025-01-01 00:00:00+00');
INSERT INTO "public"."users" ("id", "email", "created_at") VALUES ('223e4567-e89b-12d3-a456-426614174001', 'admin@example.com', '2025-01-01 00:00:01+00');

SET session_replication_role = DEFAULT;
```

### JSON Format

```json
[
  {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "email": "user@example.com",
    "created_at": "2025-01-01T00:00:00.000Z"
  },
  {
    "id": "223e4567-e89b-12d3-a456-426614174001",
    "email": "admin@example.com",
    "created_at": "2025-01-01T00:00:01.000Z"
  }
]
```

## Dependency-Safe Table Ordering

The exporter automatically determines the correct table order based on foreign key dependencies:

1. Tables with no dependencies are exported first
2. Tables are ordered by their dependency depth
3. Circular dependencies are handled gracefully
4. Fallback to alphabetical order if dependency analysis fails

This ensures data can be imported without FK constraint violations.

## Memory Efficiency

### Batched Processing
- Data is fetched in configurable batches (default: 1000 rows)
- Prevents memory exhaustion on large tables
- Progress tracking for large exports

### Streaming Writes
- Data is written to files incrementally
- No need to hold entire dataset in memory
- Suitable for multi-GB databases

## Import Instructions

### Importing Schema

```bash
psql "postgresql://..." -f schema-public.sql
psql "postgresql://..." -f functions-public.sql
psql "postgresql://..." -f triggers-public.sql
```

### Importing Data (SQL Format)

```bash
# Import all data files in dependency order
for file in data/public.*.sql; do
  psql "postgresql://..." -f "$file"
done
```

### Importing Data (JSON Format)

Use a custom script or tool like `pgloader` to import JSON data.

## Library API Usage

```typescript
import {
    Database,
    Logger,
    SchemaExporter,
    FunctionsExporter,
    TriggersExporter,
    DataExporter
} from 'supabase-migrator';

const db = new Database({ connectionString: 'postgresql://...' });
const logger = new Logger('./output');

await db.connect();

// Export schema
const schemaExporter = new SchemaExporter(db, logger, './output');
const schemaFiles = await schemaExporter.exportSchema('public');

// Export functions
const functionsExporter = new FunctionsExporter(db, logger, './output');
const functionsFile = await functionsExporter.exportFunctions('public');

// Export triggers
const triggersExporter = new TriggersExporter(db, logger, './output');
const triggersFile = await triggersExporter.exportTriggers('public');

// Export data
const dataExporter = new DataExporter(db, logger, './output');
const dataFiles = await dataExporter.exportData('public', {
    format: 'sql',
    batchSize: 1000,
    tableName: 'users' // Optional: specific table
});

await db.disconnect();
```

## Performance Considerations

### Large Databases
- Use `--batch-size` to control memory usage
- Consider exporting tables individually with `--table`
- JSON format is more compact but slower to import

### Network Latency
- Larger batch sizes reduce round trips
- But increase memory usage
- Balance based on your network and memory constraints

### Parallel Export
For very large databases, consider running multiple export commands in parallel for different tables.

## Limitations

1. **Permissions** - Requires read access to `pg_catalog` and `information_schema`
2. **Extensions** - Some extensions may require superuser privileges to recreate
3. **Binary Data** - Large binary objects (BLOBs) are exported as escaped strings
4. **Materialized Views** - Not currently supported (use regular views)
5. **Partitioned Tables** - Exported as regular tables

## Troubleshooting

### "Permission denied" errors
- Ensure the database user has SELECT privileges on all tables
- Check access to `pg_catalog` and `information_schema`

### Out of memory errors
- Reduce `--batch-size`
- Export tables individually with `--table`
- Use SQL format instead of JSON

### Missing dependencies
- Check that all required extensions are installed
- Verify custom types are exported before tables that use them

## Best Practices

1. **Always test exports** - Verify exported SQL can be imported successfully
2. **Use version control** - Track schema changes over time
3. **Regular backups** - Combine with Supabase's native backup features
4. **Document custom types** - Keep track of enum values and custom types
5. **Review generated SQL** - Ensure it matches your expectations
