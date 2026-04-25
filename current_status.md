# Current Status — AI Readiness Analyzer
> Last updated after fix round 4 · April 2026 · Code-verified

---

## Requirement Check

### Track 5 Core Criteria

| Requirement | Status | How it's satisfied |
|---|---|---|
| Identifies gaps in merchant's AI readiness | ✅ Done | Rule engine (25 deterministic rules) + AI layer → gaps stored in DB with evidence, impact score, effort level, severity |
| Missing FAQ coverage | ✅ Done | `perception-simulator.ts` checks FAQ page for 9 standard topics and surfaces unanswered ones in Issues → All Issues |
| Ambiguous policies | ✅ Done | Policy gaps detected during store analysis, shown in Issues and Action Plan; policy quality validated by keyword + word count (≥50 words) |
| Weak trust signals | ✅ Done | Rules: TRUST_NO_IMAGE, TRUST_NO_BRAND, TRUST_NO_SCHEMA, TRUST_NO_REVIEWS, SCHEMA_INCOMPLETE, SCHEMA_MALFORMED |
| Unclear product information | ✅ Done | Rules: DESC_MISSING, DESC_TOO_SHORT, DESC_NO_MATERIAL, DESC_NO_DIMENSIONS, DESC_NO_USE_CASE, COMPARE_INSUFFICIENT_SPECS |
| Prioritized improvements — ranked action plan | ✅ Done | Issues → Action Plan tab — `conversion-ranker.ts` scores each gap by conversion impact |
| Shows how AI agents currently perceive the store | ✅ Done | AI Readiness → AI Perception tab — agent narrative, strengths, unanswered questions, ambiguities |
| Gap between perception vs. desired positioning | ✅ Done | Merchant sets desired positioning in AI Readiness → AI Perception; compared against AI-generated narrative |
| Helps merchants take concrete action | ✅ Done | Quick Fix sheet generates + applies; FAQ schema, JSON-LD, llms.txt are immediately deployable |
| Demonstrates genuine product thinking | ✅ Done | Rule engine with evidence-backed violations; "Can AI answer this?" test; query simulation tests real recommendation scenarios |

---

## Full Feature Inventory

### Authentication & Multi-tenancy
- **Google OAuth 2.0** — native implementation (no passport), session-based with `express-session`
- **Login page** (`/`) — Google sign-in gate, auto-redirects to `/dashboard` if already authenticated
- **Session cookies** — `httpOnly`, `secure` in production, `sameSite: none` in production / `lax` in dev
- **Auth middleware** — `requireAuth` guards all routes except `/api/auth/*`, `/api/health`, Shopify install/callback/webhooks, `/api/csrf-token`
- **Users table** — DB stores `googleId`, `email`, `name`, `avatarUrl`; stores linked via non-nullable `userId` FK
- **Onboarding modal** — shown automatically on dashboard when no store is connected

### Core Analysis Engine
- **Hybrid rule engine + AI**: 25 deterministic rules; AI called once per product for clarity NLP score, `aiPerceptionSummary`, tag suggestions
- **Deterministic scoring**: `clarityScore = 0.4×AI + 0.6×rules`; completeness/trust/tags are pure rule-based
- **Rule categories**: Title (4), Description (7), Tags (4), Trust (4+2 schema), Voice Readiness (3), Comparison Readiness (1)
- **Gap evidence**: Every violation has `ruleId`, `evidence`, `impactScore` (0–100), `effortLevel` (low/medium/high)
- **Multi-provider AI fallback**: Gemini → Groq → Cerebras
- **Policy quality validation**: `isPolicySubstantive()` — checks keyword presence AND word count ≥ 50

### Security & Session Management
- **CSRF protection** — `csrf-sync` backend middleware + frontend `csrf-service.ts` (token cached in-memory, injected on all mutations)
- **Session store** — `connect-pg-simple` backed by PostgreSQL (7-day TTL, `httpOnly`/`secure`/`sameSite` cookies)
- **Session secret** — throws in production if default dev secret is used
- **Per-user store isolation** — all store-scoped routes verify `storesTable.userId === req.session.userId`
- **Rate limiting** — 5 analyses/hour per `userId` on the analyze endpoint
- **Shopify webhook HMAC** — `timingSafeEqual` against `SHOPIFY_API_SECRET`; raw body captured in `express.json` verify hook

