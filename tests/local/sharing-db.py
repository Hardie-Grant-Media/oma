"""Run the sharing migration against isolated PostgreSQL when Docker is unavailable.
Uses original OMA table/helper definitions; substitutes only Supabase's auth.users.
Never connects to a hosted database. PostgreSQL must run on 127.0.0.1:55439.
"""
from pathlib import Path
import subprocess
root = Path(__file__).resolve().parents[2]
psql = '/opt/homebrew/opt/postgresql@14/bin/psql'
def sql(text):
    result = subprocess.run([psql,'-h','127.0.0.1','-p','55439','-d','postgres','-v','ON_ERROR_STOP=1','-X'],input=text,text=True,capture_output=True)
    if result.returncode: raise RuntimeError(result.stderr)
    return result.stdout
core=(root/'supabase/migrations/20260908003517_oma_core.sql').read_text()
bootstrap='''create role anon; create role authenticated; create role service_role;
create schema api; create schema private; create schema extensions; create schema auth;
create extension pgcrypto with schema extensions;
create table auth.users(id uuid primary key,email text);
grant usage on schema api to service_role,authenticated;
'''
bootstrap+=core[core.index('create table api.members'):core.index('create table private.jobs')]
bootstrap+=core[core.index('create table private.report_files'):core.index('create table private.events')]
bootstrap+=core[core.index('create function private.active_member'):core.index('-- Policies can invoke')]
# Unique fresh database process/directory required; no destructive resets.
if sql("select count(*) from pg_namespace where nspname='api';").splitlines()[2].strip()=='0':
    sql(bootstrap)
    sql((root/'supabase/migrations/20260910000410_report_sharing.sql').read_text())
migration=(root/'supabase/migrations/20260910000410_report_sharing.sql').read_text()
sql(migration[migration.index('create function api.share_command'):].replace('create function ', 'create or replace function '))
checks='''
create function pg_temp.ok(value boolean,label text) returns text language plpgsql as $$
begin if value is distinct from true then raise exception 'FAILED: %',label; end if; return 'PASS: '||label; end $$;
create function pg_temp.is(actual anyelement,expected anyelement,label text) returns text language plpgsql as $$
begin if actual is distinct from expected then raise exception 'FAILED: %',label; end if; return 'PASS: '||label; end $$;
create function pg_temp.lives_ok(statement text,label text) returns text language plpgsql as $$
begin execute statement; return 'PASS: '||label; end $$;
create function pg_temp.throws_ok(statement text,code text,message text,label text) returns text language plpgsql as $$
begin
 begin execute statement;
 exception when others then
  if sqlstate=code and sqlerrm=message then return 'PASS: '||label; end if;
  raise exception 'FAILED: % (unexpected error: %)',label,sqlerrm;
 end;
 raise exception 'FAILED: % (no error)',label;
end $$;
'''
tests=(root/'supabase/tests/report_sharing.test.sql').read_text()
tests=tests.replace('create extension if not exists pgtap with schema extensions;','').replace('select no_plan();','').replace('select * from finish();','')
for name in ['ok','is','lives_ok','throws_ok']:
 tests=tests.replace('select '+name+'(', 'select pg_temp.'+name+'(')
output=sql(checks+tests)
print('\n'.join(line.strip() for line in output.splitlines() if 'PASS:' in line))

# Real concurrent connections exercise database locks, not mocked rate-limit code.
from concurrent.futures import ThreadPoolExecutor
import json
seed=tests[:tests.index('create function pg_temp.share_args')]
sql(seed+'commit;')
args={'audit_id':'33000000-0000-4000-8000-000000000001','version':1,'request_key':'55000000-0000-4000-8000-000000000003','token_hash':'d'*64,'password':'synthetic-password'}
create="select api.share_command('11000000-0000-4000-8000-000000000001','share_create','"+json.dumps(args)+"'::jsonb);"
try:
    with ThreadPoolExecutor(max_workers=8) as pool: list(pool.map(sql,[create]*8))
    count=sql("select count(*) from private.report_shares;")
    assert count.splitlines()[2].strip()=='1', 'Concurrent create produced duplicates'
    print('PASS: Concurrent idempotent creation makes one share')
    with ThreadPoolExecutor(max_workers=8) as pool:
        results=list(pool.map(sql,["select api.read_shared_report(repeat('d',64),'wrong-password');"]*8))
    assert all('unavailable' in result for result in results)
    count=sql("select password_attempts from private.report_shares;")
    assert count.splitlines()[2].strip()=='5', 'Concurrent attempts exceeded limit'
    print('PASS: Concurrent password attempts stop at five')
finally:
    sql("delete from api.audits where id='33000000-0000-4000-8000-000000000001';delete from api.clients where id='22000000-0000-4000-8000-000000000001';delete from api.members where id in ('11000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000002');delete from auth.users where id in ('11000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000002');")
