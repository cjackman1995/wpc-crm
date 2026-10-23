#!/usr/bin/env bash
# Rebuilds a scratch database and runs the permission tests against it.
# Usage: TEST_DATABASE_URL=postgresql://user:pass@localhost:5432/postgres npm run test:db
set -euo pipefail
ADMIN_URL="${TEST_DATABASE_URL:-postgresql://postgres@localhost:5432/postgres}"
DB=crm_rls_test
psql "$ADMIN_URL" -qc "drop database if exists $DB" -c "create database $DB"
TEST_URL="${ADMIN_URL%/*}/$DB"
psql "$TEST_URL" -q -v ON_ERROR_STOP=1 -f supabase/tests/auth_shim.sql
for f in supabase/migrations/*.sql; do psql "$TEST_URL" -q -v ON_ERROR_STOP=1 -f "$f"; done
psql "$TEST_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_test.sql 2>&1 | sed 's/^psql:[^ ]* NOTICE:  //'
psql "$ADMIN_URL" -qc "drop database $DB"
