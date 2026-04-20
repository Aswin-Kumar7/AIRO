# Issues — AI Readiness Analyzer
> Code-verified audit · April 2026 · Kasparro Agentic Commerce Hackathon
> Every issue below was confirmed against actual source files — file paths and line numbers included.

Severity: **CRITICAL** (breaks core flow on first use) · **HIGH** (security / data risk) · **MEDIUM** (correctness, silent failures, UX) · **LOW** (polish, hygiene, maintainability)

---

## CRITICAL

### C-1 — Dashboard navigation links all 404
**File:** `artifacts/ai-readiness/src/pages/dashboard.tsx:193–242, 463–471`
**Verified:** App.tsx has 9 routes — none of the following exist.

`INSIGHT_CARDS` (the six feature cards at the bottom of the dashboard) links to:
- `/gaps` → 404
- `/perception` → 404
- `/faq-health` → 404
- `/structured-data` → 404
- `/tags` → 404
- `/benchmark` → 404

The issue severity count tiles (Critical / Medium / Low) at lines 469–471 also link to `/gaps` → 404. The "View all →" link at line 463 goes to `/gaps` → 404.

**Every single primary CTA on the main page breaks.** A judge who clicks any of these hits NotFound.

**Fix:** Remap in `INSIGHT_CARDS` and the count tiles:
- `/gaps` → `/issues`
- `/perception`, `/faq-health` → `/ai-readiness`
- `/structured-data`, `/tags`, `/benchmark` → `/tools`

---

### C-2 — Shopify webhook HMAC uses the wrong environment variable
**File:** `artifacts/api-server/src/routes/webhooks.ts:43, 125`

Both webhook handlers read:
```ts
const secret = process.env.SHOPIFY_CLIENT_SECRET ?? "";
```

The OAuth installer (`shopify-oauth.ts:19`) and the Shopify Partners dashboard call the same value `SHOPIFY_API_SECRET`. With this mismatch, `SHOPIFY_CLIENT_SECRET` is `undefined` in any standard setup, so `secret = ""`, the HMAC check always fails, and every Shopify product-update/delete webhook returns `401`. Real-time catalog sync is silently dead.

**Fix:** Change both webhook handlers to read `process.env.SHOPIFY_API_SECRET`. Update `.env.example`.

---

### C-3 — Analysis job has no persistence — server restart silently drops in-progress runs
**File:** `artifacts/api-server/src/routes/analysis.ts`

`POST /api/analysis/:storeId` kicks the 30–60s pipeline with `setImmediate` and immediately returns a `jobId`. The `jobId` is never written to the database. If the server restarts mid-analysis:
- The run is lost with no error
- The store stays in `status: "analyzing"` forever
- The client polls indefinitely with no recovery path

**Fix (minimum):** Insert a `jobs` row (id, storeId, status, startedAt) before `setImmediate`. Update to `failed` in the top-level catch. Expose status via a `GET /api/jobs/:jobId` endpoint so the client can detect stalls.

---

## HIGH

### H-1 — Hardcoded SESSION_SECRET fallback enables session forgery in production
**File:** `artifacts/api-server/src/app.ts:9`

```ts
const SESSION_SECRET = process.env.SESSION_SECRET ?? "dev-session-secret-change-in-production";
```

If `SESSION_SECRET` is omitted from the production environment (easy to miss with the current incomplete `.env.example`), the app boots silently using a publicly known default. Any attacker can forge a valid session cookie and impersonate any user.

**Fix:** In production (`NODE_ENV === "production"`), throw and refuse to boot when `SESSION_SECRET` is missing or equals the dev default string.

---

### H-2 — No CSRF protection on state-mutating routes
**File:** `artifacts/api-server/src/app.ts` (no CSRF middleware anywhere)

Session auth uses cookies with `sameSite: "none"` in production (required for Shopify embeds). This means any cross-origin request automatically carries the session cookie. There is no CSRF token or double-submit cookie pattern. A malicious page can silently trigger:
- `POST /api/stores/:id/fixes/:fid/apply` → apply a fix the merchant didn't approve
- `DELETE /api/stores/:id` → delete a store
- `POST /api/analysis/:id` → burn LLM credits

