create schema if not exists api;
create schema if not exists private;
create extension if not exists pgmq;
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
select pgmq.create('oma_jobs');
revoke all on schema private from public, anon, authenticated;
grant usage on schema api to authenticated, service_role;
alter default privileges in schema api revoke execute on functions from public;
alter default privileges in schema private revoke execute on functions from public;

create table api.members (
  id uuid primary key references auth.users(id), name text not null check(length(name) between 1 and 120),
  email text not null, role text not null default 'member' check(role in ('member','admin')), active boolean not null default true
);
create table api.clients (
  id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 120),
  context text not null default '', created_at timestamptz not null default now()
);
create table api.assignments (
  client_id uuid not null references api.clients on delete cascade, user_id uuid not null references api.members,
  primary key(client_id,user_id)
);
create index assignments_user_idx on api.assignments(user_id,client_id);
create table api.audits (
  id uuid primary key default gen_random_uuid(), client_id uuid not null references api.clients,
  title text not null, status text not null default 'Draft' check(status in ('Draft','Processing','Evidence review','Assessing','Review','Approved','Paused','Failed','Cancelled','Deleting')),
  setup jsonb not null, revision integer not null default 1, evidence_version integer not null default 1,
  pov_locked_at timestamptz, budget_usd numeric(12,6) not null default 25 check(budget_usd>=0),
  spent_usd numeric(12,6) not null default 0 check(spent_usd>=0), reserved_usd numeric(12,6) not null default 0 check(reserved_usd>=0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index audits_client_idx on api.audits(client_id,updated_at desc);
create table api.evidence (
  id uuid primary key default gen_random_uuid(), audit_id uuid not null references api.audits on delete cascade,
  channel text not null, name text not null, mime text not null, bytes bigint not null check(bytes>=0), path text not null unique,
  captured_at date not null, source text not null default '', status text not null default 'Pending' check(status in ('Pending','Ready','Extracted','Verified','Excluded')),
  observations jsonb not null default '[]', limitations jsonb not null default '[]', exclusion_reason text
);
create index evidence_audit_idx on api.evidence(audit_id);
create table api.revisions (
  id uuid primary key default gen_random_uuid(), audit_id uuid not null references api.audits on delete cascade,
  version integer not null, calibration jsonb, assessment jsonb, original_assessment jsonb, report jsonb,
  changes jsonb not null default '[]', resolved_flags jsonb not null default '{}',
  approved_at timestamptz, approved_by uuid references api.members, model text not null default 'gpt-5.4-2026-03-05',
  rubric_version text not null default 'oma-1.0.0', prompt_version text not null default 'oma-1.0.0',
  created_at timestamptz not null default now(), unique(audit_id,version)
);
create index revisions_approver_idx on api.revisions(approved_by);
create table api.feedback (
  id uuid primary key default gen_random_uuid(), audit_id uuid not null references api.audits on delete cascade,
  note text not null check(length(note) between 1 and 4000), author_id uuid not null references api.members,
  created_at timestamptz not null default now()
);
create index feedback_audit_idx on api.feedback(audit_id);
create index feedback_author_idx on api.feedback(author_id);
create table api.ledger (
  id uuid primary key default gen_random_uuid(), audit_id uuid not null references api.audits on delete cascade,
  revision integer not null, pov numeric not null, result numeric not null, gap numeric not null, verdict text not null,
  created_at timestamptz not null default now(), unique(audit_id,revision)
);
create table private.jobs (
  id uuid primary key default gen_random_uuid(), audit_id uuid not null references api.audits on delete cascade,
  asset_id uuid references api.evidence on delete cascade, revision integer not null, stage text not null,
  status text not null default 'Queued', attempts integer not null default 0, response_id text,
  reservation numeric not null default 0, error text, request_key text not null unique,
  lease_until timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index jobs_audit_idx on private.jobs(audit_id,status);
create index jobs_asset_idx on private.jobs(asset_id);
create table private.usage (
 id uuid primary key default gen_random_uuid(),job_id uuid not null references private.jobs on delete cascade,
 reserved_usd numeric not null,charged_usd numeric,model text not null default 'gpt-5.4-2026-03-05',
 input_rate numeric not null default 2.5,output_rate numeric not null default 15,
 created_at timestamptz not null default now(),closed_at timestamptz
);
create index usage_job_idx on private.usage(job_id);
create unique index usage_open_idx on private.usage(job_id) where closed_at is null;
create table private.provider_files (
  file_id text primary key, audit_id uuid not null references api.audits on delete cascade
);
create index provider_files_audit_idx on private.provider_files(audit_id);
create table private.provider_responses(response_id text primary key,audit_id uuid not null references api.audits on delete cascade);
create index provider_responses_audit_idx on private.provider_responses(audit_id);
create table private.upload_tickets(asset_id uuid primary key references api.evidence on delete cascade,audit_id uuid not null references api.audits on delete cascade,expires_at timestamptz not null);
create index upload_tickets_audit_idx on private.upload_tickets(audit_id);
create table private.report_files (
  revision_id uuid primary key references api.revisions on delete cascade, html text not null
);
create table private.events (
  id bigint generated always as identity primary key, actor uuid, action text not null, resource uuid,
  created_at timestamptz not null default now()
);

create function private.active_member(uid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from api.members where id=uid and active);
$$;
create function private.is_admin(uid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from api.members where id=uid and active and role='admin');
$$;
create function private.client_access(uid uuid,cid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.active_member(uid) and (private.is_admin(uid) or exists(select 1 from api.assignments where user_id=uid and client_id=cid));
$$;
create function private.audit_access(uid uuid,aid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from api.audits a where a.id=aid and (a.status<>'Deleting' or private.is_admin(uid)) and private.client_access(uid,a.client_id));
$$;
-- Policies can invoke these private helpers, but PostgREST does not expose their schema.
grant usage on schema private to authenticated;
grant execute on function private.active_member(uuid),private.is_admin(uuid),private.client_access(uuid,uuid),private.audit_access(uuid,uuid) to authenticated;

alter table api.members enable row level security;
create policy members_read on api.members for select to authenticated using(private.active_member((select auth.uid())) and (id=(select auth.uid()) or private.is_admin((select auth.uid())) or exists(select 1 from api.assignments x where x.user_id=members.id and private.client_access((select auth.uid()),x.client_id))));
alter table api.clients enable row level security;
create policy clients_read on api.clients for select to authenticated using(private.client_access((select auth.uid()),id));
alter table api.assignments enable row level security;
create policy assignments_read on api.assignments for select to authenticated using(private.client_access((select auth.uid()),client_id));
alter table api.audits enable row level security;
create policy audits_read on api.audits for select to authenticated using((status<>'Deleting' or private.is_admin((select auth.uid()))) and private.client_access((select auth.uid()),client_id));
alter table api.evidence enable row level security;
create policy evidence_read on api.evidence for select to authenticated using(private.audit_access((select auth.uid()),audit_id));
alter table api.revisions enable row level security;
create policy revisions_read on api.revisions for select to authenticated using(private.audit_access((select auth.uid()),audit_id));
alter table api.feedback enable row level security;
create policy feedback_read on api.feedback for select to authenticated using(private.audit_access((select auth.uid()),audit_id));
alter table api.ledger enable row level security;
create policy ledger_read on api.ledger for select to authenticated using(private.audit_access((select auth.uid()),audit_id));
revoke all on all tables in schema api from anon,authenticated;
grant select on all tables in schema api to authenticated;
grant all on all tables in schema api to service_role;
grant all on all tables in schema private to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('evidence','evidence',false,20971520,array['application/pdf','image/png','image/jpeg','text/csv','text/html','text/plain']);
create policy evidence_download on storage.objects for select to authenticated using(bucket_id='evidence' and exists(select 1 from api.evidence e where e.path=name and private.audit_access((select auth.uid()),e.audit_id)));
-- Uploads are signed for a single reserved path by the API. No browser insert/update/delete grants.

create function api.snapshot() returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 if not private.active_member(auth.uid()) then raise exception 'Access denied.' using errcode='42501'; end if;
 return jsonb_build_object(
 'me',(select to_jsonb(m) from api.members m where id=auth.uid()),
 'members',coalesce((select jsonb_agg(m) from api.members m),'[]'),
 'clients',coalesce((select jsonb_agg(c order by name) from api.clients c),'[]'),
 'assignments',coalesce((select jsonb_agg(x) from api.assignments x),'[]'),
 'audits',coalesce((select jsonb_agg(a order by updated_at desc) from api.audits a),'[]'),
 'evidence',coalesce((select jsonb_agg(e) from api.evidence e),'[]'),
 'revisions',coalesce((select jsonb_agg(r order by version) from api.revisions r),'[]'),
 'feedback',coalesce((select jsonb_agg(f order by created_at desc) from api.feedback f),'[]'),
 'ledger',coalesce((select jsonb_agg(l order by created_at desc) from api.ledger l),'[]'),
 'jobs',api.job_list(),'usage',api.usage_list());
end;$$;
create function api.job_list() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(x order by created_at desc),'[]') from
 (select id,audit_id,stage,status,attempts,error,created_at from private.jobs where private.audit_access(auth.uid(),audit_id)) x;
$$;
grant execute on function api.snapshot(),api.job_list() to authenticated;
create function api.usage_list() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(x order by created_at desc),'[]') from
 (select u.*,j.audit_id,j.stage from private.usage u join private.jobs j on j.id=u.job_id where private.is_admin(auth.uid())) x;
$$;
grant execute on function api.usage_list() to authenticated;

create function private.enqueue(aid uuid,ver integer,step text,asset uuid default null) returns uuid language plpgsql set search_path='' as $$
declare jid uuid;
begin
 insert into private.jobs(audit_id,revision,stage,asset_id,request_key)
 values(aid,ver,step,asset,aid::text||':'||ver::text||':'||step||':'||coalesce(asset::text,''))
 on conflict(request_key) do nothing returning id into jid;
 if jid is not null then perform pgmq.send('oma_jobs',jsonb_build_object('job_id',jid)); end if;
 return jid;
end;$$;

create function api.command(actor uuid,action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare a api.audits; r api.revisions; e api.evidence; cid uuid; aid uuid; eid uuid; uid uuid; n integer; amount numeric;
begin
 if not private.active_member(actor) then raise exception 'Access denied.' using errcode='42501'; end if;
 if action='create_client' then
   if not private.is_admin(actor) then raise exception 'Admin required.'; end if;
   insert into api.clients(name,context) values(payload->>'name',coalesce(payload->>'context','')) returning id into cid;
   insert into api.assignments values(cid,actor);
   return jsonb_build_object('id',cid);
 elsif action in ('member','assign') then
   if not private.is_admin(actor) then raise exception 'Admin required.'; end if;
   uid:=(payload->>'user_id')::uuid;
   if action='member' then
     if uid=actor and ((payload->>'active')::boolean=false or payload->>'role'<>'admin') then raise exception 'Keep your admin access.'; end if;
     insert into api.members(id,name,email,role,active) values(uid,payload->>'name',payload->>'email',payload->>'role',(payload->>'active')::boolean)
     on conflict(id) do update set name=excluded.name,email=excluded.email,role=excluded.role,active=excluded.active;
   else
     cid:=(payload->>'client_id')::uuid;
     if (payload->>'assigned')::boolean then insert into api.assignments values(cid,uid) on conflict do nothing;
     else delete from api.assignments where client_id=cid and user_id=uid; end if;
   end if;
   insert into private.events(actor,action,resource) values(actor,action,uid);
   return '{}';
 elsif action='create_audit' then
   cid:=(payload->>'client_id')::uuid;
   if not private.client_access(actor,cid) or not private.client_access((payload->'setup'->>'strategist_id')::uuid,cid) then raise exception 'Client access required.'; end if;
   insert into api.audits(client_id,title,setup) values(cid,payload->'setup'->>'title',payload->'setup') returning id into aid;
   insert into api.revisions(audit_id,version) values(aid,1);
   return jsonb_build_object('id',aid);
 end if;
 aid:=(payload->>'audit_id')::uuid;
 select * into a from api.audits where id=aid for update;
 if not found or not private.audit_access(actor,aid) then raise exception 'Access denied.' using errcode='42501'; end if;
 if action not in ('feedback','budget','delete','cancel','retry','recover') and (payload->>'revision')::integer is distinct from a.revision then raise exception 'Audit changed. Refresh.'; end if;
 select * into r from api.revisions where audit_id=aid and version=a.revision;
 if action='setup' then
   if a.pov_locked_at is not null or a.status not in ('Draft','Evidence review') then raise exception 'Setup is locked.'; end if;
   if not private.client_access((payload->'setup'->>'strategist_id')::uuid,a.client_id) then raise exception 'Strategist needs client access.'; end if;
   if exists(select 1 from api.evidence where audit_id=aid and not (payload->'setup'->'channels' ? channel)) then raise exception 'Keep channels with evidence.'; end if;
   update api.audits set setup=payload->'setup',title=payload->'setup'->>'title' where id=aid;
 elsif action='reserve_upload' then
   if a.status not in ('Draft','Evidence review') then raise exception 'Evidence is locked.'; end if;
   if not(a.setup->'channels' ? (payload->>'channel')) then raise exception 'Channel not in scope.'; end if;
   select count(*),coalesce(sum(bytes),0) into n,amount from api.evidence where audit_id=aid;
   if n>=50 or amount+(payload->>'bytes')::bigint>104857600 then raise exception 'Audit limit: 50 files, 100 MB.'; end if;
   eid:=gen_random_uuid();
   insert into api.evidence(id,audit_id,channel,name,mime,bytes,path,captured_at,source)
   values(eid,aid,payload->>'channel',payload->>'name',payload->>'mime',(payload->>'bytes')::bigint,a.client_id||'/'||aid||'/'||eid,(payload->>'captured_at')::date,coalesce(payload->>'source','')) returning * into e;
   return to_jsonb(e);
 elsif action='begin_upload' then
   if a.status not in ('Draft','Evidence review') or not exists(select 1 from api.evidence where id=(payload->>'asset_id')::uuid and audit_id=aid and status='Pending') then raise exception 'Evidence is locked.'; end if;
   insert into private.upload_tickets values((payload->>'asset_id')::uuid,aid,now()+interval '3 minutes') on conflict(asset_id) do update set expires_at=excluded.expires_at;
 elsif action='finish_upload' then
   if a.status not in ('Draft','Evidence review') then raise exception 'Evidence is locked.'; end if;
   update api.evidence set status='Ready' where id=(payload->>'asset_id')::uuid and audit_id=aid and status='Pending';
   delete from private.upload_tickets where asset_id=(payload->>'asset_id')::uuid;
 elsif action='verify_evidence' then
   if a.status not in ('Evidence review','Draft') then raise exception 'Evidence is locked.'; end if;
   update api.evidence set observations=payload->'observations',limitations=payload->'limitations',status='Verified'
   where id=(payload->>'asset_id')::uuid and audit_id=aid and status in ('Extracted','Verified');
   if not found then raise exception 'Extract the file first.'; end if;
 elsif action='exclude' then
   if a.status not in ('Draft','Evidence review') or length(trim(payload->>'reason'))<3 then raise exception 'Give an exclusion reason.'; end if;
   if payload ? 'asset_id' then
     update api.evidence set status='Excluded',exclusion_reason=payload->>'reason' where id=(payload->>'asset_id')::uuid and audit_id=aid;
   else
     eid:=gen_random_uuid();
     insert into api.evidence(id,audit_id,channel,name,mime,bytes,path,captured_at,status,exclusion_reason)
     values(eid,aid,payload->>'channel','Not supplied','text/plain',0,a.client_id||'/'||aid||'/'||eid,current_date,'Excluded',payload->>'reason');
   end if;
 elsif action='extract' then
   if a.status not in ('Draft','Evidence review') then raise exception 'Audit is busy.'; end if;
   if not exists(select 1 from api.evidence where audit_id=aid and status='Ready') then raise exception 'Upload evidence first.'; end if;
   for e in select * from api.evidence where audit_id=aid and status='Ready' loop perform private.enqueue(aid,a.revision,'extraction',e.id); end loop;
   update api.audits set status='Processing' where id=aid;
 elsif action='assess' then
   if a.status<>'Evidence review' or exists(select 1 from api.evidence where audit_id=aid and status not in ('Verified','Excluded')) then raise exception 'Verify or exclude each file.'; end if;
   if not exists(select 1 from api.evidence where audit_id=aid and status='Verified') then raise exception 'No verified evidence.'; end if;
   if exists(select 1 from jsonb_array_elements_text(a.setup->'channels') c where not exists(select 1 from api.evidence where audit_id=aid and channel=c.value and status in ('Verified','Excluded'))) then raise exception 'Supply or exclude each channel.'; end if;
   update api.audits set status='Assessing',pov_locked_at=coalesce(pov_locked_at,now()) where id=aid;
   perform private.enqueue(aid,a.revision,'calibration');
 elsif action='save_review' then
   if a.status not in ('Review','Approved') then raise exception 'Wait for the assessment.'; end if;
   if r.assessment is distinct from payload->'assessment' and (length(trim(payload->>'reason'))<3 or jsonb_array_length(payload->'evidence_ids')<1) then raise exception 'Score changes need a reason and evidence.'; end if;
   insert into api.revisions(audit_id,version,calibration,assessment,original_assessment,report,changes,resolved_flags)
   values(aid,a.revision+1,r.calibration,payload->'assessment',r.original_assessment,payload->'report',
   r.changes||jsonb_build_array(jsonb_build_object('at',now(),'actor',actor,'reason',payload->>'reason','evidence_ids',payload->'evidence_ids')),payload->'resolved_flags');
   update api.audits set revision=revision+1,status='Review' where id=aid;
 elsif action='approve' then
   if a.status<>'Review' or (a.setup->>'strategist_id')::uuid<>actor or r.approved_at is not null or r.report is null or r.assessment is null then raise exception 'Only the strategist can approve the current review.'; end if;
   -- API validates schema, citations, flags and POV reconciliation before this transaction.
   update api.revisions set approved_at=now(),approved_by=actor where id=r.id;
   insert into private.report_files(revision_id,html) values(r.id,payload->>'html');
   insert into api.ledger(audit_id,revision,pov,result,gap,verdict) values(aid,a.revision,(a.setup->>'pov_score')::numeric,(payload->'reconciliation'->>'result')::numeric,(payload->'reconciliation'->>'gap')::numeric,payload->'reconciliation'->>'verdict');
   update api.audits set status='Approved' where id=aid;
 elsif action='export' then
   return jsonb_build_object('html',(select f.html from private.report_files f join api.revisions v on v.id=f.revision_id where v.audit_id=aid and v.version=(payload->>'version')::integer and v.approved_at is not null));
 elsif action='feedback' then
   insert into api.feedback(audit_id,note,author_id) values(aid,payload->>'note',actor);
 elsif action='budget' then
   if not private.is_admin(actor) or (payload->>'budget')::numeric<a.spent_usd+a.reserved_usd or (payload->>'budget')::numeric>25 then raise exception 'Invalid budget.'; end if;
   update api.audits set budget_usd=(payload->>'budget')::numeric where id=aid;
 elsif action='cancel' then
   if a.status not in ('Processing','Assessing','Paused','Failed') then raise exception 'No active run.'; end if;
   update private.jobs set status=case when status in ('Submitting','Uncertain') then status when response_id is null then 'Cancelled' else 'Cancel pending' end where audit_id=aid and status not in ('Complete','Cancelled');
   update api.audits set status='Cancelled' where id=aid;
 elsif action='retry' then
   if a.status not in ('Paused','Failed') then raise exception 'Nothing to retry.'; end if;
   if exists(select 1 from private.jobs where audit_id=aid and status='Uncertain') then raise exception 'Resolve uncertain requests in Admin first.'; end if;
   update private.jobs set status='Queued',attempts=0,error=null,lease_until=null where audit_id=aid and status in ('Paused','Failed');
   perform pgmq.send('oma_jobs',jsonb_build_object('job_id',j.id)) from private.jobs j where j.audit_id=aid and j.status='Queued';
   update api.audits set status=case when pov_locked_at is null then 'Processing' else 'Assessing' end where id=aid;
 elsif action='delete' then
   if not private.is_admin(actor) or payload->>'confirm' is distinct from a.title then raise exception 'Confirm the audit title.'; end if;
   update api.audits set status='Deleting' where id=aid;
   update private.jobs set status=case when status in ('Submitting','Uncertain') then status else 'Cancelled' end where audit_id=aid and status<>'Complete';
   perform private.enqueue(aid,a.revision,'deletion');
 elsif action='recover' then
   if not private.is_admin(actor) then raise exception 'Admin required.'; end if;
   update private.jobs set response_id=payload->>'response_id',status=case when a.status in ('Cancelled','Deleting') then 'Cancel pending' else 'Waiting' end,lease_until=null,error=null
   where id=(payload->>'job_id')::uuid and audit_id=aid and status='Uncertain';
   if not found then raise exception 'No uncertain request.'; end if;
   insert into private.provider_responses values(payload->>'response_id',aid) on conflict do nothing;
   if a.status not in ('Cancelled','Deleting') then update api.audits set status=case when pov_locked_at is null then 'Processing' else 'Assessing' end where id=aid; end if;
 else raise exception 'Unknown action.';
 end if;
 update api.audits set updated_at=now() where id=aid;
 insert into private.events(actor,action,resource) values(actor,action,aid);
 return jsonb_build_object('id',aid);
end;$$;
revoke all on function api.command(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function api.command(uuid,text,jsonb) to service_role;

create function api.worker(action text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare j private.jobs; a api.audits; r api.revisions; msg record; jobs jsonb:='[]'; cost numeric; used numeric; next_stage text;
begin
 if action='claim' then
   perform pg_advisory_xact_lock(846203);
   -- Recover polling work after a process exit. Ambiguous submissions are never retried automatically.
   update private.jobs set status='Uncertain',error='Submission uncertain. Check the provider request.',lease_until=null where status='Submitting' and lease_until<now();
   update api.audits set status='Paused' where id in(select audit_id from private.jobs where status='Uncertain') and status not in ('Deleting','Cancelled');
   for j in select * from private.jobs where status in ('Waiting','Cancel pending') and (lease_until is null or lease_until<now()) order by updated_at limit 3 loop
     update private.jobs set lease_until=now()+interval '90 seconds' where id=j.id;
     jobs:=jobs||jsonb_build_array(to_jsonb(j));
   end loop;
   for msg in select * from pgmq.read('oma_jobs',90,6) loop
     select * into j from private.jobs where id=(msg.message->>'job_id')::uuid for update;
     if j.id is null or j.status<>'Queued' then perform pgmq.delete('oma_jobs',msg.msg_id); continue; end if;
     if jsonb_array_length(jobs)>=3 or (j.stage<>'deletion' and (select count(distinct audit_id) from private.jobs where status in ('Submitting','Waiting','Running'))>=3 and not exists(select 1 from private.jobs where audit_id=j.audit_id and status in ('Submitting','Waiting','Running'))) then continue; end if;
     update private.jobs set status='Running',lease_until=now()+interval '90 seconds',updated_at=now() where id=j.id returning * into j;
     jobs:=jobs||jsonb_build_array(to_jsonb(j));
     perform pgmq.delete('oma_jobs',msg.msg_id);
   end loop;
   -- Running jobs with no provider call are safe to reclaim.
   for j in select * from private.jobs where status='Running' and lease_until<now() loop
     update private.jobs set status='Queued',lease_until=null where id=j.id;
     perform pgmq.send('oma_jobs',jsonb_build_object('job_id',j.id));
   end loop;
   return jobs;
 end if;
 select * into j from private.jobs where id=(payload->>'job_id')::uuid for update;
 if not found then return null; end if;
 select * into a from api.audits where id=j.audit_id for update;
 if not found then return null; end if;
 if action='context' then
   select * into r from api.revisions where audit_id=a.id and version=j.revision;
   return jsonb_build_object('job',to_jsonb(j),'audit',to_jsonb(a),'revision',to_jsonb(r),
     'evidence',coalesce((select jsonb_agg(e) from api.evidence e where audit_id=a.id),'[]'),
     'provider_files',coalesce((select jsonb_agg(file_id) from private.provider_files where audit_id=a.id),'[]'),
     'responses',coalesce((select jsonb_agg(response_id) from private.provider_responses where audit_id=a.id),'[]'),
     'unresolved',exists(select 1 from private.jobs where audit_id=a.id and status in ('Submitting','Uncertain')),
     'upload_deadline',(select max(expires_at) from private.upload_tickets where audit_id=a.id));
 elsif action='submitted' then
   insert into private.provider_responses values(payload->>'response_id',a.id) on conflict do nothing;
   update private.jobs set response_id=payload->>'response_id',status=case when a.status in ('Cancelled','Deleting') then 'Cancel pending' else 'Waiting' end,lease_until=null,updated_at=now() where id=j.id and status in ('Submitting','Uncertain','Cancelled');
   return '{}';
 elsif action='defer' and j.stage='deletion' then
   update private.jobs set status='Queued',lease_until=null,error=payload->>'error' where id=j.id;
   perform pgmq.send('oma_jobs',jsonb_build_object('job_id',j.id),60); return '{}';
 elsif action='file' then
   insert into private.provider_files(file_id,audit_id) values(payload->>'file_id',a.id) on conflict do nothing; return '{}';
 elsif action='purged' and a.status='Deleting' and j.stage='deletion' then
   delete from api.audits where id=a.id; return '{}';
 elsif action='cancelled' then
   if j.status='Cancelled' then return null; end if;
   update private.usage set charged_usd=coalesce((payload->>'cost')::numeric,j.reservation),closed_at=now() where job_id=j.id and closed_at is null;
   update api.audits set reserved_usd=greatest(0,reserved_usd-j.reservation),spent_usd=spent_usd+coalesce((payload->>'cost')::numeric,j.reservation) where id=a.id;
   update private.jobs set status='Cancelled',reservation=0,lease_until=null where id=j.id; return '{}';
 end if;
 if a.status in ('Deleting','Cancelled') or j.revision<>a.revision or j.status in ('Complete','Cancelled') then return null; end if;
 if action='reserve' then
   if j.status<>'Running' then return null; end if;
   cost:=(payload->>'cost')::numeric;
   if cost<0 or a.spent_usd+a.reserved_usd+cost>a.budget_usd then
     update private.jobs set status='Paused',error='Budget reached.',lease_until=null where id=j.id;
     update api.audits set status='Paused' where id=a.id; return jsonb_build_object('allowed',false);
   end if;
   update api.audits set reserved_usd=reserved_usd+cost where id=a.id;
   update private.jobs set reservation=cost,status='Submitting',attempts=attempts+1,lease_until=now()+interval '90 seconds' where id=j.id;
   insert into private.usage(job_id,reserved_usd) values(j.id,cost);
   return jsonb_build_object('allowed',true);
 elsif action='insufficient' then
   used:=(payload->>'cost')::numeric;
   update private.usage set charged_usd=used,closed_at=now() where job_id=j.id and closed_at is null;
   update private.jobs set status='Failed',reservation=0,error=payload->>'error',lease_until=null where id=j.id;
   update api.audits set reserved_usd=greatest(0,reserved_usd-j.reservation),spent_usd=spent_usd+used,status='Evidence review',revision=revision+1 where id=a.id;
   insert into api.revisions(audit_id,version) values(a.id,a.revision+1);
 elsif action='waiting' then
   update private.jobs set lease_until=null,updated_at=now() where id=j.id;
 elsif action='error' then
   if (payload->>'uncertain')::boolean then
     update private.jobs set status='Uncertain',error=payload->>'error',lease_until=null where id=j.id;
     update api.audits set status='Paused' where id=a.id;
   else
     used:=coalesce((payload->>'cost')::numeric,0);
     update private.usage set charged_usd=used,closed_at=now() where job_id=j.id and closed_at is null;
     update api.audits set reserved_usd=greatest(0,reserved_usd-j.reservation),spent_usd=spent_usd+used where id=a.id;
     update private.jobs set reservation=0,status=case when (payload->>'retryable')::boolean and attempts<3 then 'Queued' else 'Failed' end,error=payload->>'error',response_id=null,lease_until=null where id=j.id returning * into j;
     if j.status='Queued' then perform pgmq.send('oma_jobs',jsonb_build_object('job_id',j.id),least(60,10*j.attempts));
     else update api.audits set status='Failed' where id=a.id; end if;
   end if;
 elsif action='complete' then
   used:=(payload->>'cost')::numeric;
   update private.usage set charged_usd=used,closed_at=now() where job_id=j.id and closed_at is null;
   update api.audits set reserved_usd=greatest(0,reserved_usd-j.reservation),spent_usd=spent_usd+used where id=a.id;
   update private.jobs set status='Complete',reservation=0,lease_until=null,updated_at=now() where id=j.id;
   if j.stage='extraction' then
     update api.evidence set observations=payload->'output'->'observations',limitations=payload->'output'->'limitations',status='Extracted' where id=j.asset_id and audit_id=a.id;
     if not exists(select 1 from private.jobs where audit_id=a.id and stage='extraction' and status<>'Complete') then update api.audits set status='Evidence review' where id=a.id; end if;
   elsif j.stage='calibration' then
     update api.revisions set calibration=payload->'output' where audit_id=a.id and version=j.revision and approved_at is null;
     perform private.enqueue(a.id,j.revision,'assessment');
   elsif j.stage='assessment' then
     update api.revisions set assessment=payload->'output',original_assessment=payload->'output' where audit_id=a.id and version=j.revision and approved_at is null;
     perform private.enqueue(a.id,j.revision,'drafting');
   elsif j.stage='drafting' then
     update api.revisions set report=payload->'output' where audit_id=a.id and version=j.revision and approved_at is null;
     update api.audits set status='Review' where id=a.id;
   end if;
 else raise exception 'Unknown worker action.';
 end if;
 update api.audits set updated_at=now() where id=a.id;
 return '{}';
end;$$;
revoke all on function api.worker(text,jsonb) from public,anon,authenticated;
grant execute on function api.worker(text,jsonb) to service_role;

-- Explicitly enabled only after secrets and a non-production target are verified.
create function private.dispatch() returns void language plpgsql security definer set search_path='' as $$
declare endpoint text; token text;
begin
 select decrypted_secret into endpoint from vault.decrypted_secrets where name='oma_worker_url';
 select decrypted_secret into token from vault.decrypted_secrets where name='oma_worker_token';
 if endpoint is null or token is null then return; end if;
 perform net.http_post(url:=endpoint,headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||token),body:='{}'::jsonb,timeout_milliseconds:=5000);
end;$$;
revoke all on all functions in schema private from public,anon;
-- Activate separately: select cron.schedule('oma-dispatch','30 seconds','select private.dispatch()');
