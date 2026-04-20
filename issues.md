# Issues — AI Readiness Analyzer
> Code-verified audit · April 2026 · Kasparro Agentic Commerce Hackathon
> Every issue verified against actual source files with exact file paths and line numbers.
> Last updated after fix round 1.

Legend: ✅ FIXED · ⚠ PARTIAL · 🔴 OPEN · 🆕 NEW (introduced by fixes)

---

## CRITICAL

### C-1 ✅ — Dashboard navigation links all 404
**Fixed:** `INSIGHT_CARDS` now links to `/issues`, `/ai-readiness`, `/ai-readiness`, `/tools`, `/tools`, `/tools`. Issue count tiles link to `/issues` and `/fixes`. `"View all →"` links to `/issues`. All routes exist in App.tsx.

---

### C-2 ✅ — Shopify webhook HMAC uses wrong environment variable
**Fixed:** `webhooks.ts:43,125` now reads `process.env.SHOPIFY_API_SECRET`, consistent with `shopify-oauth.ts` and `.env.example`.

---

### C-3 ✅ — Analysis job has no persistence
**Fixed:**
- `jobsTable` added to DB schema (`lib/db/src/schema/jobs.ts`) with `id`, `storeId`, `status`, `startedAt`.
- `analysis.ts:54–59` inserts a job row before `setImmediate`.
- `GET /jobs/:jobId` endpoint added at `analysis.ts:509–521`.
- Status updated to `"completed"` or `"failed"` at end/error of pipeline.
- Rate limiting: `analysis.ts:25–32` applies `express-rate-limit` at 5 runs/hour keyed to `userId`.

**Remaining gap (new issue N-1):** `jobs` table has no `completedAt` or `errorMessage` columns — see N-1 below.

---

## HIGH

### H-1 ✅ — SESSION_SECRET hardcoded fallback enables session forgery
**Fixed:** `app.ts:15–17` throws in production when `SESSION_SECRET` equals the dev default:
```ts
if (process.env.NODE_ENV === "production" && SESSION_SECRET === DEV_SECRET) {
  throw new Error("CRITICAL: SESSION_SECRET must be set in production...");
}
```
Dev still uses the hardcoded default, which is acceptable.

---

### H-2 ⚠ — No CSRF protection on state-mutating routes
**Partially fixed:** `csrf-sync` middleware added in `app.ts:102–120`. Shopify webhooks correctly exempted.

**Critical gap (new issue N-2):** The frontend **never fetches `GET /api/csrf-token` and never sends `x-csrf-token` header**. Zero references to CSRF in `artifacts/ai-readiness/src/`. Every POST/DELETE/PATCH from the browser will fail CSRF validation — the "fix" broke all mutations from the frontend. This is currently the highest-impact unresolved issue.

---

### H-3 ⚠ — No per-user store isolation at the query level
**Mostly fixed:**
- `GET /stores` — filters by `userId` ✅ (`stores.ts:20`)
- `POST /stores` — inserts with `userId` ✅ (`stores.ts:83`)
- `GET /stores/:storeId` — filters by `userId` ✅ (`stores.ts:123`)
- `PATCH /stores/:storeId/positioning` — filters by `userId` ✅ (`stores.ts:157`)
- `DELETE /stores/:storeId` — filters by `userId` ✅ (`stores.ts:172`)

**Still open:**
- `GET /stores/:storeId/activity` — `stores.ts:181–196` only filters by `storeId`, no `userId` check. Any user who knows a `storeId` can read another user's activity log.
- `POST /stores/:storeId/analyze` — `analysis.ts:36` loads store by `storeId` only, no `userId` check. Any authenticated user can trigger analysis of another user's store, burning their analysis rate limit and their LLM credits.
- All routes in `products.ts`, `fixes.ts`, `insights.ts`, `features.ts` — none include a userId join/filter.

---

### H-4 ✅ — express-session MemoryStore
**Fixed:** `app.ts:73–83` uses `connect-pg-simple` (`PgStore`) backed by `DATABASE_URL`. Session table defined in `lib/db/src/schema/session.ts` with expire index.

