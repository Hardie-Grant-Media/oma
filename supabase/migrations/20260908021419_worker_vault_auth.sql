-- One server-side worker credential, generated in Vault; never returned to clients.
do $$ begin
 if not exists(select 1 from vault.secrets where name='oma_worker_token') then
  perform vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'oma_worker_token');
 end if;
end $$;
create function api.worker_authorized(candidate text) returns boolean
language sql stable security definer set search_path='' as $$
 select length(candidate) between 32 and 256 and exists(
  select 1 from vault.decrypted_secrets where name='oma_worker_token'
  and extensions.digest(decrypted_secret,'sha256')=extensions.digest(candidate,'sha256')
 );
$$;
revoke all on function api.worker_authorized(text) from public,anon,authenticated;
grant execute on function api.worker_authorized(text) to service_role;
