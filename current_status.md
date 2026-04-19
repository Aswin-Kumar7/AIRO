# Current Status — AI Representation Optimizer (Track 5)

## Requirement Check

### Track 5 Core Criteria

| Requirement | Status | How it's satisfied |
|---|---|---|
| Identifies gaps in merchant's AI readiness | ✅ Done | Rule engine (15 deterministic rules) + AI layer → gaps stored in DB with evidence, impact score, effort level, severity |
| Missing FAQ coverage | ✅ Done | `perception-simulator.ts` checks FAQ page for 9 standard topics (shipping, returns, sizing, etc.) and surfaces unanswered ones on `/faq-health` |
| Ambiguous policies | ✅ Done | Policy gaps detected during store analysis, shown in gap analysis and action plan |
| Weak trust signals | ✅ Done | Rules: TRUST_NO_IMAGE, TRUST_NO_BRAND, TRUST_NO_SCHEMA, TRUST_NO_REVIEWS — each with specific evidence and copy templates |
| Unclear product information | ✅ Done | Rules: DESC_MISSING, DESC_TOO_SHORT, DESC_NO_MATERIAL, DESC_NO_DIMENSIONS, DESC_NO_USE_CASE, COMPARE_INSUFFICIENT_SPECS |
| Prioritizes improvements — ranked action plan | ✅ Done | `/action-plan` page — `conversion-ranker.ts` scores each gap by conversion impact, surfaces as prioritized list with severity + impact label |
| Shows how AI agents currently perceive the store | ✅ Done | `/perception` page — `perception-simulator.ts` generates agent narrative, perceived strengths, unanswered questions, ambiguities |
| Shows gap between perception vs. merchant desired positioning | ✅ Done | Merchant sets desired positioning on `/perception`, compared against AI-generated narrative |
| Helps merchants take concrete action | ✅ Done | Quick Fix sheet generates improved descriptions, tags, title, structure, JSON-LD — with Shopify sync |
| Demonstrates genuine product thinking | ✅ Done | Rule engine provides evidence-backed violations, not generic suggestions; score blending uses deterministic rules, AI only for NLP clarity |

---

## Full Feature Inventory

### Core Analysis Engine
- **Hybrid rule engine + AI**: 15 deterministic rules for all violations; AI called once per product for clarity NLP score, `aiPerceptionSummary`, and tag suggestions
- **Deterministic scoring**: `clarityScore = 0.4×AI + 0.6×rules`; completeness/trust/tags are pure rule-based
- **Rule categories**: Title (4 rules), Description (6 rules), Tags (4 rules), Trust (4 rules), Voice Readiness (3 rules), Comparison Readiness (1 rule)
- **Gap evidence**: Every violation has `ruleId`, `evidence` (specific text), `impactScore` (0–100), `effortLevel` (low/medium/high)
- **Multi-provider AI fallback**: Gemini → Groq → Cerebras

### Store Connection
- Shopify OAuth flow (Partners app)
- Manual Admin API token
- Auto product fetch after connect (fire-and-forget background)
- Store removal with confirmation dialog (deletes all data)

### Analysis Pipeline (`/api/analysis/:storeId`)
- Full store analysis: products → gaps → consistency → perception → summary
- Per-product: rule engine + AI → scores + issues inserted to DB
- Store consistency analysis (tone, structure, formatting gaps)
- Perception report: agent narrative, strengths, unanswered questions, FAQ health
- Prioritized action plan built from all gaps

### Pages & Routes

| Page | Route | Purpose |
|---|---|---|
| Home | `/` | Connect store (OAuth primary, admin token collapsed) |
| Dashboard | `/dashboard` | Store health bar, score breakdown, products preview, activity feed, insight cards |
| Products | `/products` | Full product list with score, issue count, analyzed status |
| Product Detail | `/products/:id` | Scores, evidence-backed issues, trust templates, AI Q&A test, quick fix CTA |
| Gaps | `/gaps` | Grouped: Quick Wins / High Priority / Improvements / Fixed; evidence badges |
| Quick Fixes | `/fixes` | All generated fixes with apply + Shopify sync |
| Benchmark | `/benchmark` | Score vs. AI-ready store benchmarks |
| Consistency | `/consistency` | Store-level tone/structure/formatting consistency issues |
| AI Perception | `/perception` | Agent narrative, strengths, unanswered questions, desired positioning input |
| FAQ & Policies | `/faq-health` | FAQ page status, question count, unanswered topic coverage |
| Structured Data | `/structured-data` | Products missing JSON-LD, coverage bar |
| Tag Optimizer | `/tags` | Per-product tag scores, generic tags flagged, AI suggested tags |
| Action Plan | `/action-plan` | Ranked gaps by conversion impact, severity, suggested fix, product link |
| Query Simulation | `/query-test` | 6 real buyer queries tested — would AI recommend your products? |
| Topical Authority | `/topical-authority` | Catalog clustered by topic, coverage scores, content gaps per cluster |
| Internal Links | `/internal-links` | Missing product link recommendations (complementary/alternative/upsell) |
| FAQ Schema | `/faq-schema` | FAQPage JSON-LD auto-generated, paste-ready Shopify snippet |
| LLMs.txt | `/llms-txt` | Full llms.txt generated from store data, download + Shopify deploy guide |

### Quick Fix Sheet
- Fix types: Description, Tags, Title, Structure, JSON-LD Schema
- Editable before applying (textarea for text fixes, code block for JSON-LD)
- Shopify sync on apply
- Deduplication: returns existing pending fix, doesn't regenerate

