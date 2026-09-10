# Password login PR

Staff use their existing invited email address and password. “Set or reset password” lets existing users establish their first password. Email-link login remains available. There is no signup form or automatic account creation.

Supabase Auth owns password verification and storage. App access still requires active membership and client assignments. No database migration or server credentials are required by this change.

## Release configuration and acceptance

Before merging/deploying, preserve the existing Supabase redirect URLs and add the exact recovery URL:
`https://hardie-grant-media.github.io/oma/auth/callback?next=password`.
For isolated local Auth testing, allow the equivalent local callback URL. Recovery links must open in the browser that requested them (PKCE).

Confirm Email provider remains enabled and public signup remains disabled. Verify SMTP delivery and the server password policy with an invited test account; the new-password form requires at least 12 characters, but this is not a replacement for server policy. Verify correct and incorrect passwords, reset/reused/expired links, removed membership and denied client access against a real isolated Supabase environment before release. No live account passwords or Auth settings were changed for this PR.

The Pages build includes `/oma/auth/password/` as a static entry. Existing redirects and origin configuration remain applicable. Rollback is reverting the PR; existing accounts/passwords remain valid in Supabase.

## Evidence

Local Playwright tests use the real Supabase JavaScript client with intercepted synthetic Auth/API responses, under `/oma/`. They prove form behavior, request construction, navigation, error handling and accessibility, not the hosted Auth service, email delivery or RLS. Existing audit workflow tests exercise the synthetic application adapter. Chrome screenshots were inspected locally.