### Store Connection
- Shopify OAuth flow (Partners app)
- Manual Admin API token (collapsed under "Use Admin API token")
- Auto product fetch after connect (fire-and-forget background)
- `registerStoreWebhooks` called automatically after both OAuth and token connect flows
- Store removal with confirmation dialog (deletes all data via cascade)

### Shopify Webhooks
- `POST /api/shopify/webhooks/products-update` — HMAC-verified, updates product in DB, busts AI QA cache
- `POST /api/shopify/webhooks/products-delete` — HMAC-verified, deletes product row, logs activity
- Webhooks registered automatically on store connect; errors logged via `req.log.warn`

### Write-back Verification
- After applying a fix, `verifyShopifyUpdate` re-fetches the product from Shopify GraphQL API
- Compares applied content against live Shopify data
- Sets `shopifySynced = verified`, `shopifyError = reason` on mismatch
- Catch block sets `shopifySynced = false` (was a false-positive bug, now fixed)

### 24-Hour Caching
| Feature | Cache column | Bust on |
|---|---|---|
| AI Q&A per product | `aiQaCachedAt` on products table | Webhook product update |
| Query simulation | `querySimulationCachedAt` on store_summaries | Manual re-run |
| Topical authority | `topicalAuthorityCachedAt` on store_summaries | Manual re-run |
| Internal links | `internalLinksCachedAt` on store_summaries | Manual re-run |

All cached endpoints include `cached: true/false` in response.

### Analysis Pipeline (`/api/analysis/:storeId`)
- Full store analysis: products → gaps → consistency → perception → summary
- Per-product: rule engine + AI → scores + issues inserted to DB
- Store consistency analysis (tone, structure, formatting gaps)
- Perception report: agent narrative, strengths, unanswered questions, FAQ health
- Prioritized action plan built from all gaps
- Job persistence: `jobsTable` tracks `status`, `startedAt`, `completedAt`, `errorMessage`

### Pages & Routes (9 routes — consolidated from 18)

| Page | Route | Contents |
|---|---|---|
| Login | `/` | Google OAuth gate; auto-redirect if authenticated |
| Dashboard | `/dashboard` | Store health bar, score breakdown, products preview, activity feed; onboarding modal if no store |
| Products | `/products` | Full product list with score, issue count, analyzed status |
| Product Detail | `/products/:id` | Scores, evidence-backed issues, trust templates, AI Q&A test, quick fix CTA |
| Issues | `/issues` | **3 tabs**: All Issues (Quick Wins / High Priority / Improvements + category filter) · Action Plan (ranked by conversion impact) · Fixed |
| Quick Fixes | `/fixes` | All generated fixes with apply + Shopify sync + verification status |
| AI Readiness | `/ai-readiness` | **3 tabs**: AI Perception (narrative + strengths + positioning) · Query Simulation (6 buyer queries) · Consistency (tone/structure/formatting) |
| Content | `/content` | **2 tabs**: Topical Authority (cluster coverage bars + gap details) · Internal Links (complementary/upsell/alternative/same-category) |
| Tools | `/tools` | **4 tabs**: LLMs.txt (generate + deploy) · FAQ Schema (JSON-LD + health) · Tags (per-product optimizer) · Benchmark (score vs AI-ready stores) |
| Connect | `/connect` | Authenticated store connection form (OAuth + token) |
| Settings | `/settings` | Account info (Google avatar/email), connected stores list (set active, delete), env var reference |

### Layout Shell
- **Fixed header** (h-14): Logo → StoreSelector dropdown → flex spacer → Settings icon → UserMenu (Google avatar, initials fallback, sign out)
- **Fixed sidebar** (w-220px, top-14): 3 nav groups — null (Dashboard, Products) / Analyze (Issues, Quick Fixes) / AI (AI Readiness, Content, Tools)
- **StoreSelector**: dropdown with all stores, active checkmark, "Add store" option → `/connect`
- **UserMenu**: Google profile picture, logout action
- All content scrollable in `ml-[220px]` main area

### Quick Fix Sheet
- Fix types: Description, Tags, Title, Structure, JSON-LD Schema
- Editable before applying
- Shopify sync on apply + post-apply verification
- Gap closure scoped to matching category (not all gaps)
- Deduplication: returns existing pending fix

