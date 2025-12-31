# Supabase Migrator 🚀

A powerful, all-in-one CLI toolkit for seamless migration, cleanup, and management of Supabase PostgreSQL databases.

[![npm version](https://badge.fury.io/js/supabase-migrator.svg)](https://www.npmjs.com/package/supabase-migrator)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## 🌟 Features

- **Full Migration**: One command to migrate Schema, Functions, Triggers, and Data.
- **Stable Data Sync**: Intelligent batching with primary-key-based stable pagination.
- **Edge Function Support**: Deploy Edge Functions directly between projects.
- **Storage Migration**: Move buckets and their security policies effortlessly.
- **Cleanup Toolkit**: Safely delete specific tables, functions, or perform a total schema reset.
- **Smart Dependencies**: Automatically orders table migration based on foreign key relationships.
- **Dry Run Support**: Preview changes before they hit your production database.

---

## 🚀 Quick Start

### 1. Installation

Install globally via NPM:

```bash
npm install -g supabase-migrator
```

### 2. Environment Setup (Optional)

You can use a `.env` file or pass connection strings directly.

```bash
SOURCE_CONNECTION_STRING="postgresql://postgres:password@db.source.supabase.co:5432/postgres"
TARGET_CONNECTION_STRING="postgresql://postgres:password@db.target.supabase.co:5432/postgres"
SUPABASE_ACCESS_TOKEN="sbp_your_personal_access_token"
```

---

## 📖 Complete Command Guide (A to Z)

### 🧩 1. Full Project Migration
The most powerful command. Moves everything from Project A to Project B.

**Migrate EVERYTHING:**
```bash
supabase-migrator migrate:all --source "SRC_URL" --target "TARGET_URL"
```

**Migrate EVERYTHING (Fast Mode - skip prompts):**
```bash
supabase-migrator migrate:all --source "SRC_URL" --target "TARGET_URL" --force
```

---

### 🏗️ 2. Granular Schema Migration
If you only want to move specific parts of your database.

**Migrate Schema only (Tables, Types, Indexes):**
```bash
supabase-migrator migrate:schema --source "SRC_URL" --target "TARGET_URL"
```

**Migrate Functions only:**
```bash
supabase-migrator migrate:functions --source "SRC_URL" --target "TARGET_URL"
```

**Migrate Triggers only:**
```bash
supabase-migrator migrate:triggers --source "SRC_URL" --target "TARGET_URL"
```

---

### 📊 3. Data Migration
Move your data with precision. 

**Migrate data for ALL tables:**
```bash
supabase-migrator migrate:data --source "SRC_URL" --target "TARGET_URL"
```

**Migrate data for a SPECIFIC table:**
```bash
supabase-migrator migrate:data --source "SRC_URL" --target "TARGET_URL" --table "users"
```

**Migrate and CLEAN target before inserting (Truncate):**
```bash
supabase-migrator migrate:data --source "SRC_URL" --target "TARGET_URL" --truncate
```

---

### ⚡ 4. Edge Functions Migration
Requires a [Supabase Personal Access Token](https://supabase.com/dashboard/account/tokens).

**Migrate all Edge Functions:**
```bash
supabase-migrator migrate:edge-functions --source "SRC_URL" --target "TARGET_URL" --token "your_token"
```

---

### 🪣 5. Storage & Buckets
Move your files and permissions.

**Migrate Storage Buckets:**
```bash
supabase-migrator migrate:buckets --source-url "SRC_URL" --source-key "SRC_KEY" --target-url "TGT_URL" --target-key "TGT_KEY"
```

**Export Bucket Policies (SQL):**
```bash
supabase-migrator export:bucket-policies --source "SRC_URL"
```

---

### 🧹 6. Cleanup & Deletion
Be careful! These commands are destructive.

**DESTRUCTIVE: Wipe Target Database (Schema, functions, triggers, tables):**
```bash
supabase-migrator delete:all --source "TARGET_URL"
```

**Delete data from ALL tables (Keep structure):**
```bash
supabase-migrator delete:data --source "TARGET_URL" --all
```

**Delete data from ONE table:**
```bash
supabase-migrator delete:data --source "TARGET_URL" --table "logs"
```

**Delete ONE function:**
```bash
supabase-migrator delete:function --source "TARGET_URL" --function "my_func"
```

---

### 💾 7. Backup & Offline Export
Download your database as SQL files.

**Export complete DB to SQL:**
```bash
supabase-migrator export:database --source "SRC_URL" --output "./backup"
```

**Export only functions:**
```bash
supabase-migrator export:functions --source "SRC_URL" --schema "public"
```

**Export specific table data to JSON:**
```bash
supabase-migrator export:database --source "SRC_URL" --table "products" --format json
```

**Import from local SQL files:**
```bash
supabase-migrator import:database --target "TARGET_URL" --source "./supabase-migrator"
```

---

## ⚙️ Options & Flags

| Flag | Description | Default |
|------|-------------|---------|
| `-s, --source` | Source Database connection string (Postgres URL) | Required |
| `-t, --target` | Target Database connection string (Postgres URL) | Required |
| `--schema` | Database schema to operate on | `public` |
| `--table` | Filter operation to a single table name | - |
| `--dry-run` | Log what would happen without making changes | `false` |
| `--force` | Skip confirmation prompts for destructive actions | `false` |
| `--truncate` | Delete existing data in target before migration | `false` |
| `--batch-size` | Number of rows per batch for data sync | `1000` |
| `--token` | Supabase Personal Access Token (for Edge Functions) | - |
| `-o, --output` | Folder where logs and SQL exports are saved | `./supabase-migrator` |

---

## 💡 Best Practices

1. **Always use `--dry-run` first**: Preview exactly what the tool will do before executing.
2. **Back up your target**: Run `export:database` on your destination before migrating.
3. **Use `--force` in CI/CD**: If running in a pipeline, use the `--force` flag to skip interactive prompts.
4. **Primary Keys**: Ensure your tables have primary keys for the most reliable data migration.

---


## 📄 License
This project is licensed under the MIT License - see the LICENSE file for details.
