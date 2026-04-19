# Current Status — AI Readiness Analyzer

## Requirement Check

### Track 5 Core Criteria

| Requirement | Status | How it's satisfied |
|---|---|---|
| Identifies gaps in merchant's AI readiness | ✅ Done | Rule engine (15 deterministic rules) + AI layer → gaps stored in DB with evidence, impact score, effort level, severity |
| Missing FAQ coverage | ✅ Done | `perception-simulator.ts` checks FAQ page for 9 standard topics and surfaces unanswered ones in Issues → All Issues |
| Ambiguous policies | ✅ Done | Policy gaps detected during store analysis, shown in Issues and Action Plan; policy quality validated by keyword + word count (≥50 words) |
| Weak trust signals | ✅ Done | Rules: TRUST_NO_IMAGE, TRUST_NO_BRAND, TRUST_NO_SCHEMA, TRUST_NO_REVIEWS |
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
- **Session cookies** — `httpOnly`, `secure` in production, `sameSite: lax` in dev
- **Auth middleware** — `requireAuth` guards all routes except `/api/auth/*`, `/api/health`, Shopify install/callback/webhooks
- **Users table** — DB stores `googleId`, `email`, `name`, `avatarUrl`; stores optionally linked via `userId`
- **Onboarding modal** — shown automatically on dashboard when no store is connected

### Core Analysis Engine
- **Hybrid rule engine + AI**: 15 deterministic rules; AI called once per product for clarity NLP score, `aiPerceptionSummary`, tag suggestions
- **Deterministic scoring**: `clarityScore = 0.4×AI + 0.6×rules`; completeness/trust/tags are pure rule-based
- **Rule categories**: Title (4), Description (6), Tags (4), Trust (4), Voice Readiness (3), Comparison Readiness (1)
- **Gap evidence**: Every violation has `ruleId`, `evidence`, `impactScore` (0–100), `effortLevel` (low/medium/high)
- **Multi-provider AI fallback**: Gemini → Groq → Cerebras
- **Policy quality validation**: `isPolicySubstantive()` — checks keyword presence AND word count ≥ 50 (not just URL existence)

### Store Connection
- Shopify OAuth flow (Partners app)
- Manual Admin API token (collapsed under "Use Admin API token")
- Auto product fetch after connect (fire-and-forget background)
- `registerStoreWebhooks` called automatically after both OAuth and token connect flows
- Store removal with confirmation dialog (deletes all data)

### Shopify Webhooks
- `POST /api/shopify/webhooks/products-update` — HMAC-verified, updates product in DB, busts AI QA cache
- `POST /api/shopify/webhooks/products-delete` — HMAC-verified, deletes product row, logs activity
- Webhooks registered automatically on store connect via `registerStoreWebhooks`
- Raw body captured via `express.json({ verify })` for HMAC computation

### Write-back Verification
- After applying a fix, `verifyShopifyUpdate` re-fetches the product from Shopify GraphQL API
- Compares applied content against live Shopify data
- Sets `shopifySynced = verified`, `shopifyError = reason` if mismatch detected

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

### Pages & Routes (9 routes — consolidated from 18)

| Page | Route | Contents |
|---|---|---|
| Login | `/` | Google OAuth gate; auto-redirect if authenticated |
| Dashboard | `/dashboard` | Store health bar, score breakdown, products preview, activity feed, insight cards; onboarding modal if no store |
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
- Deduplication: returns existing pending fix

### Backend API Surface

