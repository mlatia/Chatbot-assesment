# PlacidWay: Manual Deployment to Vercel + Supabase

This package is a separate adaptation of the Cloudflare Workers/D1 demo. Use **this package**, not the earlier Cloudflare ZIP, for Vercel. The React frontend and the Next.js API backend live in one project. The database runs on Supabase PostgreSQL. No Python server, FastAPI process, or LangGraph needs to be running.

This guide was checked on **October 22, 2026**. The package is prepared for manual deployment to your own accounts; it has not been published or tested end-to-end in your Vercel/Supabase accounts.

## 1. Is it free? Which keys are used?

| Component | Notes |
| --- | --- |
| Vercel Hobby | Free plan with quotas; intended for personal, non-commercial use. Check the terms for your use case. |
| Supabase Free | 500 MB database, at most two active projects, plus other quotas. Projects may be paused after one week of inactivity. |
| Extractive mode | Uses no LLM, so there are no inference charges. This is the mode used by the earlier demo. |
| Groq API | Optional. Usage is subject to Groq's pricing and rate limits. Do not rely on free-tier limits to run a public bot. |

**No LLM API key was used in the earlier demo deployment.** It was hosted on Sites/Cloudflare with D1, not on Vercel or Supabase, so there is no LLM key from that deployment to copy over. Hosting publish credentials are different from LLM keys.

Adding a key only enables the evidence-ID selection adapter for some `general` questions. Prices, fallbacks, conversation state, and most responses are still determined by code. The adapter does not turn this implementation into a full LLM chatbot, and LangGraph is not used.

## 2. Create Supabase and prepare the database

1. Open https://supabase.com/dashboard and create an organization/project on the **Free** plan. Choose a region close to your hosting/users. Store the database password in a password manager. The app does not need it because it uses the Data API over HTTPS.
2. When the project is ready, open **SQL Editor → New query**.
3. Open **`supabase/schema.sql`** from this package. Paste its entire contents into the SQL Editor and **Run** it.
4. Get the **Project URL** from the **Connect** dialog or the **Data API** settings. It looks like `https://PROJECT_REF.supabase.co`.
5. Get the **secret key** from the **API Keys** settings. Use the key starting with `sb_secret_...`. Do not use the publishable key. If an older project only has a `service_role` key, that value is also supported in the same variable.

The SQL creates tables in the `pw_private` schema and the RPC function `public.pw_call`. The tables are not exposed to visitors. RLS is enabled; RPC access is granted only to `service_role`, the server role used by the secret key. The browser talks to the Next.js API and never receives the Supabase secret.

The Supabase Data API settings must have the `public` schema enabled (the default), because `pw_call` lives there. Do not add `pw_private` as an exposed schema. To inspect data manually, use the SQL Editor; that schema is not selected by default in the Table Editor.

pgvector, Auth, Storage buckets, and Supabase Edge Functions are not needed. The seven knowledge pages are already bundled in `data/knowledge.json`. On a fresh database, the backend reads the bundled snapshot; later refreshes store the active snapshot in Supabase. Chat data from the Cloudflare demo is not migrated.

## 3. Set up the local environment

Install **Node.js 22.13+** (Node 22/24 LTS), then open a terminal in the package folder that contains `package.json`. Do not run commands in an unextracted ZIP folder.

Windows PowerShell:

```powershell
npm ci
Copy-Item .env.example .env.local
```

macOS/Linux: replace the copy line with `cp .env.example .env.local`.

Edit `.env.local` in a local editor:

```dotenv
SUPABASE_URL=https://PROJECT_REF.supabase.co
SUPABASE_SECRET_KEY=YOUR_SUPABASE_SECRET_KEY
ADMIN_REFRESH_TOKEN=YOUR_LOCAL_RANDOM_TOKEN

GROQ_API_KEY=
GROQ_MODEL=openai/gpt-oss-20b

LIVE_BASE_URL=http://localhost:3000
```

