-- Preserve historical request versions; record the actual version before each dispatch.
alter table private.jobs add column prompt_version text not null default 'oma-1.0.0';
alter table api.revisions alter column prompt_version set default 'oma-1.0.1';

create or replace function api.worker(action text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
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
   if cost<0 or a.spent_usd+a.reserved_usd+cost>least(a.budget_usd,coalesce((payload->>'budget_cap')::numeric,a.budget_usd)) then
     update private.jobs set status='Paused',error='Budget reached.',lease_until=null where id=j.id;
     update api.audits set status='Paused' where id=a.id; return jsonb_build_object('allowed',false);
   end if;
   update api.audits set reserved_usd=reserved_usd+cost where id=a.id;
   update private.jobs set prompt_version=coalesce(payload->>'prompt_version',prompt_version),reservation=cost,status='Submitting',attempts=attempts+1,lease_until=now()+interval '90 seconds' where id=j.id;
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
     if not exists(select 1 from private.jobs where audit_id=a.id and revision=j.revision and stage='extraction' and status<>'Complete') then update api.audits set status='Evidence review' where id=a.id; end if;
   elsif j.stage='calibration' then
     update api.revisions set prompt_version=j.prompt_version,calibration=payload->'output' where audit_id=a.id and version=j.revision and approved_at is null;
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

