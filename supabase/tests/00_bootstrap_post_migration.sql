-- Runs AFTER the migration chain, mirroring what a real Supabase
-- project's default grants give the authenticated/anon roles on every
-- table (RLS is the actual enforcement boundary in Supabase — table
-- grants are intentionally broad). This MUST run after migrations,
-- not before: a blanket "grant select on all tables in schema public"
-- issued before any table exists grants nothing, and relying on
-- `alter default privileges` alone does not cover anon (Supabase's
-- anon role gets table-level SELECT the same way authenticated does).
-- Getting this ordering wrong makes anon's read attempts fail with a
-- hard "permission denied for table" GRANT-level error instead of the
-- RLS-filtered empty result a real Supabase project would return —
-- caught during Phase 15 validation when 117's anonymous-denial
-- scenario failed for the wrong reason after this file was briefly
-- merged into the pre-migration bootstrap and reordered ahead of the
-- migration chain.
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated, anon;

alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant execute on functions to authenticated, anon;
