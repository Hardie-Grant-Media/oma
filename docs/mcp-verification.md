# MCP implementation verification — 10 September 2026

Target: local synthetic environment; branch `feat/chatgpt-mcp`. Evidence produced by Codex executing the repository tests. This is implementation evidence, not independent release review.

- Official MCP SDK client/server: initialization, tool discovery and command execution pass.
- Cryptographically signed ES256 token tests: valid tokens pass; tampered signature, wrong issuer/audience/client/scope, expiry, missing session, removed membership and revoked grant fail.
- Tool tests: member/admin separation, inaccessible audits, actor stripping, budget limit and original upload bytes pass. Backend errors propagate without creating an alternate approval or sharing path.
- Existing API, sharing and worker function tests remain passing.
- Installed Google Chrome: six isolated browser tests pass for OAuth continuation, allow, deny, unknown client, expired request, denied membership and disconnect. Supabase endpoints are intercepted with synthetic fixtures; these do not prove live OAuth exchange. Consent accessibility check has no violations.
- Isolated PostgreSQL 14: ten checks pass for table/function grants, RLS, dedicated audience, refresh claims and unchanged ordinary/other-client claims. The temporary database is stopped and removed. The target hosted database is PostgreSQL 17; hosted verification is still required.
- Strict function checks and the app/viewer production builds pass, including the static Pages consent route. Existing 33 unit tests, 32 function tests and six password-login regression tests pass. Runtime dependency audit reports zero vulnerabilities; Gitleaks finds no secrets in the publishable repository files.
- No production changes, client report shares, AI calls, invitation emails or schedule changes.

Full hosted Supabase OAuth, PKCE exchange, ChatGPT connection, exact deployed redirects, custom-audience Data API acceptance and live removal/revocation canary remain pending. Local Docker-backed Supabase did not respond; a fresh standalone local PostgreSQL instance was used only for SQL behavior. No hosted staging environment or independent reviewer was provisioned.