### Error Handling
- **Global React error boundary** — `<ErrorBoundary FallbackComponent={ErrorFallback}>` in App.tsx; shows error message + reload/retry buttons
- **AI failure non-fatal** — all LLM calls have rule-based fallbacks; Zod schema validation with graceful degradation
- **Job error tracking** — analysis failures update `jobs.status='failed'`, `jobs.errorMessage`, and insert activity row

### Backend API Surface

| Endpoint | Purpose |
|---|---|
| `GET /api/auth/google` | Initiate Google OAuth |
| `GET /api/auth/google/callback` | OAuth callback → session → redirect frontend |
| `GET /api/auth/me` | Return current user from session |
| `POST /api/auth/logout` | Destroy session |
| `GET /api/csrf-token` | Issue CSRF token |
| `GET /api/stores` | List stores (userId-filtered) |
| `POST /api/stores` | Connect store (token flow) |
| `DELETE /api/stores/:id` | Remove store + all data (userId-verified) |
| `POST /api/stores/:id/analyze` | Run full store analysis (rate-limited, userId-verified) |
| `GET /api/jobs/:jobId` | Poll job status (userId-verified via store ownership) |
| `GET /api/stores/:id/summary` | Store score summary |
| `GET /api/stores/:id/gaps` | All gaps with product titles |
| `GET /api/stores/:id/activity` | Activity log (userId-verified) |
| `GET /api/stores/:id/products` | List products with scores |
| `GET /api/stores/:id/products/:pid` | Product detail with issues + fixes |
| `POST /api/stores/:id/products/:pid/generate-fix` | AI-generate a fix |
| `POST /api/stores/:id/fixes/:fid/apply` | Apply fix + Shopify sync + verify |
| `POST /api/stores/:id/fixes/bulk-apply` | Bulk apply fixes |
| `GET /api/stores/:id/perception` | Agent narrative + action plan |
| `GET /api/stores/:id/tag-optimizer` | Tag analysis per product |
| `GET /api/stores/:id/llms-txt` | Generate llms.txt |
| `GET /api/stores/:id/query-simulation` | AI query test (24h cached) |
| `GET /api/stores/:id/topical-authority` | Topic cluster analysis (24h cached) |
| `GET /api/stores/:id/internal-links` | Internal link audit (24h cached) |
| `GET /api/stores/:id/faq-schema` | FAQPage JSON-LD generation |
| `GET /api/stores/:id/products/:pid/ai-qa` | Product Q&A test (24h cached) |
| `POST /api/shopify/install` | OAuth install redirect |
| `GET /api/shopify/callback` | OAuth callback |
| `POST /api/shopify/webhooks/products-update` | Webhook: product updated in Shopify |
| `POST /api/shopify/webhooks/products-delete` | Webhook: product deleted in Shopify |
| `GET /api/stores/:id/visibility-checks` | List GEO citation checks (U-7) |
| `POST /api/stores/:id/visibility-checks` | Log a new AI engine citation check (U-7) |
| `GET /api/stores/:id/visibility-summary` | Citation rate % + by-engine breakdown (U-7) |
| `GET /api/stores/:id/products/:pid/answer-first` | Answer-first structure: TL;DR + specs + best-for (U-4) |

---

## Environment Variables Required

| Variable | Purpose | Default |
|---|---|---|
| `DATABASE_URL` | Neon PostgreSQL connection string | — (required) |
| `GEMINI_API_KEY` | Primary AI provider | — (required) |
| `GROQ_API_KEY` | AI fallback #1 | — (optional) |
| `CEREBRAS_API_KEY` | AI fallback #2 | — (optional) |
| `GOOGLE_CLIENT_ID` | OAuth app client ID | — (required for auth) |
| `GOOGLE_CLIENT_SECRET` | OAuth app client secret | — (required for auth) |
| `GOOGLE_REDIRECT_URI` | Must match Google Console | `http://localhost:4000/api/auth/google/callback` |
| `SESSION_SECRET` | Cookie signing secret | `dev-session-secret-...` (throws in production) |
| `SHOPIFY_API_KEY` | Shopify Partners app key | — (required for OAuth) |
| `SHOPIFY_API_SECRET` | Shopify Partners app secret | — (required for OAuth + webhooks) |
| `APP_BASE_URL` | API base for OAuth redirect URI + webhooks | auto-set by dev.ts → `http://localhost:4000` |
| `FRONTEND_URL` | Post-auth redirect target | auto-set by dev.ts → `http://localhost:3000` |
| `PORT` | API server port | `4000` |
| `FRONTEND_PORT` | Vite dev server port | `3000` |