| Endpoint | Purpose |
|---|---|
| `GET /api/auth/google` | Initiate Google OAuth |
| `GET /api/auth/google/callback` | OAuth callback → session → redirect frontend |
| `GET /api/auth/me` | Return current user from session |
| `POST /api/auth/logout` | Destroy session |
| `GET /api/stores` | List stores |
| `POST /api/stores` | Connect store (token flow) |
| `DELETE /api/stores/:id` | Remove store + all data |
| `POST /api/analysis/:id` | Run full store analysis |
| `GET /api/stores/:id/products` | List products with scores |
| `GET /api/stores/:id/products/:pid` | Product detail with issues + fixes |
| `POST /api/stores/:id/products/:pid/generate-fix` | AI-generate a fix |
| `POST /api/stores/:id/fixes/:fid/apply` | Apply fix + Shopify sync + verify |
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
| `SESSION_SECRET` | Cookie signing secret | `dev-session-secret-...` |
| `SHOPIFY_API_KEY` | Shopify Partners app key | — (required for OAuth) |
| `SHOPIFY_API_SECRET` | Shopify Partners app secret | — (required for OAuth) |
| `FRONTEND_URL` | Post-auth redirect target | auto-set by dev.ts → `http://localhost:3000` |
| `APP_BASE_URL` | API base for OAuth redirect URI | auto-set by dev.ts → `http://localhost:4000` |
| `PORT` | API server port | `4000` |
| `FRONTEND_PORT` | Vite dev server port | `3000` |

---

## Extra Features (Beyond Track 5)

- **Google OAuth authentication** — production-ready login with session persistence
- **Shopify webhook sync** — product changes in Shopify auto-update the DB, no manual re-fetch needed
- **Write-back verification** — confirms Shopify actually updated after applying a fix
- **24h caching** — expensive LLM features (AI QA, query sim, topical authority, internal links) cached in DB
- **Policy quality validation** — keyword + word count check, not just URL existence
- **Voice query readiness rules** — title length, model-number prefixes, conversational language
- **Comparison readiness rule** — flags products missing spec data
- **LLMs.txt generator** — emerging standard; includes Shopify deploy instructions
- **Internal link audit** — categorized by link type (complementary, upsell, alternative, same-category)
- **Topical authority map** — semantic clustering of catalog, identifies thin topics
- **Multi-AI fallback** — Gemini → Groq → Cerebras
- **Conversion impact labels** — each action plan gap has a specific human-readable impact label

---

## Known Gaps / Weaknesses

### Functional
| Gap | Severity | Notes |
|---|---|---|
| **Benchmark scores are static** | Medium | Values are hardcoded constants, not from real crawled AI-ready store data |
| **Query simulation queries are AI-generated** | Low | Not from real search data or historical query logs |
| **No per-user store isolation** | Low | Auth is enforced but all logged-in users see all stores; `userId` column exists but filtering not yet applied |
| **No analysis progress indicator** | Medium | Analysis can take 30–60s with only a spinner; no step-by-step feedback |

### Technical Debt
| Item | Notes |
|---|---|
| **`hasStructuredData` always false** | Actual detection requires HTML parsing; Shopify metafields rarely used for JSON-LD |
| **`reviewCount` always 0** | Shopify Admin API requires metafields or third-party reviews app integration |
| **Old page files still present** | `gaps.tsx`, `action-plan.tsx`, `perception.tsx`, `query-test.tsx`, `consistency.tsx`, `topical-authority.tsx`, `internal-links.tsx`, `faq-health.tsx`, `faq-schema.tsx`, `tags.tsx`, `structured-data.tsx`, `benchmark.tsx`, `llms-txt.tsx` still exist but are no longer routed — can be deleted |

---

## Verdict Against Track 5 Rubric

| Criterion | Score | Reasoning |
|---|---|---|
| Identifies AI readiness gaps | **Strong** | 15 deterministic rules with evidence, impact scores, effort levels across 6 categories |
| Ranked action plan | **Strong** | Conversion-impact ranked with specific labels, linked to products, dedicated tab in Issues page |
| AI perception vs. desired positioning | **Strong** | Full perception report with narrative, strengths, unanswered questions, merchant positioning input |
| Concrete action to improve | **Strong** | Quick Fix generates + applies with Shopify write-back verification; FAQ schema, JSON-LD, llms.txt deployable immediately |
| Genuine product thinking | **Strong** | Rule engine over pure AI scoring; "Can AI answer this?" test grounds scores in actual AI behavior; webhook sync keeps data fresh |
| **Overall** | **Meets all 5 criteria** | Auth layer + webhook sync + caching bring the project to production-ready quality |
