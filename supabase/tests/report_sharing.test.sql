begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();
insert into auth.users(id,email) values
 ('11000000-0000-4000-8000-000000000001','sharing-test@example.test'),
 ('11000000-0000-4000-8000-000000000002','other-sharing-test@example.test');
insert into api.members(id,name,email,role) values
 ('11000000-0000-4000-8000-000000000001','Sharing test','sharing-test@example.test','member'),
 ('11000000-0000-4000-8000-000000000002','Other test','other-sharing-test@example.test','member');
insert into api.clients(id,name) values('22000000-0000-4000-8000-000000000001','Synthetic report sharing');
insert into api.assignments values('22000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001');
insert into api.audits(id,client_id,title,setup,status) values('33000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000001','Synthetic report','{}','Approved');
insert into api.revisions(id,audit_id,version,approved_at) values
 ('44000000-0000-4000-8000-000000000001','33000000-0000-4000-8000-000000000001',1,now()),
 ('44000000-0000-4000-8000-000000000002','33000000-0000-4000-8000-000000000001',2,null);
insert into private.report_files(revision_id,html) values('44000000-0000-4000-8000-000000000001','<h1>Approved synthetic version 1</h1>');
create function pg_temp.share_args() returns jsonb language sql as $$select jsonb_build_object('audit_id','33000000-0000-4000-8000-000000000001','version',1,'request_key','55000000-0000-4000-8000-000000000001','token_hash',repeat('a',64),'password','','expires_at',null)$$;
select ok(not has_function_privilege('anon','api.read_shared_report(text,text)','EXECUTE'),'Anonymous direct reader RPC denied');
select ok(not has_function_privilege('authenticated','api.read_shared_report(text,text)','EXECUTE'),'Authenticated direct reader RPC denied');
select ok(not has_function_privilege('authenticated','api.share_command(uuid,text,jsonb)','EXECUTE'),'Actor-spoofing RPC denied');
select ok(has_function_privilege('service_role','api.share_command(uuid,text,jsonb)','EXECUTE'),'Service API can manage shares');
select ok(not has_table_privilege('anon','private.report_shares','SELECT'),'Anonymous table read denied');
select ok(not has_table_privilege('authenticated','private.report_shares','SELECT'),'Member direct table read denied');
select throws_ok($$select api.share_command('11000000-0000-4000-8000-000000000002','share_create',pg_temp.share_args())$$,'42501','Access denied.','Wrong client denied');
select throws_ok($$select api.share_command('11000000-0000-4000-8000-000000000001','share_create',pg_temp.share_args()||'{"version":2}')$$,'P0001','Only approved reports can be shared.','Draft cannot be shared');
select lives_ok($$select api.share_command('11000000-0000-4000-8000-000000000001','share_create',pg_temp.share_args())$$,'Assigned member creates share');
select lives_ok($$select api.share_command('11000000-0000-4000-8000-000000000001','share_create',pg_temp.share_args())$$,'Idempotent create retry');
select is((select count(*) from private.report_shares),1::bigint,'Retry creates no duplicate');
select is(api.read_shared_report(repeat('a',64))->>'html','<h1>Approved synthetic version 1</h1>','Reader returns approved snapshot');
select is(api.read_shared_report(repeat('b',64))->>'unavailable','true','Unknown link denied');
select ok(not (api.share_command('11000000-0000-4000-8000-000000000001','share_list',pg_temp.share_args())::text ~ 'token_hash|password_hash|aaaaa'),'Share list contains no credentials');
update api.members set active=false where id='11000000-0000-4000-8000-000000000001';
select throws_ok($$select api.share_command('11000000-0000-4000-8000-000000000001','share_list',pg_temp.share_args())$$,'42501','Access denied.','Removed member denied');
update api.members set active=true where id='11000000-0000-4000-8000-000000000001';
update api.audits set revision=2,status='Review' where id='33000000-0000-4000-8000-000000000001';
select is(api.read_shared_report(repeat('a',64))->>'html','<h1>Approved synthetic version 1</h1>','Later revision leaves share unchanged');
update private.report_shares set expires_at=now()-interval '1 second';
select is(api.read_shared_report(repeat('a',64))->>'unavailable','true','Expired link denied');
update private.report_shares set expires_at=null;
select api.share_command('11000000-0000-4000-8000-000000000001','share_revoke',pg_temp.share_args()||jsonb_build_object('share_id',(select id from private.report_shares)));
select is(api.read_shared_report(repeat('a',64))->>'unavailable','true','Revoked link denied');
select is(api.share_command('11000000-0000-4000-8000-000000000001','share_create',pg_temp.share_args())->>'revoked','true','Replay cannot revive revoked link');
select lives_ok($$select api.share_command('11000000-0000-4000-8000-000000000001','share_create',pg_temp.share_args()||jsonb_build_object('request_key','55000000-0000-4000-8000-000000000002','token_hash',repeat('c',64),'password','synthetic-password'))$$,'Password-protected share created');
select ok((select password_hash<>'synthetic-password' and password_hash like '$2%' from private.report_shares where token_hash=repeat('c',64)),'Only salted password hash stored');
select is(api.read_shared_report(repeat('c',64))->>'password_required','true','Valid token prompts for password');
select is(api.read_shared_report(repeat('c',64),'incorrect')->>'unavailable','true','Wrong password denied');
select is(api.read_shared_report(repeat('c',64),'synthetic-password')->>'html','<h1>Approved synthetic version 1</h1>','Correct password returns snapshot');
update private.report_shares set password_attempts=5 where token_hash=repeat('c',64);
select is(api.read_shared_report(repeat('c',64),'synthetic-password')->>'unavailable','true','Password attempts are limited');
update private.report_shares set password_window_at=now()-interval '16 minutes' where token_hash=repeat('c',64);
select is(api.read_shared_report(repeat('c',64),'synthetic-password')->>'html','<h1>Approved synthetic version 1</h1>','Password limit expires');
update private.report_shares set reads=60 where token_hash=repeat('c',64);
select is(api.read_shared_report(repeat('c',64),'synthetic-password')->>'unavailable','true','Per-link read rate limited');
update private.report_shares set window_at=now()-interval '2 minutes' where token_hash=repeat('c',64);
select is(api.read_shared_report(repeat('c',64),'synthetic-password')->>'html','<h1>Approved synthetic version 1</h1>','Read limit expires');
update private.report_read_limit set requests=600;
select is(api.read_shared_report(repeat('c',64),'synthetic-password')->>'unavailable','true','Global limit enforced');
update private.report_read_limit set window_at=now()-interval '2 minutes';
update api.audits set status='Deleting' where id='33000000-0000-4000-8000-000000000001';
select is(api.read_shared_report(repeat('c',64),'synthetic-password')->>'unavailable','true','Deletion immediately denies reading');
delete from api.audits where id='33000000-0000-4000-8000-000000000001';
select is((select count(*) from private.report_shares),0::bigint,'Deletion cascades shares');
select * from finish();
rollback;
