-- ############################################################
-- DESTRUCTIVE: permanently deletes ALL AMS data in schema "public"
-- (students, attendance, holidays, profiles, requests, contacts).
-- It does NOT touch auth, storage, or any Supabase internal schema,
-- and does not delete Auth users. Run manually, once, then run
-- migrations/001_ams_schema.sql.
-- ############################################################
begin;
drop table if exists public.attendance, public.attendance_records, public.students, public.holidays,
  public.password_reset_requests, public.admin_contacts, public.user_roles, public.profiles cascade;
do $$ declare r record; begin
  for r in select p.oid::regprocedure as f from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and not exists(select 1 from pg_depend d where d.objid=p.oid and d.deptype='e')
  loop execute 'drop function if exists '||r.f||' cascade'; end loop;
  for r in select t.typname from pg_type t join pg_namespace n on n.oid=t.typnamespace
    where n.nspname='public' and t.typtype='e'
  loop execute 'drop type if exists public.'||quote_ident(r.typname)||' cascade'; end loop;
  for r in select tablename from pg_tables where schemaname='public' loop
    raise notice 'Table left untouched (not a known AMS table): %', r.tablename; end loop;
end $$;
commit;
