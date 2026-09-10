-- Dedicated OAuth clients and token audiences. No production client is enabled
-- by this migration; registration and Auth hook activation are release steps.
create table private.mcp_oauth_clients (
  client_id uuid primary key,
  resource_url text not null check (length(resource_url) <= 512 and resource_url ~ '^https?://[^[:space:]]+$'),
  enabled boolean not null default true
);
alter table private.mcp_oauth_clients enable row level security;
revoke all on private.mcp_oauth_clients from public, anon, authenticated, service_role;
grant usage on schema private to supabase_auth_admin;
grant select on private.mcp_oauth_clients to supabase_auth_admin;
create policy mcp_auth_read on private.mcp_oauth_clients for select to supabase_auth_admin using (true);

create function private.mcp_access_token_hook(event jsonb) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare
  claims jsonb := event->'claims';
  oauth_client text := coalesce(event->>'client_id', event->'claims'->>'client_id');
  audience text;
begin
  -- Existing browser/password tokens and unrelated OAuth clients pass through.
  if oauth_client is null then return event; end if;
  select resource_url into audience from private.mcp_oauth_clients
    where client_id::text = oauth_client and enabled;
  if audience is null then return event; end if;
  claims := jsonb_set(claims, '{aud}', to_jsonb(audience));
  return jsonb_set(event, '{claims}', claims);
end;
$$;
revoke all on function private.mcp_access_token_hook(jsonb) from public, anon, authenticated, service_role;
grant execute on function private.mcp_access_token_hook(jsonb) to supabase_auth_admin;
