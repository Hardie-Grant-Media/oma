# OMA MCP activation and recovery

Status: merged, deployed and authenticated in the local Codex app on 10 September 2026. Restart Codex to load the new server into tasks. The separate ChatGPT web connection has not been installed. See [approved scope](mcp-brief.md) and [verification](mcp-verification.md).

## Production activation, after release approval

1. Back up the deployed API, Auth configuration, existing token hook and allowed origins. Compare production migrations with local history; apply only `20260910013332_mcp_oauth_audience.sql`, checking for an existing mapping/hook first. Preserve report-sharing records and snapshots. Do not blindly push all migrations.
2. Start adding the OMA MCP connection in the intended ChatGPT account/workspace and obtain its exact OAuth redirect URI. Register a dedicated Supabase OAuth client for that URI. Keep dynamic registration off. Store any confidential-client secret only in ChatGPT's connection settings, never GitHub, frontend configuration or conversation text.
3. Insert the dedicated client ID and exact resource URL `https://kwnpjfrxusfimzcodlpp.supabase.co/functions/v1/mcp` into `private.mcp_oauth_clients`. Register `private.mcp_access_token_hook` as the Supabase Custom Access Token Hook. If a hook already exists, compose and test both behaviors rather than replacing it. Ordinary login claims must remain unchanged.
4. Enable the Supabase OAuth server. Set the authorization path so its computed URL is exactly `https://hardie-grant-media.github.io/oma/auth/connect/`. Supabase combines this with the Site URL; verify the resulting redirect to avoid losing or doubling `/oma/`. Preserve all existing Auth redirects and `APP_ORIGINS`.
5. Configure the new Edge Function:
   - `OMA_MCP_URL=https://kwnpjfrxusfimzcodlpp.supabase.co/functions/v1/mcp`
   - `OMA_MCP_CLIENT_IDS=<dedicated registered client ID>`
   - `OMA_MCP_ENABLED=true`
   - Existing `SUPABASE_URL`, public `SUPABASE_ANON_KEY`, and `APP_ORIGINS` remain. The MCP never reads the service-role key.
6. Deploy only the `mcp` bundle, with JWT gateway verification off because the function verifies OAuth itself. It needs `mcp/*`, `_shared/commands.ts`, `_shared/domain.ts`, `_shared/sharing.ts`, the pinned import map and lockfile. The existing deployed API can remain as-is: moving schemas into a shared module is behavior-preserving, not an activation dependency. Do not redeploy the worker or overwrite its production changes.
7. Set the GitHub repository variable `OMA_MCP_CLIENT_IDS` to the same public ID. Merge the reviewed frontend changes and deploy Pages. Confirm `/oma/auth/connect/` serves its actual page, not an HTTP 404. The existing app and report viewer remain at their current URLs.
8. Complete ChatGPT's OAuth connection. Discovery is advertised in the endpoint's `WWW-Authenticate` challenge; it uses Supabase Auth's metadata. Availability depends on the account/workspace policy. No public directory publication is needed for the initial developer connection.

## Hosted acceptance

Use synthetic assigned-client data only. Verify real code + PKCE exchange, refresh, invalid verifier, exact issuer/audience/client, stale/revoked session, removed staff, administrator/member differences and denied client access. Confirm Supabase Auth and Data API both accept the dedicated audience. Create an audit, upload a synthetic file, inspect evidence and review data; verify approval rules using synthetic fixtures. Create/open/revoke an approved synthetic report link; unapproved reports must fail. Remove test records. Do not send invitations or incur AI charges merely to test this connection.

Test prompts in ChatGPT: list my audits; inspect this audit's evidence; show its job status; export its approved report; create a password-protected share when explicitly requested; revoke that share; show staff as an admin. Verify no reads accidentally create data and no approval or share occurs without a request. Check how the target ChatGPT client supplies binary attachments; the upload tool accepts bytes/text, not arbitrary download URLs.

Verify no-cache responses, staff login, original API behavior, approved report snapshots and current sharing URLs. Record deployed versions, resulting migration timestamp and evidence before declaring the connection live.

## Recovery

Set `OMA_MCP_ENABLED=false` first to stop MCP access. Revoke the dedicated OAuth client/grants. Restore the previous Auth hook/configuration and previous frontend build if needed. The existing API, reader and worker need no rollback unless separately changed. Preserve mapping records, client reports and sharing records; do not drop tables to disable the connection. Reconnecting after recovery requires a fresh OAuth grant.
