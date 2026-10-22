# Verification — 22 October 2026

This is the standalone Next.js + Supabase adaptation. The existing Sites/Cloudflare deployment was not changed.

| Check | Result |
| --- | --- |
| `npm test` | 52/52 passed: 49 original engine/ingestion/model-contract tests plus 3 RPC/PostgreSQL tests. |
| `npm run build` | Passed using Next.js 16.3.4 with webpack. Six API route groups compiled as dynamic server routes. |
| `npm run typecheck` | Passed. |
| `npm run test:submission` without hosted target | 8/8 passed on the source snapshot. |
| `npm run test:api` | Passed against a real local Next.js production server, backed by PGlite PostgreSQL through a test-only HTTP bridge. |
| Eight assessment questions over local HTTP | 8/8 passed; complete responses in `live-test-results.md` / `.json`. The target is a temporary localhost server, not a hosted public deployment. |
| Real OpenAI provider invocation | Not performed; no real API key was supplied. Model contract tests use fake responses. |
| Vercel + Supabase hosted account deployment | Not performed. User will deploy manually; account credentials and hosted gateway/auth remain unverified. |
| Browser visual/accessibility review | Not performed. UI is retained from the original implementation; HTTP/title/build checks passed. |

API integration checks cover health, homepage title, source metadata, correct price/context, retry idempotency, country follow-up, persisted history, session isolation, cross-origin rejection, invalid input, admin authorization, lead consent/storage, gap logs and reset.

PostgreSQL tests execute the SQL migration and verify role permissions, schema reapplication, one-owner lease acquisition, fencing tokens, atomic answer/state/gap commit, duplicate-key rollback, reset invalidation, rate limits, refresh cooldown and active snapshot reads. PGlite uses one local connection and does not establish behavior under hosted multi-connection load.

No source refresh was run as part of this adaptation. No audience, credentials, existing project or public deployment was changed. No messages or contact details were sent to PlacidWay or any other party.
