# Report sharing enabled — 10 September 2026

Target: OMA production Supabase `kwnpjfrxusfimzcodlpp`. User explicitly approved the activation and synthetic verification plan.

Applied the existing local `20260910000410_report_sharing.sql` as hosted migration `20260910010450_report_sharing`, after checking the deployed tables, access helper and migration history. Earlier hosted/local migration timestamps differ; do not blindly push or reset migrations.

Deployed API version 8 and report-reader version 1. The API bundle retained all deployed files except the sharing additions to its entrypoint and new `_shared/sharing.ts`. In particular, the deployed domain/prompt version and report branding were preserved. Existing custom authentication was retained; the reader verifies capability tokens instead of staff JWTs.

Set `OMA_REPORT_VIEWER_URL` to `https://hardie-grant-media.github.io/oma/reports/`. Existing `APP_ORIGINS` was preserved. The Pages frontend already pointed to the reader; no frontend release was needed.

## Hosted verification

- Actual Chrome staff session loaded existing audits and the isolated synthetic approved report.
- Created a password-protected link through the staff UI; copied it successfully.
- Opened the public viewer in Chrome: password prompt, followed by the synthetic HTML with the correct password.
- Reader HTTP checks: missing password 401, wrong password 404, correct password 200; `Cache-Control: no-store, private` and `Referrer-Policy: no-referrer` present.
- Expired synthetic link denied in Chrome. Restored its expiry, revoked through the staff UI, then confirmed HTTP 404 even with the correct password.
- Transactional database assertions rejected unapproved reports and unknown members. Direct anonymous/authenticated management and reader RPC execution remain denied; sharing tables have RLS and no anonymous/staff SELECT grants.
- Removed the synthetic audit, client, revision, report snapshot and share. Readback confirmed no test audit, client or share remained.

No real client reports were shared, existing approved snapshots were not changed, and no AI jobs were created. Existing user session and client-list access were observed; login/SMTP flows were not changed or retested.

## Recovery

The pre-release API version is 7. Restore its deployment bundle and disable the reader if rollback is needed; retain sharing tables and records. Do not reverse the additive migration by deleting customer data.
