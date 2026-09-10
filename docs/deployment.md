# Local app / hosted backend

The user explicitly authorised OMA's hosted main backend on 8 September 2026 after its Production label was disclosed. The frontend must remain local. This is not authorisation for a public or Netlify release.

## Confirm targets

1. Verified project `kwnpjfrxusfimzcodlpp`: OMA, HGM, Sydney, main Production. Initial application state was empty.
2. Frontend: `http://127.0.0.1:5173`, branch `feature/oma-mvp`. GitHub and Netlify targets are not configured.
3. Initial administrator: `timothyosmond@hardiegrant.com`, invited through Auth, email confirmed and active application membership verified.
4. SMTP sender, access owner and incident owner remain required before team rollout.

## Database and Auth

Five migrations are applied to the authorised target. PostgREST exposes `api`, not `private` or `public`. All 15 application tables have RLS. Private tables intentionally have no browser policies. Anonymous reads and unauthenticated functions fail closed. Independent review remains pending.

The user explicitly approved the extraction/recovery update: "you may". Migration `20260908025100_extraction_stage_recovery.sql` is deployed as hosted version `20260908025132`; worker deployment 7 uses prompt `oma-1.0.1` and explicit high-detail PDF processing. Readback confirmed the new column and denied browser execution privileges. The synthetic test resumed under its existing US$5 cap; final visual and assessment acceptance awaits browser upload recovery.

MCP assigned hosted migration timestamps; local filenames differ. The mapping is recorded in `staging-manifest.json`. Do not blindly run CLI push or repair: first reconcile by migration name and contents. Never reset the hosted database.

Public signup is disabled, email enabled and confirmation required. The app uses `shouldCreateUser:false`, PKCE and a 60-second resend timer; hosted expiry is 900 seconds. The sole redirect is `http://127.0.0.1:5173/auth/callback`, with no wildcard. Default Supabase email delivered the administrator invitation and login; it is not a production SMTP setup. Dashboard template editing requires custom SMTP, so the checked-in monochrome template is not yet active. SAML is excluded by user approval.

Create the first Auth user through an authorised admin operation, then insert its existing ID, name, email, `role='admin'` and `active=true` into `api.members`. Do not publish a bootstrap endpoint. Later members are provisioned in Admin.

## Secrets

Frontend: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. Leave `VITE_DEMO` unset or false. The build rejects enabled synthetic previews.

Edge Functions: `OPENAI_API_KEY`, `APP_ORIGINS` (exact comma-separated origins), `OMA_AI_ENABLED`, `OMA_PROVIDER_RETENTION_ACK`, optional `OMA_CANARY_AUDIT_ID`. Supabase supplies its URL, anonymous key and service-role key. Use secret stores, never Git or browser variables. The user saved OpenAI credentials directly in the Dashboard; only the secret name/digest was inspected.

Record OpenAI project ownership, data residency, Responses/background retention, abuse-monitoring retention, file retention and any zero-data-retention incompatibility. Background requests need stored response state. App deletion cannot promise deletion of provider safety logs or backups.

Deploy `api` and `worker`. Their gateway JWT check is disabled intentionally: `api` validates the user through Auth; `worker` requires its separate secret. Never remove these in-function checks.

Vault holds `oma_worker_url` and a database-generated random `oma_worker_token`. The hosted worker validates the supplied token through a service-only RPC, without returning its value. `OMA_WORKER_TOKEN` is only an optional local-test override. The authorised scheduler is active:

```sql
select cron.schedule('oma-dispatch','30 seconds','select private.dispatch()');
```

General AI remains disabled. Only audit `d0e720e7-3655-4483-b542-7277a2507398` is allowlisted for the user's synthetic stored-Responses test; its reservation ceiling is US$5 regardless of a higher audit budget. Remove the canary allowlist after acceptance. Do not enable general AI or send client evidence under this limited authorisation.

## Acceptance

Run synthetic upload → extraction → verification → assessment → review → approval → download. Confirm terminal queue results, cost counters, preserved originals and all 11 offline report sections. Replay a submission. Test revoked membership, cross-client access, stale approvals, cancellation and deletion during processing. Check real SMTP expiry and reuse. Inspect exact Netlify headers and mobile/keyboard behaviour.

Review the staging evidence independently. No Green release recommendation is possible without the exact hosted preview and target readback.

## Strategy products live deployment — 2026-09-09

User authorised live deployment with “you may”. Deployed worker version 9 to OMA project kwnpjfrxusfimzcodlpp, prompt oma-1.0.2. All seven deployed files matched independent source readback; status ACTIVE. Live unauthenticated POST returned 401. The deployment preserves the previous worker's authentication, provider, extraction, runtime configuration and report version; changes are limited to the product catalogue, drafting prompt and prompt version. No API deployment, database mutation, schedule/secret change or report regeneration. The 55 local tests and build checks passed before deployment. A live model generation has not been run for this update.