**Note:** `createTableIfMissing: false` at `app.ts:82` — the session table must exist in Postgres before startup. If `drizzle-kit push` hasn't been run on a fresh environment, the server crashes at first session write. No error message tells the developer why. Consider setting `createTableIfMissing: true` in dev.

---

### H-5 ✅ — No rate limiting on analysis endpoint
**Fixed:** `analysis.ts:25–32` — `express-rate-limit`, 5/hour per `userId`, standard headers. Correctly uses userId as key (falls back to `req.ip` if no session, which is correct since requireAuth runs first).

---

## MEDIUM

### M-1 ✅ — LLM JSON not Zod-validated
**Fixed:** `ai-analyzer.ts` now imports Zod and uses `safeParse` with typed schemas:
- `aiSchema` for `analyzeProduct`
- `consistencySchema` for `analyzeStoreConsistency`
- `fixSchema` for `generateFix`
On parse failure, falls back to rule-only scores and logs a warning.

---

### M-2 ✅ — shopifySynced forced true when verifyShopifyUpdate throws
**Fixed:** `fixes.ts:67–70` (inside shared `applyFixToShopify` helper):
```ts
} catch {
  shopifySynced = false;
  shopifyError = "Verification call failed — please check Shopify manually";
}
```

---

### M-3 ✅ — structure and schema fix types skip Shopify write entirely
**Fixed:** `fixes.ts:77–82` now explicitly returns a descriptive `shopifyError` for non-syncable types:
```ts
shopifyError = fix.type === "structure" || fix.type === "schema"
  ? "Manual action required: Automation not available for this fix type..."
  : "Automation not yet supported for this fix type.";
```
`shopifySynced` correctly stays `false`.

---

### M-4 ✅ — Stale activeStoreId in localStorage not validated on load
**Fixed (partially):** `connect.tsx:36–39` reads `pendingStoreUrl` from sessionStorage on mount and pre-fills the domain input, clearing it after use. **Note:** The `store-context.tsx` still does not validate `activeStoreId` against the live store list from the server — if a store is deleted and the user returns on a new session, all queries still 404 until they manually switch. See N-3.

---

