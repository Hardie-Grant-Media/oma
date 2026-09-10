-- Keep the browser API narrow. Private tables remain service-only.
alter role authenticator set pgrst.db_schemas = 'api';
notify pgrst, 'reload config';
notify pgrst, 'reload schema';
do $$ declare t record; begin
 for t in select tablename from pg_tables where schemaname='private' loop
  execute format('alter table private.%I enable row level security',t.tablename);
 end loop;
 if to_regprocedure('public.rls_auto_enable()') is not null then
  revoke execute on function public.rls_auto_enable() from public,anon,authenticated;
 end if;
end $$;
