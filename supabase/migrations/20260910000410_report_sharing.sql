create extension if not exists pgcrypto with schema extensions;
-- Approved report capabilities. No anonymous table grants or public report storage.
create table private.report_shares (
 id uuid primary key default gen_random_uuid(),
 revision_id uuid not null references api.revisions on delete cascade,
 created_by uuid not null references api.members,
 request_key uuid not null,
 token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
 password_hash text,
 created_at timestamptz not null default now(),
 expires_at timestamptz,
 revoked_at timestamptz,
 window_at timestamptz not null default now(),
 reads integer not null default 0,
 password_window_at timestamptz not null default now(),
 password_attempts integer not null default 0,
 unique(created_by,request_key)
);
create index report_shares_revision_idx on private.report_shares(revision_id);
alter table private.report_shares enable row level security;
revoke all on private.report_shares from public,anon,authenticated;
-- One bounded global bucket prevents random invalid tokens from growing storage.
create table private.report_read_limit (
 id boolean primary key default true check(id),
 window_at timestamptz not null default now(),
 requests integer not null default 0
);
insert into private.report_read_limit(id) values(true);
alter table private.report_read_limit enable row level security;
revoke all on private.report_read_limit from public,anon,authenticated;

create function api.share_command(actor uuid, action text, payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 a api.audits; r api.revisions; s private.report_shares;
 aid uuid := (payload->>'audit_id')::uuid;
 expiry timestamptz := (payload->>'expires_at')::timestamptz;
 pass text := coalesce(payload->>'password','');
begin
 -- Match deletion's audit-first lock order; all mutation permissions rechecked here.
 select * into a from api.audits where id=aid for update;
 if not found or a.status='Deleting' or not private.audit_access(actor,aid) then
  raise exception 'Access denied.' using errcode='42501';
 end if;
 if action='share_list' then
  return jsonb_build_object('shares',coalesce((select jsonb_agg(jsonb_build_object(
   'id',x.id,'version',x.version,'created_at',x.created_at,'expires_at',x.expires_at,
   'revoked_at',x.revoked_at,'password_protected',x.password_hash is not null) order by x.created_at desc)
   from (select rs.*,v.version from private.report_shares rs join api.revisions v on v.id=rs.revision_id
    where v.audit_id=aid order by rs.created_at desc limit 100) x),'[]'::jsonb));
 elsif action='share_revoke' then
  update private.report_shares set revoked_at=coalesce(revoked_at,now())
   where id=(payload->>'share_id')::uuid and revision_id in (select id from api.revisions where audit_id=aid);
  if not found then raise exception 'Share unavailable.'; end if;
  return jsonb_build_object('revoked',true);
 elsif action<>'share_create' then
  raise exception 'Unknown action.';
 end if;
 select * into r from api.revisions where audit_id=aid and version=(payload->>'version')::integer;
 if not found or r.approved_at is null or not exists(select 1 from private.report_files where revision_id=r.id) then
  raise exception 'Only approved reports can be shared.';
 end if;
 if payload->>'token_hash' is null or payload->>'token_hash' !~ '^[a-f0-9]{64}$' or payload->>'request_key' is null then
  raise exception 'Invalid share request.';
 end if;
 if expiry is not null and expiry<=now() then raise exception 'Choose a future expiry.'; end if;
 if pass<>'' and (length(pass)<8 or octet_length(pass)>72) then raise exception 'Use a password of at least 8 characters and at most 72 bytes.'; end if;
 select * into s from private.report_shares where created_by=actor and request_key=(payload->>'request_key')::uuid;
 if found then
  if s.revision_id<>r.id or s.token_hash<>payload->>'token_hash' or s.expires_at is distinct from expiry
   or ((s.password_hash is null) <> (pass=''))
   or (s.password_hash is not null and extensions.crypt(pass,s.password_hash)<>s.password_hash) then
   raise exception 'Request already used. Create a new link.';
  end if;
  return jsonb_build_object('id',s.id,'revoked',s.revoked_at is not null);
 end if;
 if (select count(*) from private.report_shares x join api.revisions v on v.id=x.revision_id where v.audit_id=aid)>=100 then
  raise exception 'Report sharing limit reached.';
 end if;
 insert into private.report_shares(revision_id,created_by,request_key,token_hash,password_hash,expires_at)
 values(r.id,actor,(payload->>'request_key')::uuid,payload->>'token_hash',
  case when pass='' then null else extensions.crypt(pass,extensions.gen_salt('bf',12)) end,expiry)
 returning * into s;
 return jsonb_build_object('id',s.id,'revoked',false);
end $$;
revoke all on function api.share_command(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function api.share_command(uuid,text,jsonb) to service_role;

create function api.read_shared_report(candidate text, password text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 s private.report_shares; aid uuid; state text; markup text; count_now integer;
begin
 update private.report_read_limit set
  requests=case when window_at<=now()-interval '1 minute' then 1 else least(requests+1,601) end,
  window_at=case when window_at<=now()-interval '1 minute' then now() else window_at end
 where id=true returning requests into count_now;
 if count_now>600 then return jsonb_build_object('unavailable',true); end if;
 if candidate is null or candidate !~ '^[a-f0-9]{64}$' or octet_length(coalesce(password,''))>72 then
  return jsonb_build_object('unavailable',true);
 end if;
 -- Audit first, matching share_command/deletion, then the share lock serialises limits/revocation.
 select v.audit_id into aid from private.report_shares x join api.revisions v on v.id=x.revision_id where x.token_hash=candidate;
 if aid is null then return jsonb_build_object('unavailable',true); end if;
 select status into state from api.audits where id=aid for share;
 if not found or state='Deleting' then return jsonb_build_object('unavailable',true); end if;
 select * into s from private.report_shares where token_hash=candidate for update;
 if not found or s.revoked_at is not null or s.expires_at<=now() then return jsonb_build_object('unavailable',true); end if;
 if s.window_at<=now()-interval '1 minute' then s.reads:=0; s.window_at:=now(); end if;
 update private.report_shares set reads=least(s.reads+1,61),window_at=s.window_at where id=s.id;
 if s.reads>=60 then return jsonb_build_object('unavailable',true); end if;
 if s.password_hash is not null then
  if coalesce(password,'')='' then return jsonb_build_object('password_required',true); end if;
  if s.password_window_at<=now()-interval '15 minutes' then s.password_attempts:=0; s.password_window_at:=now(); end if;
  if s.password_attempts>=5 then return jsonb_build_object('unavailable',true); end if;
  update private.report_shares set password_attempts=s.password_attempts+1,password_window_at=s.password_window_at where id=s.id;
  if extensions.crypt(password,s.password_hash)<>s.password_hash then return jsonb_build_object('unavailable',true); end if;
  update private.report_shares set password_attempts=0 where id=s.id;
 end if;
 select f.html into markup from private.report_files f join api.revisions v on v.id=f.revision_id
  where f.revision_id=s.revision_id and v.approved_at is not null;
 if markup is null then return jsonb_build_object('unavailable',true); end if;
 return jsonb_build_object('html',markup);
end $$;
revoke all on function api.read_shared_report(text,text) from public,anon,authenticated;
grant execute on function api.read_shared_report(text,text) to service_role;
