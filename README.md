# OMA

Internal owned-media audit workspace. React, TypeScript, Vite, TanStack Router, Tailwind, shadcn/ui, Supabase and OpenAI.


## Hosting and report sharing

The staff app and report viewer are ready for a combined Netlify build. Follow [the hosting handoff](docs/report-sharing-handoff.md). Staff sign-in origins and the new sharing backend must be configured after the Netlify URL is known. This supersedes earlier local-only frontend deployment notes below.

## Status

Running locally at `http://127.0.0.1:5173` against the authorised hosted OMA backend. Production builds exclude the separate demo adapter.

Supabase project `kwnpjfrxusfimzcodlpp` belongs to HGM in Sydney. Its main branch is labelled Production; the user explicitly authorised database, functions, email login and initial-admin setup there. Five migrations, private Storage, two functions and the 30-second worker are active. Timothy Osmond is the verified administrator.

OpenAI is configured server-side. Only the authorised synthetic audit can run, with an atomic US$5 ceiling; general client AI remains off. SMTP, provider-project retention confirmation, independent acceptance and a separate release decision remain required. The user now authorises hosting the staff app; follow the hosting handoff above.

Live testing found an extraction/recovery bug. The fix was deployed with explicit hosted Production approval; 109 automated tests pass. PDF text extraction and recovery now work. High-detail visual extraction and downstream assessment await browser upload recovery. The canary has spent US$0.336361 with no active requests. See the verification record for details.

## Run

```sh
npm ci
npm run dev -- --port 5173 --strictPort
```

Open `http://127.0.0.1:5173`. The ignored `.env.local` selects the hosted backend using its public key. Sign in by email link. SMTP is not yet configured; default Supabase delivery is pilot-limited.

For a separate simulated preview, run `VITE_DEMO=true npm run dev -- --port 5180`. This uses synthetic Northline House data and simulated processing, stored per browser session.

For real local data:

```sh
supabase start -x studio,realtime,imgproxy,logflare,vector,supavisor
supabase functions serve
npm run dev
```

For an isolated local backend, replace the frontend URL/public key with values from `supabase status`. Never place the service-role or OpenAI key in a `VITE_` variable. Use `supabase functions serve --env-file supabase/functions/.env.example` for local tests. Keep hosted credentials out of test services.

Isolated tests use API port 55321, database 55322 and test mail 55324. Other local Supabase projects are untouched. Test Auth permits port 5175; hosted Auth permits only the local app's exact port-5173 callback. Replace this callback only when a frontend release is authorised.

## Workflow

1. Admin adds clients, provisions members and assigns teams.
2. Staff set audience, category, period, channels and strategist POV.
3. Upload evidence; extract, verify or explicitly exclude it.
4. Lock POV and assess. Insufficient evidence returns for review.
5. Review scores, references, confidence and report copy. Explain corrections.
6. The designated strategist approves the current revision.
7. Download frozen HTML. Editing creates another draft.

Reports contain all 11 sections. Scores and ranking are deterministic. AI receives neither the POV prediction nor reviewer governance fields. Original AI assessments, revisions, feedback and calibration differences are retained.

## Tests

```sh
npm run build
npm test
npm run check:functions
npm run test:functions
supabase test db
npx playwright install chromium
npm run test:e2e
OMA_LOCAL_AUTH_TESTS=true npm run test:e2e
```

The final command needs OMA's isolated local services and tests actual magic links through the local mailbox, plus real API uploads and job cancellation. It creates and removes synthetic members and audit data. Other browser workflow tests use the synthetic adapter; neither proves a hosted AI pipeline. Project-local Deno 2.2.12 generates the v4 lockfile supported by Supabase CLI 2.72.7; use the npm scripts rather than a newer system Deno.

See [verification](docs/verification.md), [deployment](docs/deployment.md), [architecture](docs/architecture.md) and [technical brief](docs/technical-brief.md).
