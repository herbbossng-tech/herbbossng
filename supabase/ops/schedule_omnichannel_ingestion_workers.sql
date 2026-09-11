-- ============================================================
-- GOLDEN COMMERCE OS — schedule the omnichannel order-ingestion
-- worker Edge Functions (0053: Shopify/WooCommerce/Google Sheets).
--
-- THIS FILE IS NOT A MIGRATION. Do not add it to supabase/migrations/
-- and do not run it through `supabase db push` or scripts/run-db-tests.sh
-- — it depends on pg_cron/pg_net, exactly like
-- schedule_dispatch_workers.sql (read that file first if you haven't
-- already — this one assumes the same one-time setup pattern).
--
-- WHAT EACH FUNCTION NEEDS SCHEDULING, AND WHY
--   - ingest-shopify-order is a WEBHOOK, not a scheduled worker — it
--     is invoked by Shopify itself whenever an order is created, and
--     does NOT belong in this file. Instead, register its URL
--     (https://<PROJECT_REF>.supabase.co/functions/v1/ingest-shopify-order)
--     as a webhook in each connected store's custom/private app
--     (orders/create and orders/paid topics).
--   - sync-woocommerce-orders and sync-google-sheets-orders are
--     PULL-based: WooCommerce has no universal built-in push webhook
--     and a spreadsheet cannot push at all, so both must be polled on
--     a schedule.
--   - retry-external-ingestion drains the backoff-retry queue for
--     genuine pipeline failures (not needs_review rows, which always
--     require a human) — the omnichannel equivalent of
--     dispatch-communication/dispatch-tracking-event.
--
-- ONE-TIME SETUP (run this whole file, once, in your Supabase
-- project's SQL Editor):
--
-- 1. Deploy the three scheduled functions (ingest-shopify-order is
--    deployed too, but invoked by Shopify's webhook, not by cron):
--      supabase functions deploy ingest-shopify-order
--      supabase functions deploy sync-woocommerce-orders
--      supabase functions deploy sync-google-sheets-orders
--      supabase functions deploy retry-external-ingestion
--      supabase functions deploy google-oauth-callback
--
-- 2. Reuse the SAME CRON_CALLER_SECRET already set for
--    dispatch-communication/dispatch-tracking-event (schedule_dispatch_workers.sql)
--    — all these functions check the identical `x-cron-secret` header.
--    If you have not set one yet:
--      supabase secrets set CRON_CALLER_SECRET=<a-long-random-string>
--
-- 3. Set the Google OAuth credentials (only needed for the Google
--    Sheets source — skip if you are not using it):
--      supabase secrets set GOOGLE_OAUTH_CLIENT_ID=<from Google Cloud Console>
--      supabase secrets set GOOGLE_OAUTH_CLIENT_SECRET=<from Google Cloud Console>
--      supabase secrets set APP_BASE_URL=<your deployed frontend origin>
--    Register https://<PROJECT_REF>.supabase.co/functions/v1/google-oauth-callback
--    as an Authorized redirect URI on that OAuth 2.0 Client.
--
-- 4. Replace <PROJECT_REF> and <CRON_CALLER_SECRET> below, then run
--    this entire file in the SQL Editor.
-- ============================================================

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- WooCommerce: every 5 minutes is a reasonable default for a COD/DTC
-- store's order volume — tune with cron.alter_job() if a brand needs
-- tighter latency.
select cron.schedule(
  'sync-woocommerce-orders-every-5-minutes',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/sync-woocommerce-orders',
    headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', '<CRON_CALLER_SECRET>'),
    body := '{}'::jsonb
  );
  $$
);

-- Google Sheets: a human is typically the one adding rows, so a
-- slightly longer interval is fine and reduces Sheets API quota usage.
select cron.schedule(
  'sync-google-sheets-orders-every-5-minutes',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/sync-google-sheets-orders',
    headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', '<CRON_CALLER_SECRET>'),
    body := '{}'::jsonb
  );
  $$
);

select cron.schedule(
  'retry-external-ingestion-every-minute',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/retry-external-ingestion',
    headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', '<CRON_CALLER_SECRET>'),
    body := '{}'::jsonb
  );
  $$
);

-- Verify all jobs registered:
--   select jobid, jobname, schedule, active from cron.job;
--
-- Watch recent runs:
--   select * from cron.job_run_details
--     where jobname like '%external-ingestion%' or jobname like 'sync-%-orders%'
--     order by start_time desc limit 20;
