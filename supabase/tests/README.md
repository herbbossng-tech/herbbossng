# GCOS database regression suite

Runs the full migration chain (`supabase/migrations/`) plus this
directory's SQL test files against a plain local/CI Postgres 16 server
— no Supabase project, network access, or hosted credentials required.

## Running locally

```bash
# Requires a local Postgres 16 reachable via standard libpq env vars
# (PGHOST/PGPORT/PGUSER/PGPASSWORD). Defaults to localhost:5432/postgres.
bash scripts/run-db-tests.sh
```

Each `.sql` file in this directory gets its own freshly migrated
database — several older files reuse identical short fixture UUIDs, so
running them in one continuous session would collide.

## How impersonation works

`auth.uid()` is stubbed to read a session GUC instead of a real
Supabase JWT:

```sql
select set_config('app.test_user_id', '<uuid>', false);
set role authenticated;
-- ... assertions as that user ...
reset role;
```

`00_bootstrap_pre_migration.sql` sets this up (roles, `auth`/`storage`
schema stand-ins, the `auth.uid()` stub) and runs *before* the
migration chain, since migrations reference `auth.users` via foreign
key. `00_bootstrap_post_migration.sql` grants `authenticated`/`anon`
their standard Supabase-equivalent table privileges and runs *after*
the migration chain — granting those privileges before any table
exists grants nothing, silently turning an intended RLS-filtered empty
result into a hard "permission denied for table" error instead. (This
exact ordering mistake was caught and fixed during Phase 15 validation
— see that file's own comment.)

## Why five older smoke tests aren't here

`97_orders_smoke_test.sql`, `98_inventory_smoke_test.sql`,
`98_orders_hardening_smoke_test.sql`, `99_customers_smoke_test.sql`,
and `100_landing_pages_smoke_test.sql` (from early in this project's
history) impersonate users via `request.jwt.claim.sub`, an older
convention that predates the `app.test_user_id` GUC every later test
file (and this directory's bootstrap) uses. They fail under the
current harness for that reason alone — not because of any defect in
the application code they exercise, which has since been re-certified
by later, broader suites covering the same domains (e.g. orders/
inventory correctness is re-verified end-to-end by
`109_gcos_cross_system_integrity_test.sql`). This has been documented
and re-confirmed unrelated across every phase since Phase 9. They are
intentionally excluded from this directory rather than committed in a
permanently-red state.

## Adding a new suite

Name it `<next-number>_<description>.sql`, using `set_config('app.test_user_id', ...)`
+ `set role authenticated` / `set role anon` for impersonation, and end
successfully (exit code 0) only when every scenario in the file passed
— `run-db-tests.sh` treats any nonzero `psql` exit as a failure.
