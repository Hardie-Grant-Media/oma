> Sharing is now enabled on GitHub Pages. See [deployment results](report-sharing-release.md). The Netlify instructions below are historical hosting guidance.

# GitHub and Netlify handoff

The combined site hosts the staff app at `/` and report links at `/reports/`. The staff app retains email sign-in, active membership and client assignment checks. Sharing is an explicit action on an approved report revision.

## Push and connect

Push the `oma` project to your GitHub repository, then connect it in Netlify. If GitHub contains the surrounding project directory, set Netlify's base directory to `oma`; if the repository root is already `oma`, leave base blank.

The committed `netlify.toml` sets:

- Build command: `npm run build:hosted`
- Publish directory: `dist`
- Node: 24
- Staff route fallback and separate `/reports/` route fallback
- No-store, noindex and security headers

Set these Netlify build environment variables:

| Variable | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | `https://kwnpjfrxusfimzcodlpp.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | OMA's public anonymous/publishable key, from Supabase |
| `VITE_REPORT_READER_URL` | `https://kwnpjfrxusfimzcodlpp.supabase.co/functions/v1/report-reader` |
| `VITE_DEMO` | `false` |

These variables are public browser configuration. Never put service-role, OpenAI or worker secrets in Netlify `VITE_` variables. Keep `.env` files out of Git. Builds intentionally fail when the viewer endpoint is missing or not HTTPS.

## Return with the Netlify URL

The new sharing backend has not been deployed. Before the hosted app is ready for staff, complete the following against the exact approved target:

1. Apply only `20260910000410_report_sharing.sql` after reconciling the existing migration history. Earlier local/hosted migration timestamps differ; do not run a blind push/reset.
2. Deploy the updated `api` function and the new `report-reader`, including `_shared/sharing.ts`, the existing imports and runtime configuration. Preserve the API's existing authentication. `report-reader` uses custom capability verification with gateway JWT verification disabled.
3. Set Supabase function secret `OMA_REPORT_VIEWER_URL` to `https://YOUR-NETLIFY-SITE/reports/` and add the exact hosted origin to `APP_ORIGINS`, preserving authorised local origins.
4. Add `https://YOUR-NETLIFY-SITE/auth/callback` to the exact Supabase Auth redirect allowlist; configure Site URL for the chosen hosted origin. No wildcard redirects or public signup. Verify staff email-link sign-in and existing membership/assignment restrictions.
5. Create a synthetic approved report and verify create → copy → open → password/expiry → revoke on the hosted site. Verify the actual headers, reader rate limits and database grants. Do not publish real reports automatically.
6. Complete independent review and staff email-delivery checks before rollout. Custom HGM domain/DNS can follow; update all exact origins and redirects when it changes.

The user will push GitHub and connect Netlify, then return to finish these backend and sign-in steps. No production changes or live links were made for this feature.

## Local verification

- `npm test`
- `npm run test:functions`
- `npm run check:functions`
- Build using the Netlify variables above: `npm run build:hosted`
- `npm run test:sharing` (requires a completed hosted build; uses mocked API responses and actual browser rendering)
- With isolated local Supabase: `supabase test db`

Docker was unresponsive during this implementation. The new database migration was instead exercised against a temporary PostgreSQL 14 database on `127.0.0.1:55439` using `tests/local/sharing-db.py`, original OMA table/helper definitions, and a minimal replacement for Supabase's `auth.users`. This proves the sharing SQL and concurrency cases but does not replace full Supabase integration or hosted verification. The harness requires a fresh temporary cluster with pgcrypto; it never connects remotely.

## Behaviour and limits

Link tokens use 32 browser-generated cryptographically random bytes and SHA-256 storage. Passwords use salted bcrypt (cost 12), 8+ characters, at most 72 UTF-8 bytes. The browser retains the token only while the dialog is open; retries reuse the same token and request ID. The database never stores the raw link token. Copy the link at creation; lost links can be revoked and replaced.

Only the saved approved HTML is returned. Later revisions do not alter existing links. Revocation/expiry/deletion deny subsequent reads; already viewed/downloaded copies cannot be recalled. The reader limits each link to 60 requests/minute and five failed password attempts/15 minutes, with a fixed global 600-requests/minute database bucket. The table is bounded to 100 links per audit, including revoked links, and is deleted with the audit.

A recipient's iframe has an empty sandbox and restrictive content policy: no scripts, forms, uploads or internal OMA access. Report content and credentials are not persisted by the viewer. Sharing does not generate another AI report or charge AI usage.
