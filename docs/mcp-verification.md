# MCP implementation verification — 10 September 2026

Target: local synthetic environment; branch `feat/chatgpt-mcp`. Evidence produced by Codex executing the repository tests. This is implementation evidence, not independent release review.

- Official MCP SDK client/server: initialization, tool discovery and command execution pass.
- Cryptographically signed ES256 token tests: valid tokens pass; tampered signature, wrong issuer/audience/client/scope, expiry, missing session, removed membership and revoked grant fail.
- Tool tests: member/admin separation, inaccessible audits, actor stripping, budget limit and original upload bytes pass. Backend errors propagate without creating an alternate approval or sharing path.
- Existing API, sharing and worker function tests remain passing.
- Installed Google Chrome: six isolated browser tests pass for OAuth continuation, allow, deny, unknown client, expired request, denied membership and disconnect. Supabase endpoints are intercepted with synthetic fixtures; these do not prove live OAuth exchange. Consent accessibility check has no violations.
- Isolated PostgreSQL 14: ten checks pass for table/function grants, RLS, dedicated audience, refresh claims and unchanged ordinary/other-client claims. The temporary database is stopped and removed. The target hosted database is PostgreSQL 17; hosted verification is still required.
- Strict function checks and the app/viewer production builds pass, including the static Pages consent route. Existing 33 unit tests, 32 function tests and six password-login regression tests pass. Runtime dependency audit reports zero vulnerabilities; Gitleaks finds no secrets in the publishable repository files.
- At implementation review, no production changes were made. Hosted activation is recorded below.

At implementation review, hosted verification remained pending. See the subsequent activation results below. Local Docker-backed Supabase did not respond; a fresh standalone local PostgreSQL instance was used only for SQL behavior. No hosted staging environment or independent reviewer was provisioned.


## Hosted activation — 10 September 2026

User authorized merge and installation in this Codex app. PR #2 merged as `0b30d22`; deployment corrections are `3b7e4d2` and `aa504de`. GitHub Pages run `34429464846` and Check run `34429464854` succeeded.

- Applied only the MCP migration after comparing hosted history. Hosted version: `20260910020546_mcp_oauth_audience`.
- Registered public PKCE client `508c1255-4f05-4ef4-9f41-8a91460cf7ef`, named OMA for Codex. Dynamic registration stays off. Exact redirect: `http://127.0.0.1:54873/callback/OxMh69owFNWg`; Supabase rejected variable ports, so Codex uses a fixed per-server port.
- Enabled the OAuth server and the previously absent `private.mcp_access_token_hook`. Site URL normalized from `https://hardie-grant-media.github.io/oma/` to `https://hardie-grant-media.github.io/oma`; authorization path `/auth/connect/`. Existing login redirects and allowed origins preserved.
- Enabled the three OMA_MCP settings and the matching public GitHub client-ID variable. MCP function v5 is active, bundle SHA256 `7e5ed4a2789964fdc822d33be1de5ef1d9209d94612e806a67f067d7812f9e98`. Hosted gateway path stripping is handled explicitly.
- Existing API, worker and report-reader code was not redeployed. Final platform versions are API 12, worker 14, reader 5 (secret updates advance platform versions); their source bundles remain unchanged.
- Installed global Codex server `oma`; native `codex mcp login oma --scopes email` completed successfully after approval in actual Google Chrome. Credentials remain in Codex's own credential storage.
- A separate temporary in-memory OAuth verifier confirmed real PKCE exchange, dedicated audience/client/email scope, MCP initialization, discovery of 36 administrator tools, and successful `oma_whoami`. Every MCP response had `Cache-Control: no-store, private`. No tokens were written to the repository or printed.
- Anonymous MCP access returns 401 with protected-resource discovery. Anonymous/staff roles cannot read the private client mapping; anonymous users cannot execute the token hook; Auth can execute it. Authenticated MCP snapshot access confirms custom-audience Data API acceptance and active staff membership.
- Repeated authorization succeeds after preventing staff snapshot refreshes from replaying a consumed authorization request. Six actual Chrome regression tests pass, including focus refresh. Forty unit tests and 32 function tests pass; production build and CI succeed.
- No client reports, shares, staff accounts, AI jobs, invitation emails or schedules were changed by these live checks. Temporary verification scripts are removed. Existing OAuth grant is retained for Codex.

The running Codex task cannot hot-load the newly added server. Restart Codex and start a new task to use it. A separate ChatGPT web installation and destructive/live revocation, membership-removal and refresh-token canaries were not performed; their automated coverage remains as described above.
