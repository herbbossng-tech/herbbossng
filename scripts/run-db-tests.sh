#!/bin/bash
# Runs the GCOS Supabase migration chain + the committed regression
# suite (supabase/tests/) against a plain Postgres 16 server — no
# Supabase project required. Each test file gets its own freshly
# migrated database (several older test files reuse identical short
# fixture UUIDs across suites, so running them in one continuous
# session would collide).
#
# Connection is controlled by standard libpq env vars (PGHOST, PGPORT,
# PGUSER, PGPASSWORD, PGDATABASE is ignored/overridden per-run).
# Defaults match the postgres:16 GitHub Actions service container.
set -uo pipefail

PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-postgres}"
export PGHOST PGPORT PGUSER

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATIONS_DIR="$REPO_ROOT/supabase/migrations"
TESTS_DIR="$REPO_ROOT/supabase/tests"
DB_NAME="gcos_ci_test"

psql() { command psql -v ON_ERROR_STOP=1 "$@"; }

fresh_db() {
  # NOTE: `local mig` here is load-bearing, not stylistic — this function
  # is called from inside the caller's own `for f in ...` loop below, and
  # bash functions share the caller's variable scope. A loop variable
  # here named `f` (matching the caller's) would silently clobber the
  # caller's `f` for the rest of that iteration once this function
  # returns, making the caller re-run whatever migration file this loop
  # last touched instead of the test file it meant to run. (Caught by
  # this exact bug during Phase 15 validation — every test appeared to
  # "pass" because none of them were actually being executed.)
  local mig
  psql -d postgres -c "DROP DATABASE IF EXISTS $DB_NAME;" > /dev/null
  psql -d postgres -c "CREATE DATABASE $DB_NAME;" > /dev/null
  psql -d "$DB_NAME" -f "$TESTS_DIR/00_bootstrap_pre_migration.sql" > /tmp/ci_bootstrap.log 2>&1
  if [ $? -ne 0 ]; then
    echo "PRE-MIGRATION BOOTSTRAP FAILED"; cat /tmp/ci_bootstrap.log; return 1
  fi
  for mig in "$MIGRATIONS_DIR"/*.sql; do
    psql -d "$DB_NAME" -f "$mig" > /tmp/ci_migrate.log 2>&1
    if [ $? -ne 0 ]; then
      echo "MIGRATION FAILED at $(basename "$mig")"; cat /tmp/ci_migrate.log; return 1
    fi
  done
  # Table grants for authenticated/anon must be issued AFTER every table
  # exists (see that file's own comment for why getting this backwards
  # produces a misleading permission-denied error instead of an
  # RLS-filtered empty result).
  psql -d "$DB_NAME" -f "$TESTS_DIR/00_bootstrap_post_migration.sql" > /tmp/ci_bootstrap_post.log 2>&1
  if [ $? -ne 0 ]; then
    echo "POST-MIGRATION BOOTSTRAP FAILED"; cat /tmp/ci_bootstrap_post.log; return 1
  fi
}

echo "=== Migration chain sanity check (single fresh DB) ==="
fresh_db || exit 1
echo "OK: full migration chain applies cleanly."
echo ""

PASS=()
FAIL=()

for f in "$TESTS_DIR"/*.sql; do
  name="$(basename "$f")"
  case "$name" in 00_bootstrap_pre_migration.sql|00_bootstrap_post_migration.sql) continue ;; esac
  echo "=================================================================="
  echo "=== $name ==="
  fresh_db || { FAIL+=("$name (fresh_db setup failed)"); continue; }
  psql -d "$DB_NAME" -f "$f" > /tmp/ci_test_out.log 2>&1
  rc=$?
  tail -20 /tmp/ci_test_out.log
  if [ $rc -eq 0 ]; then
    PASS+=("$name")
  else
    FAIL+=("$name")
  fi
done

psql -d postgres -c "DROP DATABASE IF EXISTS $DB_NAME;" > /dev/null

echo ""
echo "=================================================================="
echo "PASS (${#PASS[@]}): ${PASS[*]:-none}"
echo "FAIL (${#FAIL[@]}): ${FAIL[*]:-none}"

if [ "${#FAIL[@]}" -gt 0 ]; then
  exit 1
fi
