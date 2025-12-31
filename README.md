# supabase-migrator

**Comprehensive migration and cleanup toolkit for Supabase PostgreSQL databases.**

[![NPM Version](https://img.shields.io/npm/v/supabase-migrator.svg)](https://www.npmjs.com/package/supabase-migrator)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## 🌟 Features

- ✅ **Complete Introspection** - Introspects extensions, custom types, sequences, tables, constraints, indexes, views, and functions.
- ✅ **Schema Migration** - Safe recreation of complex schemas across projects.
- ✅ **Data Migration** - Streaming/batched data export in SQL or JSON formats.
- ✅ **Dependency-Aware** - Automatically orders table exports based on foreign key dependencies.
- ✅ **Idempotent Imports** - SQL generations use `IF NOT EXISTS` and `CREATE OR REPLACE` for safe re-runs.
- ✅ **Storage Support** - Securely sync buckets via Supabase Admin APIs and export RLS policies.
- ✅ **Cleanup Utility** - Powerful `delete:*` commands with `TRUNCATE` and `CASCADE` support.
- ✅ **Developer Friendly** - Detailed logs, dry-run modes, progress tracking, and interactive summaries.

---

## 🚀 Installation

```bash
# Install globally
npm install -g supabase-migrator

# Or run via npx
npx supabase-migrator --help
```

---

## ⚙️ Setup

Create a `.env` file or set environment variables:

```env
# Source Database
SOURCE_CONNECTION_STRING=postgresql://postgres:password@db.source-project.supabase.co:5432/postgres

# Target Database
TARGET_CONNECTION_STRING=postgresql://postgres:password@db.target-project.supabase.co:5432/postgres

# Storage Migration API (Required for migrate:buckets)
SOURCE_SUPABASE_URL=https://source.supabase.co
SOURCE_SERVICE_ROLE_KEY=ey...
TARGET_SUPABASE_URL=https://target.supabase.co
TARGET_SERVICE_ROLE_KEY=ey...
```

---

## 🛠️ Usage Guide

### 1. Database Migration (Direct)

Migrate everything directly from one database to another.

```bash
# Migrate all objects and data
supabase-migrator migrate:all \
  --source $SOURCE_CONNECTION_STRING \
  --target $TARGET_CONNECTION_STRING

# Migrate schema only
supabase-migrator migrate:schema \
  --source $SOURCE_CONNECTION_STRING \
  --target $TARGET_CONNECTION_STRING
```

### 2. Export & Import Workflow (Recommended)

Better for version control and manual review.

```bash
# 1. Export database to SQL files
supabase-migrator export:database \
  --source $SOURCE_CONNECTION_STRING \
  --output ./backup

# 2. Preview the import
supabase-migrator import:database \
  --target $TARGET_CONNECTION_STRING \
  --source ./backup \
  --dry-run

# 3. Apply the migration
supabase-migrator import:database \
  --target $TARGET_CONNECTION_STRING \
  --source ./backup
```

### 3. Storage Migration

Safe bucket synchronization and manual policy application.

```bash
# Sync bucket configuration
supabase-migrator migrate:buckets \
  --source-url $SOURCE_SUPABASE_URL \
  --source-key $SOURCE_SERVICE_ROLE_KEY \
  --target-url $TARGET_SUPABASE_URL \
  --target-key $TARGET_SERVICE_ROLE_KEY

# Export policies for manual review
supabase-migrator export:bucket-policies \
  --source $SOURCE_CONNECTION_STRING
```

*Note: Bucket policies should be reviewed in the output `bucket-policies.sql` and applied manually in the target SQL Editor.*

### 4. Database Cleanup

Powerful and destructive cleanup tools.

```bash
# Preview deleting all data from public schema
supabase-migrator delete:data --all --dry-run

# Force delete all data except specific tables
supabase-migrator delete:data \
  --source $TARGET_CONNECTION_STRING \
  --all \
  --exclude-table migrations \
  --force

# Delete specific function overload
supabase-migrator delete:function \
  --function calculate_stats \
  --signature "calculate_stats(int, timestamp)" \
  --force
```

---

## 📋 Command List

| Command | Description |
|---------|-------------|
| `migrate:all` | Schema + Functions + Triggers + Data |
| `migrate:schema` | Tables, Types, Constraints, Indexes |
| `migrate:data` | Table data only (Streaming) |
| `migrate:buckets`| Sync storage buckets via Admin API |
| `export:database`| Full introspection to SQL/JSON files |
| `import:database`| Apply SQL files in correct order |
| `export:bucket-policies`| Export storage RLS policies to SQL |
| `delete:data` | TRUNCATE/DELETE table data |
| `delete:function`| Drop functions (supports overloading) |
| `delete:trigger` | Drop triggers |

---

## 📖 In-Depth Guides

- [**Export Guide**](./EXPORT-GUIDE.md) - Deep dive into database introspection.
- [**Import/Runner Guide**](./IMPORT-GUIDE.md) - How the migration runner works and idempotency.

---

## 🛡️ Safety & Best Practices

1. **Dry Run First**: Always use the `--dry-run` flag to preview changes.
2. **Review SQL**: Before importing, review generated SQL files in the output directory.
3. **Database Backups**: Take a snapshot of your target database before running destructive commands.
4. **Service Role Keys**: Keep your `.env` keys secure. These keys bypass RLS and should be guarded.

---

## ⚖️ License

MIT License. See [LICENSE](./LICENSE) for details.

---

## 🤝 Support

Found a bug? [Open an issue](https://github.com/example/supabase-migrator/issues).
Wanna contribute? Check out the [Contribution Guide](./CONTRIBUTING.md).