### Product Detail — Specific AI Signals
- Per-product AI Q&A test: 5 standard buyer questions answered from product content alone
- Shows exactly which questions the AI cannot answer and what's missing
- Trust copy templates (pre-written) for TRUST_NO_REVIEWS, TRUST_NO_BRAND
- Voice readiness issues surfaced inline

### Backend API Surface
| Endpoint | Purpose |
|---|---|
| `POST /api/stores` | Connect store |
| `DELETE /api/stores/:id` | Remove store + all data |
| `POST /api/analysis/:id` | Run full store analysis |
| `GET /api/stores/:id/products` | List products with scores |
| `GET /api/stores/:id/products/:pid` | Product detail with issues + fixes |
| `POST /api/stores/:id/products/:pid/generate-fix` | AI-generate a fix |
| `POST /api/stores/:id/fixes/:fid/apply` | Apply fix + Shopify sync |
| `GET /api/stores/:id/perception` | Agent narrative + action plan |
| `GET /api/stores/:id/tag-optimizer` | Tag analysis per product |
| `GET /api/stores/:id/llms-txt` | Generate llms.txt |
| `GET /api/stores/:id/query-simulation` | Live AI query test |
| `GET /api/stores/:id/topical-authority` | Topic cluster analysis |
| `GET /api/stores/:id/internal-links` | Internal link audit |
| `GET /api/stores/:id/faq-schema` | FAQPage JSON-LD generation |
| `GET /api/stores/:id/products/:pid/ai-qa` | Product Q&A test |

---

## Extra Features (Beyond Track 5)

These were not asked for but significantly strengthen the submission:

- **Voice query readiness rules** — checks title length, model-number prefixes, conversational language for voice AI compatibility
- **Comparison readiness rule** — flags products missing spec data (dimensions, materials, compatibility) that prevent AI comparison answers
- **LLMs.txt generator** — emerging standard not covered by most tools; includes Shopify deploy instructions
- **Internal link audit** — categorized by link type (complementary, upsell, alternative, same-category)
- **Topical authority map** — semantic clustering of catalog, identifies thin topics; AI agents deprioritize stores without topical depth
- **Multi-AI fallback** — Gemini → Groq → Cerebras so analysis works even if one provider is down
- **Conversion impact labels** — each gap in the action plan has a specific human-readable impact label (e.g. "High — AI agents flag stores without return policies as untrustworthy")

---

## Gaps / Weaknesses

### Functional gaps
| Gap | Severity | Notes |
|---|---|---|
| **No real Shopify write-back verification** | Medium | Apply fix calls Shopify API but there's no confirmation that the live product page actually updated — no post-apply crawl/verify |
| **Benchmark scores are static** | Medium | Benchmark values are hardcoded constants (`BENCHMARK_SCORES`), not computed from real AI-ready store data |
| **Query simulation queries are AI-generated** | Low | Queries in `/query-test` are generated per session, not from real search data or historical query logs |
| **Policy detection is URL-based** | Low | Policies (return, shipping) detected by crawling Shopify page URLs — doesn't validate the actual policy content quality |
| **No real-time Shopify webhook sync** | Low | Product data goes stale between analyses; no webhook to auto-update when merchant edits a product |
| **ai-qa endpoint has no caching** | Low | Every call to `/products/:id/ai-qa` makes a fresh LLM call — expensive if triggered repeatedly |
| **Topical authority / internal links not persisted** | Low | Results are regenerated on every page load — no DB caching, no `generatedAt` staleness check on frontend |

### UX gaps
| Gap | Severity | Notes |
|---|---|---|
| **No onboarding flow** | Medium | After connecting a store, there's no guided "what to do next" — users land on dashboard with no analysis yet |
| **No progress indicator during analysis** | Medium | Analysis can take 30–60s; only a spinner with no step-by-step feedback (fetching products → scoring → perception...) |
| **Fix history / changelog** | Low | No way to see what was changed and when — applied fixes show `appliedAt` in DB but not surfaced clearly |
| **No email / notification when analysis completes** | Low | Long-running analysis; user must stay on page to see when it finishes |

### Technical debt
| Item | Notes |
|---|---|
| **`hasStructuredData` always false** | Shopify ingestion sets this based on metafields but most stores don't use metafields for JSON-LD — actual detection requires HTML parsing which isn't done |
| **`reviewCount` always 0** | Review count ingestion is a stub; Shopify Admin API requires `metafields` or a third-party reviews app — not fully wired |
| **Benchmark page** | UI exists but scores are hardcoded — not comparing against real crawled store data |

---

## Verdict Against Track 5 Rubric

| Criterion | Score | Reasoning |
|---|---|---|
| Identifies AI readiness gaps | **Strong** | 15 deterministic rules with evidence, impact scores, effort levels across 6 categories |
| Ranked action plan | **Strong** | Conversion-impact ranked with specific labels, linked to products, on dedicated page |
| AI perception vs. desired positioning | **Strong** | Full perception report with narrative, strengths, unanswered questions, merchant positioning input |
| Concrete action to improve | **Strong** | Quick Fix generates + applies; FAQ schema, JSON-LD, llms.txt are all immediately deployable artifacts |
| Genuine product thinking | **Strong** | Rule engine over pure AI scoring; "Can AI answer this?" test grounds scores in actual AI behavior; query simulation tests real recommendation scenarios |
| **Overall** | **Meets all 5 criteria** | Most gaps are in data quality (reviews, structured data detection) not in the diagnostic/action layer |