All variables now present in `.env.example`.

---

## Extra Features (Beyond Track 5)

- **Google OAuth authentication** — production-ready login with session persistence
- **CSRF protection** — backend middleware + frontend token injection on all mutations
- **Shopify webhook sync** — product changes in Shopify auto-update the DB, no manual re-fetch needed
- **Write-back verification** — confirms Shopify actually updated after applying a fix
- **24h caching + content-hash invalidation** — feature caches bust when catalog changes, not just on TTL expiry (CB-6)
- **Policy quality validation** — keyword + word count check, not just URL existence
- **Voice query readiness rules** — title length, model-number prefixes, conversational language
- **Comparison readiness rule** — flags products missing spec data
- **LLMs.txt generator** — emerging standard; includes Shopify deploy instructions
- **Internal link audit** — categorized by link type (complementary, upsell, alternative, same-category)
- **Topical authority map** — semantic clustering of catalog, identifies thin topics
- **Multi-AI fallback** — Gemini → Groq → Cerebras
- **Conversion impact labels** — each action plan gap has a specific human-readable impact label
- **Job persistence + idempotency** — analysis jobs tracked in DB; `Idempotency-Key` header prevents duplicate runs (CB-12)
- **Token encryption at rest** — AES-256-GCM encryption for Shopify access tokens; transparent migration for legacy tokens (CB-5)
- **AI output provenance** — `scoringSource: "ai" | "rule" | "fallback"` tracked per product (CB-11)
- **Technical SEO module** — robots.txt + sitemap.xml + meta description + canonical sampling; 5 store-level gap types (U-1)
- **Answer-first structure generator** — TL;DR + best-for + specs table per product; grounded in policy text (U-4)
- **Policy-grounded FAQ schema** — answers derived from real refund/shipping policy bodies, not hallucinated (U-3)
- **Schema field-level auditing** — `SCHEMA_OFFERS_INCOMPLETE` + `SCHEMA_MISSING_BRAND` rules for rich-result eligibility (U-5)
- **Taxonomy specificity rule** — `TAXONOMY_TOO_GENERIC` flags vague productTypes hurting AI classification (U-2)
- **Precise gap closure** — `sourceGapId` on fixes; apply handler targets exact gap, not broad category (CB-9)
- **Locale-aware rule engine** — `detectIsEnglish()` skips English-only keyword heuristics (material, dimensions, use-case, spec, conversational) for non-Latin text (CB-7)
- **Brand authority rules** — `BRAND_LOW_REVIEW_COVERAGE` + `BRAND_INCONSISTENT_VENDOR`; vendor attribution gap detection per product (U-6)
- **GEO visibility / citation tracker** — `visibility_checks` table; log AI engine citation results; citation rate % + by-engine breakdown (U-7)
- **Benchmark precomputation** — P90 benchmark cached in `store_summaries` during analysis; benchmark endpoint is O(1) not O(N products) (CB-8)
- **Structured observability** — `timeStep<T>()` per-phase timing; `getAiFallbackStats()` provider tracking; `correlationId` on all log lines (CB-10)
- **In-process analysis queue** — `AnalysisQueue` limits concurrency to 1; FIFO; event-loop yield via `setImmediate`; BullMQ upgrade path documented (CB-1)
- **Deterministic eval suite** — 23 standalone rule-engine tests; `node:assert` only; covers all rule categories + locale + score sanity; `npm run test:rules` (CB-4)

---

## Known Issues (post fix round 4)

> Full verified issue list: see `issues.md`. All actionable items are now resolved.

### All issues resolved ✅
- All 27 original issues (C/H/M/L): 26 fixed in code, 1 (L-5 git history) is not retroactively fixable
- All 8 N-series issues resolved
- All 12 CB-series backend audit items resolved (rounds 3–4)
- All 7 AEO/GEO/SEO upgrades implemented (rounds 3–4)
- **48 of 49 actionable items complete** (L-5 excluded — git history)

