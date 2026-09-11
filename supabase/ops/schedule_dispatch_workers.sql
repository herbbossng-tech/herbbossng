-- ============================================================
-- GOLDEN COMMERCE OS — schedule the queue-draining Edge Functions.
--
-- THIS FILE IS NOT A MIGRATION. Do not add it to supabase/migrations/
-- and do not run it through `supabase db push` or scripts/run-db-tests.sh
-- — it depends on pg_cron/pg_net, which exist on a real Supabase
-- project but NOT on the plain postgres:16 image the CI regression
-- suite and local validation runs against. Adding this to the
-- migration chain would break both.
--
-- WHY THIS EXISTS
-- communication_log and tracking_dispatch_log are queues: something
-- inserts a 'queued' row (an automation rule, Test Connection, a
-- landing-page order), and only a WORKER makes it 'sent'/'delivered'/
-- 'failed'. The worker is the dispatch-communication /
-- dispatch-tracking-event Edge Functions — but nothing in this
-- project has ever called them on a schedule. Every migration that
-- touches this queue (0028, 0030, 0032) says so explicitly in its own
-- comments ("intended to be invoked periodically... it is not
-- self-scheduling"). Without this step, EVERY queued message —
-- Test Connection, the New Order Received notification, order-status
-- SMS/WhatsApp, Meta/TikTok conversions — sits at 'queued' forever,
-- which is exactly the "Test message queued" behavior with no
-- follow-up that prompted this file.
--
-- ONE-TIME SETUP (run this whole file, once, in your Supabase
-- project's SQL Editor — not via the CLI/migration chain):
--
-- 1. Deploy both Edge Functions if you haven't already:
--      supabase functions deploy dispatch-communication
--      supabase functions deploy dispatch-tracking-event
--
-- 2. Set the shared secret both functions already check for
--    (`x-cron-secret` — see each function's own header comment).
--    Generate any long random string and set it as a function secret:
--      supabase secrets set CRON_CALLER_SECRET=<a-long-random-string>
--
-- 3. Replace the two placeholders below —
--      <PROJECT_REF>            e.g. abcdefghijklmnop (from your
--                                Supabase project's API URL/Settings)
--      <CRON_CALLER_SECRET>     the exact string from step 2
--    — then run this entire file in the SQL Editor.
--
-- This scheduling approach (pg_cron + pg_net calling an Edge
-- Function's URL) is Supabase's own documented pattern for periodic
-- Edge Function invocation; both extensions are pre-available on
-- every Supabase project (Database -> Extensions), just not on a
-- bare postgres:16 container.
-- ============================================================

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'dispatch-communication-every-minute',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/dispatch-communication',
    headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', '<CRON_CALLER_SECRET>'),
    body := '{}'::jsonb
  );
  $$
);

select cron.schedule(
  'dispatch-tracking-event-every-minute',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/dispatch-tracking-event',
    headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', '<CRON_CALLER_SECRET>'),
    body := '{}'::jsonb
  );
  $$
);

-- Verify both jobs registered:
--   select jobid, jobname, schedule, active from cron.job;
--
-- Watch a job's recent runs (useful right after setup, or if
-- Integration Health still shows stuck 'queued'/'pending' rows):
--   select * from cron.job_run_details
--     where jobname in ('dispatch-communication-every-minute', 'dispatch-tracking-event-every-minute')
--     order by start_time desc limit 20;
--
-- To change the interval (e.g. every 2 minutes) or pause a job:
--   select cron.alter_job(job_id := (select jobid from cron.job where jobname = 'dispatch-communication-every-minute'), schedule := '*/2 * * * *');
--   select cron.unschedule('dispatch-communication-every-minute');