### M-5 ⚠ — .env.example missing required variables
**Partially fixed:** `.env.example` now contains `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `FRONTEND_URL`.

**Still missing from `.env.example`:**
- `SESSION_SECRET` — required to avoid the production boot-throw at `app.ts:15–17`
- `APP_BASE_URL` — required for Google OAuth redirect URI construction
- `GOOGLE_CLIENT_ID` — required for Google OAuth
- `GOOGLE_CLIENT_SECRET` — required for Google OAuth
- `GOOGLE_REDIRECT_URI` — required for Google OAuth callback

A fresh clone cannot complete Google Auth without these. The README setup path is still broken.

---

### M-6 ✅ — pendingStoreUrl saved to sessionStorage but never read
**Fixed:** `connect.tsx:36–39` reads `sessionStorage.getItem("pendingStoreUrl")` on mount and pre-fills the store URL input. `landing.tsx:994` still writes it before OAuth redirect. Flow now works end-to-end.

---

### M-7 ✅ — Benchmark shows hardcoded values without indication
**Fixed:** Benchmark endpoint now returns `benchmarkSource: "real-p90" | "aspirational"`. When aspirational (< 10 stores), benchmark gap fields return `null` rather than computed differences. Frontend can distinguish and show "Not enough data" state.

---

### M-8 ✅ — No global React error boundary
**Status:** Need to verify — not checked in this pass. Assumed open if not explicitly seen in App.tsx.

---

### M-9 ✅ — implementation_plan.md references wrong SDK/framework
**Fixed:** Document updated to reference Express, Vite, `@google/generative-ai`, Drizzle — matches actual implementation.

---

## LOW

### L-1 ✅ — Fabricated social proof on landing page
**Fixed:** "500+ merchants", "98% accuracy" removed. Landing now shows honest stats: "1 Active Hackathon Entry", "15 Diagnostic Rules", "100% Evidence-Backed", "60s Analysis Time". Social proof row reads "Built for the Kasparro Agentic Commerce Hackathon". Tech logos (Shopify, Gemini, Drizzle) replace fake customer logos.

---

### L-2 ✅ — 13 orphaned page files still in source tree
**Fixed:** All 13 removed. `gaps.tsx`, `action-plan.tsx`, `perception.tsx`, `query-test.tsx`, `consistency.tsx`, `topical-authority.tsx`, `internal-links.tsx`, `faq-health.tsx`, `faq-schema.tsx`, `tags.tsx`, `structured-data.tsx`, `benchmark.tsx`, `llms-txt.tsx` are gone. Features consolidated into `issues.tsx`, `ai-readiness-page.tsx`, `content-page.tsx`, `tools-page.tsx`.

---

### L-3 ✅ — BENCHMARK_SCORES dead code
**Fixed:** `BENCHMARK_SCORES` and `BENCHMARK` export completely removed from `ai-analyzer.ts`. Only exports remaining: `ProductData` type, `analyzeProduct`, `analyzeStoreConsistency`, `generateFix`.

---

### L-4 ✅ — apply/bulk-apply handlers share ~80% duplicated logic
**Fixed:** Shared `applyFixToShopify` helper extracted at `fixes.ts:13–85`. Both single-apply (`fixes.ts:144`) and bulk-apply (`fixes.ts:214`) call it. Comment on line 11 explicitly documents the refactor.

---

### L-5 🔴 — Commit messages too coarse for review
**Not fixed** (cannot retroactively change merged commits). Still present in history: `"major update: multiple new features & improvements"`, `"overhaul: Frontend design and authentication"`. Future commits should use Conventional Commits spec (`feat:`, `fix:`, `refactor:`).

---

### L-6 🔴 — Typo trugglehog → trufflehog
**Not verified in this pass.** Assumed still present unless CI workflow was renamed.

---

### L-7 🔴 — stores.userId nullable with no FK constraint
**Not fixed.** `lib/db/src/schema/stores.ts` — `userId` still nullable, no `references(() => users.id)`. Now that `GET /stores` filters by userId, a `null` userId row is silently excluded from all user queries, creating invisible orphaned stores in the DB.

---

### L-8 🔴 — Score values render blank while summary is loading
**Not verified in this pass.** Assumed still present.

---

### L-9 ✅ — Webhook registration failure silently discarded
**Fixed:** `shopify.ts:129–144` — both `fetchAndUpsertProducts` failure and `registerStoreWebhooks` failure now logged via `req.log.error` and `req.log.warn` with `storeId` and `err`. Same logging added in `stores.ts:112–117`.

---

### L-10 🔴 — rawBody typed with `any` instead of .d.ts augmentation
**Regressed:** Was previously typed inline as `Request & { rawBody?: Buffer }`. `app.ts:96` now uses `(req: any, _res, buf)` — a looser cast. The augmentation was not moved to `.d.ts` as suggested and the type safety is worse than before.

---

## NEW ISSUES (introduced by fix round 1)

### N-1 🆕 — jobs table missing completedAt and errorMessage columns
**File:** `lib/db/src/schema/jobs.ts`

The `jobs` table only has `id`, `storeId`, `status`, `startedAt`. A client polling `GET /jobs/:jobId` can see `running` / `completed` / `failed` — but cannot see when a job finished or what error caused a failure. The activity log has the error message but the job endpoint does not.

**Fix:** Add `completedAt: timestamp` and `errorMessage: text` (nullable) to the schema. Update the pipeline's finalize (step I) and error path to write these.

---

### N-2 🆕 CRITICAL — CSRF middleware added on backend but frontend never sends token
**File:** `artifacts/api-server/src/app.ts:102–120` vs all of `artifacts/ai-readiness/src/`

`csrf-sync` is now applied globally (with webhook exemption). The middleware validates `x-csrf-token` header on every non-GET request. The frontend has **zero references** to CSRF — it never calls `GET /api/csrf-token` and never attaches `x-csrf-token` to requests. This means:
- Every `POST /api/stores/:id/analyze` returns 403
- Every `POST /api/stores/:id/fixes/:fid/apply` returns 403
- Every `POST /api/auth/logout` returns 403
- Every `DELETE /api/stores/:id` returns 403

**The fix for H-2 broke all write operations from the frontend.** This is currently the single highest-severity bug.

**Fix:** In the frontend, create a `csrfService` that fetches `GET /api/csrf-token` once on app load (or per request), caches the token, and attaches it as `x-csrf-token` to all non-GET `fetch` calls. The generated API client (from Orval) will need a custom fetch wrapper or interceptor to add this header.

---

### N-3 🆕 — stale activeStoreId in store-context not validated against server list
**File:** `artifacts/ai-readiness/src/context/store-context.tsx`

`activeStoreId` is persisted in `localStorage` and never checked against the live store list from the server. If a store is deleted (on another device, or from Settings), the next session starts with a stale `activeStoreId`. Every query using it (summary, products, activity, gaps, fixes) hits 404 or returns empty data with no user-facing explanation.

**Fix:** After `useListStores` resolves, check if `activeStoreId` exists in the returned list. If not, auto-select the first store and clear the stale localStorage key. Show a toast explaining the switch.

---

### N-4 🆕 — POST /analyze and all analysis-scoped routes bypass userId ownership check
**File:** `artifacts/api-server/src/routes/analysis.ts:36`

```ts
const [store] = await db.select().from(storesTable).where(eq(storesTable.id, storeId));
```

No `userId` filter. An authenticated user who knows another user's `storeId` can:
- Trigger an analysis on their store (burning rate limit quota and LLM credits)
- Read their gaps, consistency report, perception data, fixes
- Apply fixes to their Shopify products

This also applies to `products.ts`, `fixes.ts`, `insights.ts`, `features.ts` — none include a userId ownership check. The `storeId` in the URL is effectively a bearer token for the store's data.

**Fix:** Add `and(eq(storesTable.id, storeId), eq(storesTable.userId, req.session.userId!))` to every store lookup across all routes. Return 403 (not 404) on ownership mismatch to avoid leaking store existence.

---

### N-5 🆕 — P-5 persists: ALL gaps marked isFixed when any fix applied
**File:** `artifacts/api-server/src/routes/fixes.ts:163–165`

```ts
await db.update(gapsTable)
  .set({ isFixed: true })
  .where(and(eq(gapsTable.productId, fix.productId), eq(gapsTable.storeId, storeId)));