---

## Implemented — Previously Listed as Gaps (now corrected)

| Item | Status |
|---|---|
| **`hasStructuredData` detection** | ✅ Implemented — `shopify-ingestion.ts:269` parses JSON-LD from product `descriptionHtml` and metafields; `enrichWithPageSignals` fetches storefront HTML and parses `AggregateRating` schema |
| **`reviewCount` detection** | ✅ Implemented — `shopify-ingestion.ts:180–204` (`extractReviewSignals`) reads metafields; `enrichWithPageSignals` parses JSON-LD `ratingCount`/`reviewCount` from live storefront HTML |

---

## Verdict Against Track 5 Rubric

| Criterion | Score | Reasoning |
|---|---|---|
| Identifies AI readiness gaps | **Strong** | 25 deterministic rules with evidence, impact scores, effort levels across 6 categories |
| Ranked action plan | **Strong** | Conversion-impact ranked with specific labels, linked to products, dedicated tab in Issues page |
| AI perception vs. desired positioning | **Strong** | Full perception report with narrative, strengths, unanswered questions, merchant positioning input |
| Concrete action to improve | **Strong** | Quick Fix generates + applies with Shopify write-back verification; FAQ schema, JSON-LD, llms.txt deployable immediately |
| Genuine product thinking | **Strong** | Rule engine over pure AI scoring; "Can AI answer this?" test grounds scores in actual AI behavior; webhook sync keeps data fresh |
| **Overall** | **Meets all 5 criteria** | Auth layer + CSRF + webhook sync + caching + per-user isolation bring the project to production-ready quality |

---

## Cursor Backend Strict Score (updated after fix round 4)

| Dimension | Round 3 | Round 4 | Delta |
|---|---|---|---|
| Product thinking | 9.5/10 | 9.5/10 | — (already strong; brand/GEO upgrades incremental) |
| Backend correctness | 8.5/10 | 9/10 | +0.5 — CB-8 precomputed benchmark; CB-7 locale detection; CB-10 observability |
| AI output robustness | 8.5/10 | 8.5/10 | — (CB-3 already covered all AI outputs) |
| Scalability under stress | 6/10 | 7.5/10 | +1.5 — CB-1 in-process queue; CB-8 O(1) benchmark; CB-4 eval suite |
| Security/privacy posture | 8.5/10 | 8.5/10 | — (unchanged) |
| Judge/demo resilience | 8/10 | 8.5/10 | +0.5 — CB-10 step timing + AI fallback tracking; CB-4 test coverage |
| **Overall** | **8.2/10** | **8.6/10** | **+0.4** |

> All CB-series and U-series items resolved. Only L-5 (git history) remains permanently unfixable.

## AEO/GEO/SEO Upgrades (fix round 3 additions)

| Upgrade | Status | Details |
|---|---|---|
| Technical SEO module | ✅ Implemented | `lib/technical-seo.ts` — robots.txt, sitemap.xml, page sampling (meta desc, canonical); 5 store-level gap rule IDs; wired into analysis pipeline |
| Taxonomy specificity | ✅ Implemented | `TAXONOMY_TOO_GENERIC` rule in rule-engine.ts; flags vague productTypes like "Accessories" |
| Structured data auditing | ✅ Implemented | `SCHEMA_OFFERS_INCOMPLETE` + `SCHEMA_MISSING_BRAND` rules; checks offers.price/currency/availability |
| FAQ schema grounding | ✅ Implemented | `policyBodies` stored in perception_reports; passed to `generateFaqSchema`; answers grounded in real policy text |
| Answer-first structure | ✅ Implemented | `generateAnswerFirstStructure()` in ai-features.ts; `GET /stores/:id/products/:pid/answer-first` endpoint |
| Brand authority signals | ✅ Implemented | `BRAND_LOW_REVIEW_COVERAGE` + `BRAND_INCONSISTENT_VENDOR` rules in rule-engine.ts |
| GEO visibility tracking | ✅ Implemented | `visibility_checks` table; `GET/POST /stores/:id/visibility-checks`; citation rate + by-engine summary |
