"""Test MCP audience migration on a fresh, isolated local PostgreSQL cluster.
No hosted access. Uses installed initdb/pg_ctl/psql; only a temporary Unix socket.
"""
from pathlib import Path
import subprocess
import tempfile

root = Path(__file__).resolve().parents[2]
with tempfile.TemporaryDirectory(prefix="oma-mcp-pg-") as directory:
    base = Path(directory)
    data = base / "data"
    def run(*args, input=None):
        result = subprocess.run(args, input=input, text=True, capture_output=True, timeout=30)
        if result.returncode:
            raise RuntimeError(result.stderr)
        return result.stdout
    run("initdb", "-D", str(data), "-A", "trust", "--no-locale")
    run("pg_ctl", "-D", str(data), "-l", str(base / "postgres.log"), "-o", f"-h '' -k {base} -p 55441", "-w", "start")
    def sql(text):
        return run("psql", "-h", str(base), "-p", "55441", "-d", "postgres", "-X", "-v", "ON_ERROR_STOP=1", input=text)
    try:
        sql("create schema private; create role anon; create role authenticated; create role service_role; create role supabase_auth_admin;")
        sql((root / "supabase/migrations/20260910013332_mcp_oauth_audience.sql").read_text())
        result = sql('''
insert into private.mcp_oauth_clients values ('00000000-0000-4000-8000-000000000001','https://oma.example/mcp',true);
create function pg_temp.check(value boolean, label text) returns text language plpgsql as $$
begin if value is distinct from true then raise exception 'FAIL: %',label; end if; return 'PASS: '||label; end; $$;
select pg_temp.check(not has_table_privilege('anon','private.mcp_oauth_clients','select'),'anonymous table access denied');
select pg_temp.check(not has_table_privilege('authenticated','private.mcp_oauth_clients','select'),'staff table access denied');
select pg_temp.check(not has_function_privilege('authenticated','private.mcp_access_token_hook(jsonb)','execute'),'staff cannot mint audiences');
select pg_temp.check(not has_function_privilege('anon','private.mcp_access_token_hook(jsonb)','execute'),'anonymous cannot mint audiences');
select pg_temp.check((select relrowsecurity from pg_class where oid='private.mcp_oauth_clients'::regclass),'RLS enabled');
set role supabase_auth_admin;
select pg_temp.check(private.mcp_access_token_hook('{"claims":{"aud":"authenticated","sub":"staff"}}') = '{"claims":{"aud":"authenticated","sub":"staff"}}'::jsonb,'browser claims unchanged');
select pg_temp.check(private.mcp_access_token_hook('{"client_id":"00000000-0000-4000-8000-000000000002","claims":{"aud":"authenticated"}}')->'claims'->>'aud' = 'authenticated','unrelated OAuth unchanged');
select pg_temp.check(private.mcp_access_token_hook('{"client_id":"00000000-0000-4000-8000-000000000001","claims":{"aud":"authenticated","sub":"staff","scope":"email"}}')->'claims' = '{"aud":"https://oma.example/mcp","sub":"staff","scope":"email"}'::jsonb,'dedicated MCP audience; remaining claims preserved');
select pg_temp.check(private.mcp_access_token_hook('{"claims":{"client_id":"00000000-0000-4000-8000-000000000001","aud":"authenticated"}}')->'claims'->>'aud' = 'https://oma.example/mcp','refresh claims client ID supported');
reset role;
update private.mcp_oauth_clients set enabled=false;
set role supabase_auth_admin;
select pg_temp.check(private.mcp_access_token_hook('{"client_id":"00000000-0000-4000-8000-000000000001","claims":{"aud":"authenticated"}}')->'claims'->>'aud' = 'authenticated','disabled mapping does not issue MCP audience');
''')
        print("\n".join(line.strip() for line in result.splitlines() if "PASS:" in line))
    finally:
        run("pg_ctl", "-D", str(data), "-m", "fast", "-w", "stop")
