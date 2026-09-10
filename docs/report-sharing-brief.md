# OMA report sharing: technical brief

Status: approved for local implementation by the user (“approved”). Owner: Timothy Osmond. Date: 2026-09-10.

## Approved requirement

The user approved proceeding with hosted approved reports, shareable private links, revocation, optional passwords and expiry. Each link shows a fixed approved revision. The user subsequently authorised hosting the staff app for staff access. This extends the existing offline-export scope; it does not authorise public report listings, client accounts or publication of any existing report.

## User flow

An active member with access to an audit selects an approved revision, chooses Share, optionally sets a password and expiry, and creates a link. Show clearly that anyone holding the link (and password, when set) can read it. Staff can copy the newly created link, inspect its revision and expiry, revoke it, or create a replacement. Never send it automatically.

Recipients open an HGM-branded viewer without an OMA account. Password-protected links show a password form. Invalid, expired, revoked and deleted reports show the same unavailable message. Existing HTML download remains available to staff.

## Implementation

- Deploy the staff app at the Netlify site root and a separate report viewer at /reports/. Keep staff data behind existing login, active membership and client assignment checks. Use the existing report styling and approved HTML snapshot in `private.report_files`.
- Extend the authenticated API with create/list/revoke share actions. Recheck active membership, client assignment and revision approval inside the database transaction; never trust browser-supplied HTML or approval status.
- Store shares in a private table with revision reference, creator, creation time, expiry, revocation time, unique token hash and optional password hash. Generate tokens from 32 cryptographically random bytes. Return a token once; store only its SHA-256 digest. Hash passwords using a salted, supported password KDF.
- Put the token in the URL fragment so hosting request logs do not receive it. The viewer sends it, and any password, to a dedicated read endpoint using POST. Never put credentials into query strings, analytics or application logs.
- The read endpoint checks token, expiry, revocation and report/audit availability on every request. Return only the saved approved HTML. No anonymous table or Storage grants. Restrict CORS to the configured viewer origin; token validation remains the access boundary.
- Rate-limit password attempts and requests using bounded, atomic counters with expiry. Return uniform failures without revealing report titles or password configuration to invalid token holders.
- Render the returned HTML in an iframe sandbox without scripts, same-origin access, forms or top navigation. Use restrictive CSP, no-referrer, no-store and noindex headers. The viewer must not persist report content or credentials in browser storage or a service worker.
- Shares remain attached to their original revision after later edits. Audit deletion makes shares unavailable immediately and removes share records with the audit. Revocation blocks subsequent reads; it cannot retract downloaded or already displayed copies.

## Environments and boundaries

Repository: local `oma`, feature branch required. Existing backend: Supabase `kwnpjfrxusfimzcodlpp`, main Production. No production backend changes are authorised by this brief. The user will perform the GitHub/Netlify publication. Build against isolated local Supabase with synthetic reports, preserving the existing email-login exception and all permissions, approval rules, AI budgets and schedules.

Netlify account/site and an HGM-controlled domain are not configured in the repository. Resolve hosting access during implementation; verify account ownership before provisioning. A Netlify preview can prove the viewer before custom-domain setup. Domain selection and DNS approval belong to Timothy/HGM IT. The Netlify-provided domain can be used before custom-domain setup.

No AI generation is needed for this feature's tests. No report becomes shared automatically on approval. Do not create live share records, enable general AI, change Auth settings, send messages or alter existing approved snapshots before the release handoff. Hosted staff access is now in scope; the user will push to GitHub and connect Netlify.

## Acceptance and verification

1. Assigned active staff create, inspect and revoke links for approved revisions. Anonymous, removed-member, wrong-client and draft-revision requests fail.
2. Valid links return exactly the approved snapshot. Invalid tokens, incorrect passwords, expired/revoked links and deleted audits reveal no report content.
3. A later revision does not change an existing share. Concurrent revocation/deletion and repeated create requests cannot bypass permissions or unintentionally duplicate shares; use an idempotency key for creation.
4. Optional password and expiry work independently and together. Rate limits work under concurrent requests; secrets never appear in logs or responses other than the initial token delivery.
5. Browser tests prove copying/opening a link, keyboard operation, password errors, mobile layout, sandboxing, revocation and cache headers. Source uploads, private notes and authentication credentials remain inaccessible.
6. Run database permission tests, API/unit tests, type checks and builds. Verify the isolated preview and obtain independent review before a production release decision.

## Rollout and recovery

Use an additive migration, authenticated API update, dedicated reader and separate viewer deployment. Preserve offline exports. Recovery disables new sharing and the reader while retaining share metadata for diagnosis; do not drop report snapshots. Record exact versions and readback evidence.

Local implementation approved. Production migration, function deployment, hosting target and domain require a concrete release approval after verification.

## Hosting scope update (user authorised 2026-09-10)

User: “i’m fine to host the internal OMA app. It needs to be hosted for staff to use”. The combined Netlify build therefore publishes both the staff app and /reports/ viewer. User will push to GitHub and Netlify, then return to complete backend deployment, exact-origin CORS and login redirect configuration. Existing sign-in and backend permissions remain enforced.