Values starting with `YOUR_` are placeholders, not usable keys. Generate `ADMIN_REFRESH_TOKEN` yourself with the command below and copy the result into `.env.local`:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

| Variable | Where to get it | When it is needed |
| --- | --- | --- |
| `SUPABASE_URL` | Supabase Project URL | Required for the backend. |
| `SUPABASE_SECRET_KEY` | API Keys → secret key (`sb_secret_...`) | Required for the backend. Legacy `service_role` is also supported. |
| `ADMIN_REFRESH_TOKEN` | Random token from the command above | For refresh and reading content gaps; minimum 24 characters. |
| `GROQ_API_KEY` | Your Groq account (https://console.groq.com/keys) | Optional. Leave empty to avoid LLM calls. |
| `GROQ_MODEL` | A Groq model ID that supports the adapter's parameters | Only used when the LLM key is set. |
| `LIVE_BASE_URL` | Target URL for CLI scripts | `http://localhost:3000` locally; after deploying, set it to the Vercel HTTPS URL when running scripts against the live site. |

All secrets are **server-only**. Never add a `NEXT_PUBLIC_` prefix to a secret. `NEXT_PUBLIC_SUPABASE_ANON_KEY` is not needed for this architecture. `.env.local` is ignored by Git; `.env.example` contains only an empty template.

## 4. Running the backend and frontend

```sh
npm run dev
```

Open **http://localhost:3000** for the UI. The backend runs on the same server:

| Method and path | Purpose |
| --- | --- |
| `GET /api/health` | Checks the database connection/RPC and the seven sources. |
| `GET /api/sources` | Source metadata and snapshot version. |
| `POST /api/chat` | Question, session context, retrieval, and sourced answer. |
| `GET /api/session` | Session history based on the cookie. |
| `DELETE /api/session` | Deletes the current conversation. |
| `POST /api/lead` | Stores contact details with consent; does not send them to PlacidWay. |
| `POST /api/refresh` | Admin: re-crawl the seven allowed URLs. |
| `GET /api/refresh` | Admin: read content gaps. |

You do not need two terminals for frontend and backend, CORS configuration, or Uvicorn. Hosted Supabase already runs the database in the cloud; your local machine only runs Next.js. After changing environment variables, restart the server with Ctrl+C then `npm run dev`.

To run the production build on your own machine:

```sh
npm run build
npm start
```

On Vercel, the API routes become Vercel Functions. Vercel runs them; your laptop does not need to stay on, and there is no manual `npm start` process in the dashboard.

## 5. Local checks

Once the SQL and `.env.local` are ready, with the server still running:

```sh
npm run check:deployment
npm run test:submission
```

A correct health response contains `status: "ok"`, `sources: 7`, and `knowledgeVersion`. `engine: "extractive"` means no LLM key is set. `groq-configured-not-verified` means a key is configured but **does not prove the provider call succeeds**.

`test:submission` uses `LIVE_BASE_URL` if set, sends eight questions to the target API, and saves the actual responses to `docs/live-test-results.md` and `.json`. Without that variable, the test uses the local engine and writes `docs/test-results.*`. Because the `.env.local` template sets localhost, the server must already be running for the HTTP tests.

Tests that need neither a Supabase account nor an LLM key:

```sh
npm test
npm run build
npm run typecheck
npm run test:api
```

`test:api` must be run after the build. It starts a temporary production Next.js server and uses a local PGlite-based PostgreSQL through a test-only HTTP bridge. This exercises the real routes and SQL, but does not test gateway/auth configuration on a hosted Supabase account. That script is not used in production and must not be deployed as a service.

## 6. Manual deployment to Vercel

1. Create a new GitHub repository. Upload the **contents of this package folder** so that `package.json`, `package-lock.json`, `app`, `lib`, and `supabase` are at the root. Do not upload `.env.local`, `node_modules`, or `.next`. The hidden `.gitignore` file must be included; if the web uploader hides `.env.example`, add the template manually or via Git.
2. Open https://vercel.com/new → **Import Git Repository** → select the repo. Use the account/plan appropriate to your usage terms.
3. Select **Framework Preset: Next.js**. **Root Directory:** the folder containing `package.json` (root if you followed step 1). **Install Command:** `npm ci`. **Build Command:** `npm run build`. Leave the output directory at the Next.js default; do not choose `dist`.
4. Choose the **Node.js 22.x or 24.x** runtime, matching the version you tested. No Cloudflare `DB` binding, Wrangler, Vite, or Vinext is needed.
5. Before deploying, add the server variables from `.env.local` under **Environment Variables**: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `ADMIN_REFRESH_TOKEN`. Add `GROQ_MODEL` and `GROQ_API_KEY` only if you want the LLM adapter. **For a no-LLM-cost mode, remove/leave empty `GROQ_API_KEY`.** Select the **Production** environment; also fill Preview if you want the backend to work on preview deployments.
6. Click **Deploy**. Vercel builds the UI and API routes together. If you change environment variables after deployment, run **Redeploy**; old deployments do not pick up new values.
7. Open the production HTTPS URL from Vercel. Make sure the production deployment opens without login. If deployment protection asks reviewers to log in, adjust the deployment protection settings of **your own Vercel project** for the URL you submit. Do not change access to the earlier Sites demo.
8. In your local `.env.local`, set `LIVE_BASE_URL` to the Vercel production URL, then run `npm run check:deployment` and `npm run test:submission`. The UI does not use this variable, so you do not need to set it in Vercel if it is only used from your local terminal.
9. Test chat, follow-ups, history reload, and New conversation in the browser. Try the URL in incognito to confirm reviewers do not need to log in. Keep the test results and the live link as part of your submission.

Supabase only stores data; the **chat backend runs on Vercel**, not on Supabase. Do not upload the API folder as SQL or run `next dev` on Supabase.

## 7. Groq: getting a key and the implementation's limits

1. Open https://console.groq.com/keys and create an API key for this app. Never use a browser session token as an application key.
2. Check your Groq plan, usage, and rate limits in the console. An API key does not by itself mean free inference, and free tiers have strict rate limits.
3. Set `GROQ_API_KEY` only in `.env.local` / Vercel environment variables. Do not send the key through public chat, commit it to Git, or include it in submission files.
4. The adapter calls Groq's OpenAI-compatible Chat Completions endpoint (`https://api.groq.com/openai/v1/chat/completions`) with a structured JSON schema and `temperature=0`. The default model is `openai/gpt-oss-20b`. Strict JSON schema is only supported on certain models; with other models, switch `response_format` to `{ type: 'json_object' }`. Check parameter support in `lib/model.ts` and the Groq docs before changing the model, not just the name. Groq rotates and deprecates models, so verify the current model list.
5. To verify the integration, use a question that actually yields `intent: "general"` and `status: "answered"`. In the chat response, `engine: "groq-evidence-selection"` proves the model-selection path was used; `extractive-fallback` means the provider failed. Package prices and the eight assessment tests do not automatically prove model usage.

Cost only occurs on adapter calls that actually run; other questions do not call the LLM. Model availability and quotas depend on your account.

This package does not turn the adapter into full generative RAG, add embeddings, or implement LangGraph. It is a hosting/storage adaptation of the existing implementation. The requirement to demonstrate active LLM grounding still needs a real provider test and an explanation of these limits in the submission.

## 8. Refreshing content without mixing deployment versions

No refresh is needed to run the app for the first time. Use the existing seven-source snapshot. If you do want to update the content after checking crawl permissions:

```sh
npm run refresh
```

The script reads `LIVE_BASE_URL` and `ADMIN_REFRESH_TOKEN` from `.env.local`, sends the admin request, and replaces the active snapshot only after all seven sources pass. Refresh follows the allowlist and robots rules, uses a clear User-Agent, waits 1.1 seconds between requests, and rejects redirects. If it fails, the old snapshot stays in use. The endpoint has a five-minute cooldown. The process can take a while; the refresh route has `maxDuration=300` seconds, but actual time still depends on your Vercel plan/configuration.

Redeploying `data/knowledge.json` does not replace an existing `knowledge/active` row in Supabase. Do not delete the database to fix a snapshot. Refresh and code deploys are separate operations. Snapshot prices are not real-time quotes, and there is no automatic TTL for price age yet.

## 9. Troubleshooting

| Symptom | Concrete steps |
| --- | --- |
| Page loads, chat/health returns HTTP 503 | Check `SUPABASE_URL`, the secret key, Supabase project status, and whether `schema.sql` has been run; redeploy after fixing env vars. |
| SQL/RPC not found | Run the entire `supabase/schema.sql` in the same project as the URL/env. The last query asks PostgREST to reload the schema. |
| Secret key rejected | Use a key from the same project. `sb_publishable_...`/`anon` cannot access this server RPC. For modern secret keys, the code sends an `apikey` header rather than treating it as a JWT. |
| Supabase paused | Open the project dashboard, restore/resume it, then repeat the health check. The Free plan does not guarantee continuous uptime. |
| HTTP 401 on refresh | Set a random token of at least 24 characters on both the server and CLI. The values must match. |
| HTTP 409 on chat/refresh | Wait for the reply in progress or the refresh cooldown; retrying chat with the same requestId returns the stored result. |
| LLM `extractive-fallback` | Check the Groq key, model access, model ID, rate limits (429), timeout, and adapter parameters. Extractive answers may still work; this is not proof the LLM succeeded. |
| Review link asks for login | Use the production URL; check Vercel deployment protection, then test in incognito without a bypass token. |
| Build looks for Cloudflare/Vinext | Make sure the repo comes from this Vercel package, not the old ZIP. The build script must be `next build --webpack`. |

For at least seven days after submission, keep the project, database, env vars, and quotas available. Supabase Free can be paused for inactivity and Vercel Hobby has usage limits; check the dashboards and health results rather than assuming a free plan guarantees an SLA.

## 10. Code map and changes from the previous demo

| File | Responsibility |
| --- | --- |
| `app/page.tsx` | Chat UI, session cookie via same-origin requests, retry, sources, lead form. |
| `app/api/*/route.ts` | Next.js API backend on Vercel Functions. |
| `lib/server.ts` | Cookies, sessions, origin/admin guards, and rate limiting. Environment from `process.env`. |
| `lib/storage.ts` | Supabase PostgREST RPC over HTTPS with a server-only secret. |
| `supabase/schema.sql` | PostgreSQL tables, role access, and transactional backend operations. |
| `lib/conversation.ts` | State machine for treatment, country, intent, corrections, and clarification. |
| `lib/core.ts`, `lib/retrieval.ts` | Retrieval and evidence-bounded extractive answers. |
| `lib/model.ts` | Optional Groq adapter; selects evidence IDs only. |
| `lib/ingestion.ts`, `scripts/ingest.py` | Server refresh and CLI ingestion. Python is only needed if you run the CLI. |
| `data/knowledge.json` | Snapshot of the seven collected sources; not re-crawled on install/build. |

Main changes: Vinext/Worker → Next.js on Node.js; D1/SQLite → Supabase/PostgreSQL; Cloudflare bindings → server environment variables; OpenAI adapter → Groq (OpenAI-compatible). Answer commit, state update, and gap logging happen in a single PostgreSQL transaction. The session lock uses a token and lease, and request results are stored for retries. The browser never accesses the database directly.

## Official references

- Next.js on Vercel: https://vercel.com/docs/frameworks/full-stack/nextjs
- Vercel environment variables: https://vercel.com/docs/environment-variables
- Hobby limits: https://vercel.com/docs/plans/hobby
- Supabase pricing: https://supabase.com/pricing
- Supabase API keys: https://supabase.com/docs/guides/getting-started/api-keys
- Database functions: https://supabase.com/docs/guides/database/functions
- Groq console: https://console.groq.com
- Groq models and structured outputs: https://console.groq.com/docs/models

References and model availability may change. This package contains no real secrets or API keys.