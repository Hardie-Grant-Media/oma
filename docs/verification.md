# Verification

Target: local frontend with authorised hosted OMA backend. Branch: `feature/oma-mvp`. Date: 8 September 2026. Evidence owner: implementation agent; not an independent reviewer.

| Check                                             | Result              |
| ------------------------------------------------- | ------------------- |
| Production build and frontend types               | Passed              |
| Scoring, evidence safety, report and prompt tests | 22 passed           |
| API and worker tests with mocked providers        | 22 passed           |
| Local Postgres permission and workflow tests      | 58 passed           |
| Browser tests, including local Auth/API           | 7 passed            |
| Shipped dependency audit                          | No known advisories |
| Workspace keyboard/contrast scan                  | No axe violations   |
| Mobile layout and monochrome computed colours     | Passed              |
| Hosted Supabase login, uploads and worker         | Passed              |
| Live OpenAI extraction                            | Passed              |
| Live assessment, approval and export               | Pending browser upload recovery |
| Netlify deployment / independent review            | Not run             |

The real local browser journey covers email login, audit creation, setup, proxied upload, persistence after reload, queued extraction and cancellation. Valid, expired, reused and unregistered email links are tested against the local Auth service and mailbox; removed membership is tested with an existing session.

The automated full extraction → review → approval → export journey uses labelled simulated processing. Model requests are also tested using mocks, including budget refusal, uncertainty, 429/5xx, polling, insufficient evidence and deletion waiting. All 109 automated tests and the production build passed, including explicit PDF high-detail input coverage.

The separately authorised hosted canary uses actual OpenAI Responses and fictional website text/PDF only, capped at US$5. Both initial authenticated uploads succeeded. Text extraction returned 21 source-matched observations and explicit visual/outcome limitations; all were reviewed before assessment. Calibration correctly requested visual evidence. A six-page invented PDF was created and visually checked; its first extraction incorrectly applied scoring-sufficiency requirements. After the fix, extraction returned 23 source-matched textual observations and transitioned to Evidence review despite earlier failures. All 23 were checked against the source. Replaying completed extraction was denied and did not create another job.

