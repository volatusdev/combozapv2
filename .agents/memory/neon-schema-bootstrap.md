---
name: Neon schema bootstrap
description: Neon DB has no schema by default; drizzle-kit push quirks in CI
---

## Rule
Neon DB starts empty. Schema must be bootstrapped manually via psql SQL before first deploy.
drizzle-kit push works for incremental changes after that, but requires `yes |` pipe in CI.

**Why:** drizzle-kit push prompts interactively when detecting potential renames on a brand-new DB. Without TTY it throws "Interactive prompts require a TTY terminal" and exits 1.

**How to apply:** deploy.yml uses `yes | DATABASE_URL="$DB_URL" pnpm --filter @workspace/db run push`. Manual bootstrap via `psql $NEON_URL_DATABASE` with raw CREATE TABLE SQL.

## sdr_tags "desc" column
The `desc` column in sdr_tags is a PostgreSQL reserved word — must be quoted as `"desc"` in raw SQL.
Drizzle handles this automatically but raw psql needs the quotes.