**Fix:** Add `csrf-csrf` or equivalent middleware for all non-GET routes. Exempt Shopify webhook routes (they use HMAC, not session auth).

---

### H-3 — No per-user store isolation at the query level
**File:** `artifacts/api-server/src/routes/stores.ts:17–34`

```ts
const stores = await db.select().from(storesTable).orderBy(desc(storesTable.createdAt));
```

No `where(eq(storesTable.userId, req.session.userId!))` filter. Every authenticated user sees every store in the database. With two distinct users in production, user A can read, analyze, and apply fixes to user B's Shopify store. `stores.userId` column exists in the schema but is never used in queries.

**Fix:** Add the userId filter to every store-scoped query in `stores.ts`, `products.ts`, `analysis.ts`, and `fixes.ts`. Make `userId` non-nullable in the schema.

---

### H-4 — express-session MemoryStore — not safe for production
**File:** `artifacts/api-server/src/app.ts:64–75`

No `store:` option is passed to `session()`. Express defaults to `MemoryStore`, which:
- Loses all sessions on every server restart (users logged out)
- Cannot scale horizontally (two instances = split-brain sessions)
- Leaks memory indefinitely under load (Express warns about this explicitly)

**Fix:** Add `connect-pg-simple` and point it at the existing Postgres instance. No new infrastructure needed.

---

### H-5 — No rate limiting on the analysis endpoint
**File:** `artifacts/api-server/src/routes/analysis.ts`

`POST /api/analysis/:storeId` triggers a 30–60s multi-LLM pipeline. No per-user or per-store rate limit exists. An authenticated user (or a stolen session) can queue unlimited runs, burning Gemini/Groq/Cerebras API credits with no cap. Even accidental double-clicks can cause concurrent analyses of the same store.

**Fix:** Add `express-rate-limit` scoped to `req.session.userId` on this route. 5 runs/hour per user is a reasonable starting limit.

---

## MEDIUM

### M-1 — LLM response parsed without Zod — manual field checks only
**File:** `artifacts/api-server/src/lib/ai-analyzer.ts:80–94`

The AI response is parsed with `JSON.parse` and then manually checked field-by-field:
```ts
if (typeof parsed.clarityScore === "number") aiClarityScore = ...
if (typeof parsed.aiPerceptionSummary === "string") ...
if (Array.isArray(parsed.suggestedTags)) ...
```

This catches the top-level types but misses: range validation (clarityScore could be 9999), string content (empty string passes), array item types (non-string tags corrupt the tag array). The rest of the stack uses Zod end-to-end; this is an inconsistent gap.

**Fix:** Define a `z.object({ clarityScore: z.number().min(0).max(100), aiPerceptionSummary: z.string().min(1), suggestedTags: z.array(z.string()).max(8) })` schema and use `.safeParse()`. On failure, log and fall back to rule-only scores.

---

### M-2 — shopifySynced forced `true` when verification call throws
**File:** `artifacts/api-server/src/routes/fixes.ts:106–108`

```ts
} catch {
  shopifySynced = true; // Trust mutation if verification call errors
}
```

When `verifyShopifyUpdate` throws (Shopify timeout, 5xx, network blip), the code assumes the write landed and marks `shopifySynced = true`. The merchant sees a green "synced" badge in the UI but Shopify may have never received the update. This is a silent false-positive.

**Fix:** On verification exception, set `shopifySynced = false` and set `shopifyError = "Verification call failed — please check Shopify manually"`. The activity log message at line 144 already handles this case correctly — just wire it through.

---

### M-3 — Fix types `structure` and `schema` skip the Shopify write entirely
**File:** `artifacts/api-server/src/routes/fixes.ts:65`

```ts
if (fix.productId && fix.type !== "structure") {
```

`structure` fixes are excluded from `updateShopifyProduct`. Inside the block, only `description`, `tags`, and `title` are handled — `schema` type fixes also fall through without a Shopify write. Both are marked `applied` and `shopifySynced` may end up truthy via the bulk-apply path, meaning the merchant believes the fix was pushed when Shopify was never touched.

