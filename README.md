# supabase-migrator

**Comprehensive migration and cleanup toolkit for Supabase PostgreSQL databases.**

[![NPM Version](https://img.shields.io/npm/v/supabase-migrator.svg)](https://www.npmjs.com/package/supabase-migrator)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## Features

-  **Complete Introspection** - Introspects extensions, custom types, sequences, tables, constraints, indexes, views, and functions.
-  **Schema Migration** - Safe recreation of complex schemas across projects.
-  **Data Migration** - Streaming/batched data export in SQL or JSON formats.
-  **Dependency-Aware** - Automatically orders table exports based on foreign key dependencies.
-  **Idempotent Imports** - SQL generations use `IF NOT EXISTS` and `CREATE OR REPLACE` for safe re-runs.
-  **Edge Function Migration** - Push-button deployment of Edge Functions across projects.
-  **Storage Support** - Securely sync buckets via Supabase Admin APIs and export RLS policies.
-  **Cleanup Utility** - Powerful `delete:*` commands with `TRUNCATE`, `CASCADE`, and full schema wipe support.
-  **Developer Friendly** - Detailed logs, dry-run modes, progress tracking, and interactive summaries.

---

## Installation

```bash
# Install globally
npm install -g supabase-migrator

# Or run via npx
npx supabase-migrator --help
```

---

## Setup

Create a `.env` file or set environment variables:

```env
# Source Database
SOURCE_CONNECTION_STRING=postgresql://postgres:password@db.source-ref.supabase.co:5432/postgres

# Target Database
TARGET_CONNECTION_STRING=postgresql://postgres:password@db.target-ref.supabase.co:5432/postgres

# Supabase Access Token (For Edge Functions)
SUPABASE_ACCESS_TOKEN=sbp_...

# Storage Migration API (Required for migrate:buckets)
SOURCE_SUPABASE_URL=https://source-ref.supabase.co
SOURCE_SERVICE_ROLE_KEY=ey...
TARGET_SUPABASE_URL=https://target-ref.supabase.co
TARGET_SERVICE_ROLE_KEY=ey...
```

---

## Usage Guide (Copy-Paste Examples)

### 1. Complete Database Migration
Migrate everything directly from one database to another.

```bash
supabase-migrator migrate:all \
  --source "postgresql://postgres:password@db.source-ref.supabase.co:5432/postgres" \
  --target "postgresql://postgres:password@db.target-ref.supabase.co:5432/postgres"
```

### 2. Edge Function Migration
Deploy your edge functions from one project to another.

```bash
supabase-migrator migrate:edge-functions \
  --source "postgresql://postgres:password@db.source-ref.supabase.co:5432/postgres" \
  --target "postgresql://postgres:password@db.target-ref.supabase.co:5432/postgres" \
  --token "sbp_your_access_token_here"
```

### 3. Granular Schema Migration
Migrate only specific parts of your database.

```bash
# Schema only (tables, types, indexes)
supabase-migrator migrate:schema --source "..." --target "..."

# Functions only
supabase-migrator migrate:functions --source "..." --target "..."

# Triggers only
supabase-migrator migrate:triggers --source "..." --target "..."
```

### 4. Database Cleanup (Wipe)
Powerful and destructive cleanup tools.

```bash
# FULL WIPE: Delete all tables, functions, and triggers in public schema
supabase-migrator delete:all --source "..." --force

# Data only: Truncate all tables
supabase-migrator delete:data --source "..." --all --force
```

### 5. Storage Migration
Sync bucket configuration between projects.

```bash
supabase-migrator migrate:buckets \
  --source-url "https://source.supabase.co" \
  --source-key "ey..." \
  --target-url "https://target.supabase.co" \
  --target-key "ey..."
```

---

## Command List

| Command | Description |
|---------|-------------|
| `migrate:all` | Schema + Functions + Triggers + Data |
| `migrate:schema` | Tables, Types, Constraints, Indexes |
| `migrate:functions` | Migrate DB functions only |
| `migrate:triggers` | Migrate DB triggers only |
| `migrate:data` | Table data only (Streaming) |
| `migrate:edge-functions` | Deploy Edge Functions between projects |
| `migrate:buckets`| Sync storage buckets via Admin API |
| `export:database`| Full introspection to SQL/JSON files |
| `export:functions`| Export DB functions to SQL file |
| `import:database`| Apply SQL files in correct order |
| `export:bucket-policies`| Export storage RLS policies to SQL |
| `delete:all` | FULL WIPE (Tables, Functions, Triggers) |
| `delete:data` | TRUNCATE/DELETE table data |
| `delete:function`| Drop functions (supports overloading) |
| `delete:trigger` | Drop triggers |

---

## In-Depth Guides

- [**Export Guide**](./EXPORT-GUIDE.md) - Deep dive into database introspection.
- [**Import/Runner Guide**](./IMPORT-GUIDE.md) - How the migration runner works and idempotency.

---

## Safety & Best Practices

1. **Dry Run First**: Always use the `--dry-run` flag to preview changes.
2. **Review SQL**: Before importing, review generated SQL files in the output directory.
3. **Database Backups**: Take a snapshot of your target database before running destructive commands.
4. **Service Role Keys**: Keep your `.env` keys secure. These keys bypass RLS and should be guarded.

---

## License

MIT License. See [LICENSE](./LICENSE) for details.

---

## Pre-publish Checklist

Before publishing to npm, follow these steps to ensure a high-quality release:

1. **Self-Check**:
   - [ ] Version in `package.json` is updated according to SemVer.
   - [ ] `.env.example` is up to date with new features.
   - [ ] All sensitive credentials (tokens, passwords) are removed from code and examples.

2. **Validation Commands**:
   ```bash
   # 1. Clean and build the package
   npm run clean
   npm run build

   # 2. Run all tests
   npm run test

   # 3. Lint and format code
   npm run lint
   npm run format

   # 4. Dry-run the package contents
   npm pack --dry-run
   ```

3. **Verify Output**:
   Check the `npm pack --dry-run` output. It should ONLY contain:
   - `dist/` (CJS, ESM, and Types)
   - `README.md`
   - `LICENSE`
   - `.env.example`
   - `package.json`

4. **Publish**:
   ```bash
   npm publish --access public
   ```

---