The PDF output still reported parsed text without visual details. Current [OpenAI file-input documentation](https://developers.openai.com/api/docs/guides/file-inputs) specifies that pre-GPT-5.6 models default to low PDF detail. Worker deployment 7 now explicitly requests `detail: high`; a regression test confirms this input. A replacement extraction is required to verify visual output. The earlier PDF extract is excluded but retained, avoiding double-counted page breadth.

The browser's replacement-file upload stalled; readback confirms no third asset or active job. Browser upload guidance requests enabling the ChatGPT extension's access to file URLs. No permission was changed automatically. Final observed spend: US$0.336361; reservations: US$0. Scoring, approval and export remain unproven on the live provider. SMTP remains unconfigured.

## Approved canary fix

Local prompt `oma-1.0.1` separates observation extraction from scoring requirements. Partial readable sources produce observations plus limitations; unreadable sources still fail closed. Assessment sufficiency rules remain unchanged. Regression tests cover this separation, prompt-version recording, and recovery when a prior revision has a failed extraction. Original failed attempts remain intact.

Migration `20260908025100_extraction_stage_recovery.sql` records the actual prompt version per job, sets the revision version after calibration, and scopes extraction completion to the current revision. It passed 58 database tests. After an initial deployment rejection, the user explicitly approved the exact hosted Production update: "you may". Hosted version `20260908025132` and worker deployment 6 are now active. The new extraction job records prompt `oma-1.0.1`; anonymous and member execution of the worker RPC remains denied.

Database tests cover cross-client and removed-member reads, denied browser writes/privileged RPCs, evidence gates, atomic budgets, duplicate results, POV locking, stale/designated approval, frozen export, revisions, retained originals, deletion tombstones, late results, three-audit concurrency and cancellation races.

Local screenshots confirm the functional monochrome layout. Source evidence colours are intentionally exempt. These checks do not substitute for the hosted staging gate or a live prompt-injection evaluation.

## Hosted readback

- OMA / HGM, Sydney (`ap-southeast-2`), main labelled Production; explicit user authorisation recorded before changes.
- Five migrations, 15 RLS-protected application tables, private evidence bucket, two active functions.
- Only `api` exposed. Anonymous REST access and unauthenticated API/worker calls return 401.
- Public signup off, email confirmation on, 900-second expiry, one exact local callback. Verified administrator can read the workspace and upload.
- Vault-authenticated dispatcher returns 200 and runs every 30 seconds. General AI is off; only the named synthetic audit may reserve up to US$5.
- Database security advisor warnings were resolved. RLS/no-policy notices describe intentional deny-by-default private tables. A subsequent Auth warning reports [leaked-password protection disabled](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection); the application offers email links, not passwords. Review the hosted Auth protection before rollout.
- SMTP is absent. Dashboard requires it before custom monochrome email templates can be activated.

## Remaining release evidence

- GitHub target, authorised Netlify preview, SMTP sender and monochrome email activation.
- OpenAI project ownership, retention settings and completed bounded synthetic canary.
- Actual PDF/image extraction quality, hostile evidence and observed provider costs.
- Hosted retry, cancellation and deletion tests with real provider responses.
- Access, incident and release owners; independent review.

HGM delivery guidance requires these before release. Email login remains the user's explicit SAML exception.

## Strategy product recommendations — 2026-09-09

Local feature/oma-mvp, prompt oma-1.0.2. Added the 15 products from the four final product tables in HT Strategy Positioning_FINAL.pdf, with fit and deliverable descriptions. Catalogue is supplied only at drafting; verified-reference validation and report rendering remain intact. Synthetic report demonstrates a named offer and scope-discussion invitation.

Checks: 33 unit tests, 22 function tests, TypeScript/Vite build and Deno function checks passed. New tests cover stage separation, complete catalogue inclusion, recommendation rendering and rejection of invented evidence references. No hosted mutation, live model canary, independent review or Netlify preview was performed for this change. Existing reports have not been regenerated. Product fit and sales copy are prompt-enforced and still require strategist review.

## Strategy products live deployment — 2026-09-09

User authorised live deployment with “you may”. Deployed worker version 9 to OMA project kwnpjfrxusfimzcodlpp, prompt oma-1.0.2. All seven deployed files matched independent source readback; status ACTIVE. Live unauthenticated POST returned 401. The deployment preserves the previous worker's authentication, provider, extraction, runtime configuration and report version; changes are limited to the product catalogue, drafting prompt and prompt version. No API deployment, database mutation, schedule/secret change or report regeneration. The 55 local tests and build checks passed before deployment. A live model generation has not been run for this update.

## Hosted staff app and report sharing — 2026-09-10

Implemented on feature/oma-mvp under the approved report-sharing brief and subsequent approval to host the staff app. Root Netlify build now produces the staff application at / and a separate viewer at /reports/. No production backend mutations, deployed share links, GitHub push or Netlify deployment were performed.

Passed: 33 unit tests; 27 function tests; 31 database assertions plus 2 actual concurrent-connection tests; 5 Chromium browser tests; TypeScript, Deno checks and combined build. Total: 98 checks/tests, excluding build/type checks. Tests cover authenticated actor binding, wrong-client and inactive-member denials, approved-only creation, token hashing, password hashing, no credential metadata leakage, idempotency, expiry/revocation/deletion, fixed revisions, rate limits, mobile/keyboard access, clipboard copying, empty sandbox, no browser storage and combined-build routes/headers. Password and staff-dialog screenshots were visually inspected.

Database evidence uses isolated PostgreSQL 14 on 127.0.0.1:55439 because Docker was unresponsive. It loads the original OMA table/helper definitions and a minimal auth.users fixture, then applies the migration; native assertion wrappers run the same sharing SQL tests. This does not establish full Supabase/PostgREST/Auth integration. Browser transport is mocked; a local HTTP server applies the committed Netlify headers and routing to the built artifacts. Actual Netlify headers, login delivery, function/database readback and independent review remain release checks after the user's hosting setup.

Build test used an example HTTPS reader endpoint; Netlify must supply the real environment variables from report-sharing-handoff.md. Local temporary database stopped after verification.