**Fix:** Either implement the Shopify write for these types (metafield update for JSON-LD), or set `shopifySynced = false` and surface a "Manual action required" label in the UI for these fix types.

---

### M-4 — Stale `activeStoreId` in localStorage not validated on load
**File:** `artifacts/ai-readiness/src/context/store-context.tsx`

`activeStoreId` is persisted in `localStorage`. If the store is deleted (from another device, by `DELETE /api/stores/:id`, or from the Settings page), every API call on the next session 404s silently. No recovery flow exists — the user sees blank data or errors until they manually change stores.

**Fix:** After the store list loads, check if `activeStoreId` is still present in the list. If not, auto-select the first available store and clear the stale localStorage key. Show a toast: "Your previously active store was removed."

---

### M-5 — `.env.example` is missing five required variables
**File:** root `.env.example` (if it exists)

Variables documented in `current_status.md` but absent from the `.env.example` that a new developer reads on clone:
- `SESSION_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `APP_BASE_URL`

A fresh clone cannot complete Google OAuth without these. The README setup path is broken.

**Fix:** Add all required variables to `.env.example` with placeholder values and a one-line comment per variable. Treat `current_status.md`'s env table as the source of truth.

---

### M-6 — `pendingStoreUrl` written to sessionStorage but never read back
**File:** `artifacts/ai-readiness/src/pages/landing.tsx` (ConnectModal)

When the user types their store URL and clicks "Continue with Google", the URL is saved:
```ts
sessionStorage.setItem("pendingStoreUrl", storeUrl);
```
After OAuth completes and the user lands on the dashboard, nothing reads this value. The onboarding modal opens with a blank input. The user must retype the store URL they already entered.

**Fix:** In the OnboardingModal or ConnectStore page, read `sessionStorage.getItem("pendingStoreUrl")` on mount, pre-fill the domain input, and clear the key after use.

---

### M-7 — Benchmark silently falls back to hardcoded values on demos with < 10 stores
**File:** `artifacts/api-server/src/lib/ai-analyzer.ts:39–49`, `artifacts/api-server/src/routes/analysis.ts`

`BENCHMARK_SCORES` (hardcoded: overall 85, clarity 88, trust 82…) is the silent fallback when fewer than 10 stores exist in the DB. In any fresh demo or hackathon review environment, this is the default. The "Benchmark vs AI-ready stores" panel shows fabricated numbers without any indicator.

**Fix:** When `count < MIN_SAMPLE`, return `null` for benchmark scores and render a "Not enough data yet (need 10+ stores)" empty state in the Tools → Benchmark tab instead of silent hardcoded values.

---

### M-8 — No global React error boundary — crashes show blank screen
**File:** `artifacts/ai-readiness/src/App.tsx`

No `<ErrorBoundary>` wraps the router or any route. A render throw (e.g. a chart receives `NaN` from corrupted scores, see M-1) unmounts the entire app with a blank white screen and no recovery path.

**Fix:** Wrap `<Router>` in a top-level `ErrorBoundary` that renders a friendly "Something went wrong" UI with a reload button.

---

### M-9 — `implementation_plan.md` references the wrong SDK and framework
**File:** `implementation_plan.md`

The plan references `@google/genai` (new Google AI SDK) but the codebase uses `@google/generative-ai` (legacy SDK). The plan also assumes Next.js; the actual implementation is Express + Vite SPA. Any reviewer trying to follow the design intent using this document will be misled.

**Fix:** Update to match the actual stack, or replace with a real architecture document that reflects what was built.

---

## LOW

### L-1 — Fabricated social proof on the landing page
**File:** `artifacts/ai-readiness/src/pages/landing.tsx`

The landing page states "Trusted by 500+ Shopify merchants worldwide" and "98% Report accuracy" and shows hardcoded brand logos as customers. This is a hackathon submission with zero real merchants. A judge will recognize this immediately and it damages credibility for the other 90% that is genuine.

**Fix:** Remove or replace with honest framing: "Built for the Kasparro Agentic Commerce Hackathon · April 2026". Remove fabricated logos and stats.

---

### L-2 — 13 orphaned page files remain in the source tree
**Files:** `artifacts/ai-readiness/src/pages/` —
`gaps.tsx`, `action-plan.tsx`, `perception.tsx`, `query-test.tsx`, `consistency.tsx`, `topical-authority.tsx`, `internal-links.tsx`, `faq-health.tsx`, `faq-schema.tsx`, `tags.tsx`, `structured-data.tsx`, `benchmark.tsx`, `llms-txt.tsx`

None are imported or routed. They inflate apparent codebase size and confuse any reviewer reading the pages directory.

**Fix:** Delete all 13 files. Already acknowledged in `current_status.md` under Technical Debt.

---

### L-3 — `BENCHMARK_SCORES` / `BENCHMARK` constant is dead code
**File:** `artifacts/api-server/src/lib/ai-analyzer.ts:39–49`

```ts
const BENCHMARK_SCORES = { clarity: 88, completeness: 85, ... };
export const BENCHMARK = BENCHMARK_SCORES;
```

Exported but never imported anywhere. The live benchmark path uses P90 computed in `analysis.ts`. This misleads a reader into thinking scores are always static when in fact the live code computes them dynamically when enough data exists.

**Fix:** Delete the constant and the export.

---

### L-4 — `apply` and `bulk-apply` handlers share ~80% duplicated logic
**File:** `artifacts/api-server/src/routes/fixes.ts`

`POST /stores/:storeId/fixes/:fixId/apply` (line 39) and `POST /stores/:storeId/fixes/bulk-apply` (line 158) implement the same Shopify write + verify + DB update logic independently. A bug fixed in one (see M-2) must be manually replicated in the other.

**Fix:** Extract `applyOneFix(store, fix, contentToApply): Promise<{ shopifySynced, shopifyError }>` and call it from both handlers.

---

### L-5 — Commit messages are too coarse to review
**Git history**

```
"major update: multiple new features & improvements"
"overhaul: Frontend design and authentication"
```

These are not reviewable. A judge evaluating git history as an engineering-maturity signal will flag this. The rubric explicitly says "clean git commit history with meaningful commits."

**Fix (for future commits):** One feature or fix per commit. Use `feat:`, `fix:`, `refactor:` prefixes per Conventional Commits spec. Each message should identify what changed and in which module.

---

### L-6 — Typo in CI workflow name: `trugglehog` → `trufflehog`
**File:** `.github/workflows/` (secret scanning workflow)

The correct tool name is `trufflehog`. Visible in CI tab to any reviewer who reads the workflow config.

**Fix:** Rename the workflow file and step label.

---

### L-7 — `stores.userId` is nullable with no foreign key constraint
**File:** `lib/db/src/schema/stores.ts`

`userId` is nullable ("for legacy stores pre-auth") and has no `references(() => users.id)` FK. Orphaned store rows (user deleted, stores remain) are possible with no DB-level cleanup. This also complicates implementing H-3 correctly since any `userId = null` row must be handled as a special case.

**Fix:** Make `userId` non-nullable. Add `references(() => users.id, { onDelete: "cascade" })`. Backfill existing rows before migrating.

---

### L-8 — Score values render as blank/undefined while summary is loading
**File:** `artifacts/ai-readiness/src/pages/dashboard.tsx:366–379`

While `summaryLoading` is true, `summary` is `undefined`. Score tiles (`summary.criticalIssues`, `summary.pendingFixes`, `summary.overallScore`) render as blank rather than a skeleton. Visible on every page load before the first query resolves.

**Fix:** Guard with `?? 0` or render `<Skeleton>` components while `summaryLoading` is true.

---

### L-9 — Webhook registration failure is silently discarded
**File:** `artifacts/api-server/src/routes/shopify.ts:128–137`

```ts
try {
  await registerStoreWebhooks(store.domain, store.accessToken, appBaseUrl);
} catch {
  // non-critical — webhooks are best-effort
}
```

No log line, no UI indicator. A store can appear fully connected while having no active webhooks registered. Product changes in Shopify will never sync until the user re-analyzes manually, with no explanation why.

**Fix:** Log at `warn` level with `storeId` and `err.message`. Optionally surface a warning badge on the store card in the dashboard when webhook registration is unconfirmed.

---

### L-10 — `rawBody` typed with inline cast instead of `.d.ts` augmentation
**File:** `artifacts/api-server/src/app.ts:77`, `src/routes/webhooks.ts:35`

```ts
req: import("express").Request & { rawBody?: Buffer }    // app.ts
(req as unknown as { rawBody?: Buffer }).rawBody          // webhooks.ts
```

Two different patterns for the same property. The session type augmentation was correctly moved to `src/types/session.d.ts`; `rawBody` should follow the same pattern for consistency and type safety.

**Fix:** Add `rawBody?: Buffer` to the `Request` interface augmentation in `src/types/session.d.ts` (or a dedicated `src/types/express.d.ts`).

---

## Summary Table

| ID | Sev | File(s) | Issue |
|----|-----|---------|-------|
| C-1 | CRITICAL | `dashboard.tsx:193–242, 463–471` | All 6 insight cards + 3 count tiles link to non-existent routes |
| C-2 | CRITICAL | `webhooks.ts:43,125` | HMAC reads `SHOPIFY_CLIENT_SECRET`, OAuth uses `SHOPIFY_API_SECRET` |
| C-3 | CRITICAL | `routes/analysis.ts` | jobId never persisted — server restart silently drops analysis |
| H-1 | HIGH | `app.ts:9` | SESSION_SECRET hardcoded fallback enables session forgery |
| H-2 | HIGH | `app.ts` | No CSRF protection on state-mutating routes |
| H-3 | HIGH | `routes/stores.ts:19` | No userId filter — any user sees all stores |
| H-4 | HIGH | `app.ts:64–75` | MemoryStore sessions — data lost on restart, no horizontal scale |
| H-5 | HIGH | `routes/analysis.ts` | No rate limiting — unlimited LLM pipeline triggers |
| M-1 | MED | `ai-analyzer.ts:80–94` | LLM JSON has manual type checks only, not Zod — range/content not validated |
| M-2 | MED | `fixes.ts:107` | Verification exception → `shopifySynced = true` (false positive) |
| M-3 | MED | `fixes.ts:65` | `structure` and `schema` fix types skip Shopify write entirely |
| M-4 | MED | `store-context.tsx` | Stale `activeStoreId` in localStorage not validated after store deletion |
| M-5 | MED | `.env.example` | 5 required env vars missing from setup file |
| M-6 | MED | `landing.tsx` | `pendingStoreUrl` written to sessionStorage but never read back |
| M-7 | MED | `ai-analyzer.ts:39–49` | Benchmark silently shows hardcoded values when < 10 stores in DB |
| M-8 | MED | `App.tsx` | No global React error boundary — crash = blank white screen |
| M-9 | MED | `implementation_plan.md` | References wrong SDK (`@google/genai`) and wrong framework (Next.js) |
| L-1 | LOW | `landing.tsx` | Fabricated "500+ merchants" / "98% accuracy" social proof |
| L-2 | LOW | `src/pages/` | 13 unrouted orphan page files still in source tree |
| L-3 | LOW | `ai-analyzer.ts:39–49` | `BENCHMARK_SCORES` / `BENCHMARK` export is dead code |
| L-4 | LOW | `fixes.ts` | apply + bulk-apply share ~80% duplicated logic |
| L-5 | LOW | git history | Coarse commit messages don't satisfy rubric's "clean git history" criterion |
| L-6 | LOW | `.github/workflows/` | Typo: `trugglehog` → `trufflehog` |
| L-7 | LOW | `schema/stores.ts` | `userId` nullable with no FK constraint |
| L-8 | LOW | `dashboard.tsx:366–379` | Scores render blank/undefined while summary is loading |
| L-9 | LOW | `routes/shopify.ts:128–137` | Webhook registration failure silently discarded, no log/UI indicator |
| L-10 | LOW | `app.ts:77`, `webhooks.ts:35` | `rawBody` typed via inline cast instead of `.d.ts` augmentation |

**Total: 3 Critical · 5 High · 9 Medium · 10 Low = 27 verified issues**