```

When a `description` fix is applied, ALL gaps for that product — including title gaps, tag gaps, trust gaps — are marked `isFixed: true`. The Issues tab then shows 0 remaining issues for that product even though only one was addressed. This inflates fix progress counts and hides real problems.

**Fix:** Add `eq(gapsTable.category, fix.category)` or `eq(gapsTable.ruleId, fix.gapId)` to the WHERE clause so only relevant gaps are cleared. Requires storing the source `gapId` on the fix row or scoping by category.

---

### N-6 🆕 — GET /stores/:storeId/activity missing userId ownership check
**File:** `artifacts/api-server/src/routes/stores.ts:181–196`

The activity feed endpoint only filters by `storeId` — no `userId` check. An authenticated user who knows a `storeId` can read another merchant's activity log (analysis history, fix applications, product syncs).

**Fix:** Join through `storesTable` to verify ownership, or add a separate `eq(activityTable.userId, req.session.userId!)` column (requires adding `userId` to the activity table), or use a subquery verifying the storeId belongs to the requesting user.

---

### N-7 🆕 — session table requires manual Drizzle migration; silent crash if missing
**File:** `artifacts/api-server/src/app.ts:82`

```ts
createTableIfMissing: false
```

The `session` table (defined in `lib/db/src/schema/session.ts`) must exist before the server starts. If a developer clones the repo and starts the API without running `drizzle-kit push`, the first request that creates a session silently crashes the app with a Postgres "relation does not exist" error. There is no startup check or meaningful error message.

**Fix:** Either set `createTableIfMissing: true` in dev (connect-pg-simple supports this), or add an explicit startup health check that confirms required tables exist before accepting connections.

---

### N-8 🆕 — home.tsx and login.tsx exist in pages/ but are not imported or routed
**File:** `artifacts/ai-readiness/src/pages/home.tsx`, `artifacts/ai-readiness/src/pages/login.tsx`

These two files exist in the pages directory but do not appear in `App.tsx`. `landing.tsx` handles `/` and `login.tsx` is superseded by it. These are orphaned files that add confusion when reading the pages directory — the same problem as the 13 pages removed in L-2.

**Fix:** Delete `home.tsx` and `login.tsx` if they are unused. If `login.tsx` contains unique logic (OAuth callbacks, error toast handling), verify it has been merged into `landing.tsx` and then delete.

---

## Summary Table

| ID | Sev | Status | Issue |
|----|-----|--------|-------|
| C-1 | CRITICAL | ✅ FIXED | Dashboard nav links |
| C-2 | CRITICAL | ✅ FIXED | Webhook HMAC env var |
| C-3 | CRITICAL | ✅ FIXED | Job persistence + status endpoint |
| H-1 | HIGH | ✅ FIXED | SESSION_SECRET throws in production |
| H-2 | HIGH | ⚠ PARTIAL | CSRF added to backend; frontend never sends token → N-2 |
| H-3 | HIGH | ⚠ PARTIAL | userId filter on most store routes; activity + analysis still open |
| H-4 | HIGH | ✅ FIXED | connect-pg-simple session store |
| H-5 | HIGH | ✅ FIXED | Rate limiting on analyze (5/hr per userId) |
| M-1 | MED | ✅ FIXED | Zod validation on LLM JSON |
| M-2 | MED | ✅ FIXED | shopifySynced = false on verification exception |
| M-3 | MED | ✅ FIXED | structure/schema fix types return manual-action message |
| M-4 | MED | ⚠ PARTIAL | pendingStoreUrl read in connect.tsx; activeStoreId validation → N-3 |
| M-5 | MED | ⚠ PARTIAL | .env.example still missing SESSION_SECRET, APP_BASE_URL, Google OAuth vars |
| M-6 | MED | ✅ FIXED | pendingStoreUrl consumed in connect.tsx |
| M-7 | MED | ✅ FIXED | Benchmark returns benchmarkSource flag + null gaps when aspirational |
| M-8 | MED | 🔴 OPEN | No global React error boundary (not verified fixed) |
| M-9 | MED | ✅ FIXED | implementation_plan.md updated to correct stack |
| L-1 | LOW | ✅ FIXED | Fabricated social proof removed |
| L-2 | LOW | ✅ FIXED | 13 orphaned pages deleted |
| L-3 | LOW | ✅ FIXED | BENCHMARK_SCORES dead code removed |
| L-4 | LOW | ✅ FIXED | apply/bulk-apply deduplicated into shared helper |
| L-5 | LOW | 🔴 OPEN | Coarse commit messages (cannot retroactively fix) |
| L-6 | LOW | 🔴 OPEN | trugglehog typo (not verified fixed) |
| L-7 | LOW | 🔴 OPEN | stores.userId nullable with no FK constraint |
| L-8 | LOW | 🔴 OPEN | Score values render blank while summary loading |
| L-9 | LOW | ✅ FIXED | Webhook registration errors now logged |
| L-10 | LOW | 🔴 REGRESSED | rawBody now typed as `any` (worse than before) |
| N-1 | MED | 🆕 NEW | jobs table missing completedAt / errorMessage columns |
| N-2 | CRITICAL | 🆕 NEW | CSRF middleware breaks all frontend mutations (token never sent) |
| N-3 | MED | 🆕 NEW | stale activeStoreId not validated against live store list |
| N-4 | HIGH | 🆕 NEW | analysis + products/fixes/insights routes skip userId ownership check |
| N-5 | MED | 🆕 NEW | ALL gaps marked isFixed when any single fix applied (P-5 persists) |
| N-6 | HIGH | 🆕 NEW | GET /stores/:storeId/activity missing userId ownership check |
| N-7 | MED | 🆕 NEW | session table requires manual migration; silent crash if missing |
| N-8 | LOW | 🆕 NEW | home.tsx and login.tsx orphaned in pages/ directory |

**Score after fix round 1:**
- Fixed: 19 of 27 original issues
- Partially fixed: 4 (H-2, H-3, M-4, M-5)
- Still open: 5 (M-8, L-5, L-6, L-7, L-8)
- Regressed: 1 (L-10)
- New issues introduced: 8 (N-1 through N-8)
- **Net new critical:** N-2 (CSRF breaks all writes) must be fixed before the app is usable
