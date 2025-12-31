# Migration Runner & Import Feature

## Overview

The **Migration Runner** applies generated SQL files to a target database in the correct order with idempotency guarantees and detailed logging.

## Features

 **Correct Execution Order**
1. Schema (tables, types, constraints, indexes)
2. Functions
3. Triggers
4. Data (in dependency-safe order)

 **Idempotent Operations**
- `CREATE SCHEMA IF NOT EXISTS`
- `CREATE OR REPLACE FUNCTION`
- `DROP TRIGGER IF EXISTS` before `CREATE TRIGGER`
- `INSERT ... ON CONFLICT DO NOTHING` for data

 **Dry-Run Mode**
- Preview what would be executed
- No changes applied to database

 **Detailed Logging**
- Each step: started, succeeded, failed
- Execution duration
- Error messages with details and hints
- Summary report

## Usage

### CLI Command

```bash
# Import from migration directory
supabase-migrator import:database \
  --source ./supabase-migrator \
  --target "postgresql://postgres:pass@db.example.supabase.co:5432/postgres"

# Dry run (preview only)
supabase-migrator import:database \
  --source ./supabase-migrator \
  --target "postgresql://..." \
  --dry-run

# Import specific schema
supabase-migrator import:database \
  --source ./export-dir \
  --target "postgresql://..." \
  --schema custom_schema
```

### Library API

```typescript
import { Database, Logger, MigrationRunner } from 'supabase-migrator';

const db = new Database({ connectionString: 'postgresql://...' });
const logger = new Logger('./logs');

await db.connect();

const runner = new MigrationRunner(db, logger, false); // false = not dry-run
const results = await runner.runMigrations('./supabase-migrator', 'public');

await db.disconnect();

// Check results
for (const result of results) {
    console.log(`${result.step}: ${result.status}`);
    if (result.error) {
        console.error(`Error: ${result.error}`);
    }
}
```

## Migration File Discovery

The runner automatically discovers and orders migration files:

### Expected Directory Structure

```
./supabase-migrator/
├── schema-public.sql          # Order: 1
├── functions-public.sql       # Order: 2
├── triggers-public.sql        # Order: 3
└── data/                      # Order: 4+
    ├── public.users.sql       # 4
    ├── public.posts.sql       # 5
    └── public.comments.sql    # 6
```

### File Naming Convention

- **Schema:** `schema-{schema}.sql`
- **Functions:** `functions-{schema}.sql`
- **Triggers:** `triggers-{schema}.sql`
- **Data:** `data/{schema}.{table}.sql`

## Execution Order

### 1. Schema Migration

**File:** `schema-public.sql`

**Idempotency Transformations:**
```sql
-- Original
CREATE SCHEMA "public"

-- Transformed
CREATE SCHEMA IF NOT EXISTS "public"
```

**Includes:**
- Extensions
- Custom types
- Sequences
- Tables
- Constraints
- Indexes
- Views

### 2. Functions Migration

**File:** `functions-public.sql`

**Idempotency Transformations:**
```sql
-- Original
CREATE FUNCTION my_function()

-- Transformed
CREATE OR REPLACE FUNCTION my_function()
```

### 3. Triggers Migration

**File:** `triggers-public.sql`

**Idempotency Transformations:**
```sql
-- Original
CREATE TRIGGER my_trigger AFTER INSERT ON users

-- Transformed
DROP TRIGGER IF EXISTS "my_trigger" ON "public"."users";
CREATE TRIGGER my_trigger AFTER INSERT ON users
```

### 4. Data Migration

**Files:** `data/public.*.sql`

**Already Idempotent:**
```sql
SET session_replication_role = replica;

INSERT INTO "public"."users" (...) VALUES (...)
ON CONFLICT DO NOTHING;

SET session_replication_role = DEFAULT;
```

**Execution Order:**
- Files are processed in alphabetical order
- Export process ensures FK-safe ordering
- Tables with no dependencies come first

## Logging

### Step Logging

Each migration step logs:

```
============================================================
STEP: Schema
File: ./supabase-migrator/schema-public.sql
Type: schema
============================================================
Executing...
 Completed in 1234ms
```

### Error Logging

```
============================================================
STEP: Functions
File: ./supabase-migrator/functions-public.sql
Type: functions
============================================================
Executing...
 Failed after 567ms
Error: function "nonexistent_type" does not exist
Detail: The function references a type that hasn't been created
Hint: Ensure all custom types are defined in schema.sql
```

### Summary Report

```
============================================================
MIGRATION SUMMARY
============================================================
Total steps: 6
Succeeded: 5
Failed: 1

Detailed Results:
 Schema (1234ms)
 Functions (567ms)
 Triggers (234ms)
   Error: trigger "my_trigger" already exists
⏭️ Data: users (skipped - empty file)
 Data: posts (3456ms)
 Data: comments (2345ms)
```

## Dry-Run Mode

Preview what would be executed without making changes:

```bash
supabase-migrator import:database \
  --source ./supabase-migrator \
  --target "postgresql://..." \
  --dry-run
```

**Output:**
```
============================================================
STEP: Schema
File: ./supabase-migrator/schema-public.sql
Type: schema
============================================================
[DRY RUN] Would execute:
CREATE SCHEMA IF NOT EXISTS "public";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" SCHEMA public;
CREATE TYPE "public"."user_role" AS ENUM ('admin', 'user');
...
... (150 more lines)
 Completed in 12ms
```

## Error Handling

### Stop on First Error

By default, migration stops at the first error:

```
 Failed at step: Functions
Stopping migration process
```

### Error Details

Errors include:
- **Message:** Main error description
- **Detail:** Additional context (if available)
- **Hint:** Suggested fix (if available)
- **Duration:** Time taken before failure

### Recovery

After fixing errors:
1. Fix the problematic SQL file
2. Re-run the import command
3. Idempotent operations will skip already-applied changes

## Idempotency Guarantees

### Schema

 **Safe to re-run:**
- `CREATE SCHEMA IF NOT EXISTS`
- `CREATE TABLE IF NOT EXISTS`
- `CREATE EXTENSION IF NOT EXISTS`
- `CREATE TYPE` (will error if exists, but harmless)

 **May error but safe:**
- `ALTER TABLE ADD CONSTRAINT` (errors if constraint exists)
- `CREATE INDEX` (errors if index exists)

### Functions

 **Safe to re-run:**
- `CREATE OR REPLACE FUNCTION` (always safe)

### Triggers

 **Safe to re-run:**
- `DROP TRIGGER IF EXISTS` + `CREATE TRIGGER` (always safe)

### Data

 **Safe to re-run:**
- `INSERT ... ON CONFLICT DO NOTHING` (skips duplicates)
- `session_replication_role = replica` (disables triggers)

## Complete Workflow Example

### 1. Export from Source

```bash
supabase-migrator export:database \
  --source "postgresql://source..." \
  --output ./migration-backup
```

### 2. Review Generated Files

```bash
ls -la ./migration-backup/
# schema-public.sql
# functions-public.sql
# triggers-public.sql
# data/public.*.sql
```

### 3. Dry-Run Import

```bash
supabase-migrator import:database \
  --source ./migration-backup \
  --target "postgresql://target..." \
  --dry-run
```

### 4. Apply Migration

```bash
supabase-migrator import:database \
  --source ./migration-backup \
  --target "postgresql://target..."
```

### 5. Verify Results

Check the summary report for any errors.

## Advanced Usage

### Custom Schema

```bash
supabase-migrator import:database \
  --source ./migration-backup \
  --target "postgresql://..." \
  --schema custom_schema
```

### Programmatic Usage

```typescript
import { Database, Logger, MigrationRunner } from 'supabase-migrator';

async function runMigration() {
    const db = new Database({ connectionString: 'postgresql://...' });
    const logger = new Logger('./logs');

    await db.connect();

    try {
        const runner = new MigrationRunner(db, logger, false);
        const results = await runner.runMigrations('./migration-backup', 'public');

        const failed = results.filter(r => r.status === 'failed');
        
        if (failed.length > 0) {
            console.error('Migration failed:');
            failed.forEach(r => console.error(`- ${r.step}: ${r.error}`));
            process.exit(1);
        }

        console.log('Migration completed successfully!');
    } finally {
        await db.disconnect();
    }
}

runMigration();
```

## Troubleshooting

### "File not found" errors

Ensure migration directory structure matches expected format:
- `schema-{schema}.sql`
- `functions-{schema}.sql`
- `triggers-{schema}.sql`
- `data/{schema}.{table}.sql`

### "Constraint already exists" errors

This is normal and safe. The migration will continue.

### "Type does not exist" errors

Ensure custom types are defined in `schema-public.sql` before tables that use them.

### "Permission denied" errors

Ensure the database user has:
- CREATE privileges on the schema
- INSERT privileges on tables
- EXECUTE privileges for functions

### Data import failures

- Check for FK constraint violations
- Verify table order in `data/` directory
- Ensure all referenced tables exist

## Best Practices

1. **Always dry-run first** - Preview changes before applying
2. **Backup target database** - Before running migrations
3. **Test on staging** - Before production migrations
4. **Review generated SQL** - Ensure it matches expectations
5. **Monitor logs** - Check for warnings and errors
6. **Version control** - Keep migration files in git

## Limitations

1. **No rollback** - Migrations are forward-only
2. **No transactions** - Each step is independent
3. **No parallel execution** - Steps run sequentially
4. **No partial retry** - Must re-run from start after errors

## Future Enhancements

- [ ] Transaction support for atomic migrations
- [ ] Rollback/undo functionality
- [ ] Partial retry (resume from failed step)
- [ ] Parallel data import
- [ ] Migration versioning
- [ ] Pre/post migration hooks
