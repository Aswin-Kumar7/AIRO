# Backend Pipeline — AI Readiness Analyzer
> Architecture reference · April 2026 · Verified against source code

---

## 1. High-Level Architecture

```
Browser (React + Wouter + TanStack Query)
    │  REST + JSON (same-origin or reverse proxy)
    ▼
Express 5 API Server  (:4000 in dev)
    │
    ├─ Middleware chain (pino → CORS → cookie-parser → express-session → requireAuth)
    │
    ├─ /api/auth/*          Google OAuth 2.0 (session-based)
    ├─ /api/shopify/*       Shopify OAuth + webhooks (HMAC-verified)
    ├─ /api/stores/*        CRUD + store analysis trigger
    ├─ /api/stores/:id/products/*   Product list, detail, on-demand fix generation
    ├─ /api/stores/:id/fixes/*      Fix apply + Shopify write-back
    └─ /api/stores/:id/...features  Query sim, topical authority, llms.txt, AI QA, etc.
              │
              ├─ lib/ai-client.ts          → Gemini 2.0-flash → Groq → Cerebras (fallback chain)
              ├─ lib/rule-engine.ts        → 15+ deterministic rules, no AI
              ├─ lib/ai-analyzer.ts        → Rule engine + AI blend per product
              ├─ lib/ai-features.ts        → Store-level AI features (query sim, perception, etc.)
              ├─ lib/shopify-ingestion.ts  → Shopify GraphQL + storefront HTML fetch
              ├─ lib/shopify-client.ts     → Shopify GraphQL write-back
              ├─ lib/perception-simulator.ts → AI narrative generation
              └─ lib/conversion-ranker.ts  → Deterministic gap prioritization

Neon PostgreSQL (Drizzle ORM)
    Tables: users, stores, products, gaps, fixes, activity,
            store_summaries, consistency_reports, perception_reports
```

---

## 2. Middleware Chain (Request Lifecycle)

Every incoming request passes through this exact chain in order:

```
1. pinoHttp              log method + path (headers redacted: authorization, cookie, set-cookie)
2. cors                  allowlist: FRONTEND_URL | localhost:3000 | localhost:5173 ; credentials:true
3. cookieParser          parse 'sid' session cookie
4. express-session       MemoryStore (dev), HttpOnly, sameSite:lax/none, 7-day maxAge
5. express.json          + verify hook that snapshots req.rawBody (Buffer) for webhook HMAC
6. express.urlencoded
7. requireAuth           PUBLIC prefixes bypass: /api/health, /api/auth/, /api/shopify/install,
                           /api/shopify/callback, /api/shopify/webhooks/
                         All others → check req.session.userId → 401 UNAUTHENTICATED if absent
8. /api router           sub-routers mounted with no shared prefix (each declares full path)
```

---

## 3. Authentication Flow

### Google OAuth
```
[Browser]                        [API Server]                      [Google]
   │── GET /api/auth/google ────►│ generate state (16-byte hex)    │
   │                             │ store in req.session.oauthState  │
   │◄── 302 → Google auth URL ──│── redirect to accounts.google.com/o/oauth2/auth
   │                                  scope: openid email profile
   │                                  access_type: offline, prompt: select_account
   │                                  redirect_uri: APP_BASE_URL/api/auth/google/callback
   │
   │ [user approves]
   │── GET /api/auth/google/callback?code=...&state=... ──────────►│
   │                             │ verify state === session.oauthState
   │                             │── POST /oauth2/googleapis.com/token {code, client_id, secret}
   │                             │◄── {access_token, id_token}
   │                             │── GET googleapis.com/oauth2/v3/userinfo
   │                             │◄── {sub, email, name, picture}
   │                             │ upsertUserFromGoogle (lookup by googleId, insert if new)
   │                             │ req.session.userId = user.id
   │◄── 302 → FRONTEND_URL/?auth=success
```

Session cookie `sid` is set at this point (httpOnly, 7 days).

### Shopify OAuth
```
[Browser]             [API Server]                               [Shopify]
   │── GET /shopify/install?shop=... ──►│ normalizeShopifyDomain
   │                                    │ generate 24-byte hex state
   │                                    │ set cookies: shopify_oauth_state, shopify_oauth_shop
   │                                    │   (httpOnly, sameSite:lax, path:/api/shopify, 10min)
   │◄── 302 → shopify admin/oauth/authorize
   │
   │ [merchant approves]
   │── GET /shopify/callback?code=...&hmac=...&shop=...&state=... ──►│
   │                                    │ verifyShopifyOAuthCallback:
   │                                    │   sort query params (exclude hmac, signature)
   │                                    │   HMAC-SHA256 with SHOPIFY_API_SECRET
   │                                    │   timingSafeEqual against hmac param
   │                                    │ verify state cookie match
   │                                    │ verify shop cookie match
   │                                    │── POST shop/admin/oauth/access_token {client_id,secret,code}
   │                                    │◄── {access_token}
   │                                    │ validateShopifyToken (GQL {shop{name}})
   │                                    │ upsertConnectedStore + activity row
   │                                    │ clear cookies
   │◄── 302 → FRONTEND_URL/?shopify=success&storeId=...
   │
   │                                    │ setImmediate:
   │                                    │   fetchAndUpsertProducts(store)
   │                                    │   registerStoreWebhooks(domain, token, APP_BASE_URL)
```

---

## 4. Shopify Data Ingestion (`lib/shopify-ingestion.ts`)

Called at store connect and at the start of every analysis run. Returns `StoreSnapshot`.

### 4a. Product Fetch — `fetchAllProducts`

```
GraphQL loop (PRODUCTS_QUERY, first:100, paginated by cursor):
  products {
    id, handle, title, descriptionHtml, productType, vendor, tags,
    images(first:1), variants(first:1), collections(first:10),
    metafields(first:25)
  }
  ─ cap at 250 products

Per product:
  extractReviewSignals(metafields)
    → filter metafields: namespace contains "review"/"spr"/"judge"
    → key contains "count"/"reviews" → reviewCount
    → key contains "rating"/"average" → reviewRating (rescale: >5 means /20)

  detectStructuredData(descriptionHtml, metafields)
    → regex "schema.org/product" or "application/ld+json" in descriptionHtml
    → OR metafield key containing "jsonld|schema|structured"
    → OR metafield namespace containing "schema"
    → OR metafield value containing "schema.org/product"
```

### 4b. Page Signal Enrichment — `enrichWithPageSignals`

Batches of 8, 6-second timeout per product:

```
GET https://{domain}/products/{handle}
  → parse all <script type="application/ld+json"> blocks
  → handle @graph arrays
  → find Product @type entry
  → hasStructuredData = true if found (overrides ingestion-level detection)
  → extract aggregateRating: reviewCount/ratingCount, ratingValue
  → only overwrite if signals.reviewCount > existing (storefront is ground truth)
```

### 4c. Policy Fetch — `fetchPolicyCoverage`

```
GQL: shop { refundPolicy, shippingPolicy, privacyPolicy, termsOfService } { body }

isPolicySubstantive(body, keywords, minWords=50):
  → words >= 50 AND any keyword matches
  Refund keywords:   refund, return, days, exchange, credit
  Shipping keywords: ship, deliver, transit, order, dispatch
  Privacy keywords:  data, information, collect, privacy, personal
  Terms keywords:    terms, service, agreement, use, conditions
```

### 4d. FAQ Page — `fetchFaqPage`

```
GQL: pages(first:30) { handle, title, body }
→ find first page where:
    handle contains "faq" or "frequently"
    OR title contains "faq"
→ returns {title, body} | null
```

---

## 5. Rule Engine (`lib/rule-engine.ts`) — Deterministic, No AI

Runs entirely without LLM. 15 rules across 6 categories. Every rule produces a `RuleViolation` with `{ruleId, category, severity, title, description, suggestion, evidence, impactScore (0-100), effortLevel}`.

### Rule Catalog

| Rule ID | Category | Severity | Impact | Trigger |
|---------|----------|----------|--------|---------|
| `TITLE_TOO_SHORT` | clarity | high | 85 | words < 3 |
| `TITLE_SHORT` | clarity | medium | 45 | words < 6 |
| `TITLE_TOO_LONG` | clarity | low | 20 | words > 15 |
| `TITLE_ALL_CAPS` | clarity | low | 15 | title === UPPERCASE and len > 5 |
| `DESC_MISSING` | completeness | high | 95 | stripped text empty or < 5 words |
| `DESC_TOO_SHORT` | completeness | high | 75 | < 50 words |
| `DESC_BRIEF` | completeness | medium | 40 | < 80 words |
| `DESC_NO_STRUCTURE` | completeness | low | 30 | no HTML formatting tags and > 40 words |
| `DESC_NO_MATERIAL` | completeness | medium | 45 | no material/fabric/ingredient keyword |
| `DESC_NO_DIMENSIONS` | completeness | low | 30 | no dimension/weight/size keyword |
| `DESC_NO_USE_CASE` | completeness | low | 25 | no "for/designed for/ideal for/perfect for" phrase |
| `TAGS_MISSING` | tags | high | 90 | tags.length === 0 |
| `TAGS_TOO_FEW` | tags | medium | 60 | tags.length < 3 |
| `TAGS_GENERIC` | tags | medium | 40 | any tag is: new, sale, hot, featured, best, top, popular, special, offer, deal, trending, latest |
| `TAGS_NO_CATEGORY` | tags | medium | 45 | productType exists but no tag contains/is-contained-in productType |
| `TRUST_NO_IMAGE` | trust | high | 80 | no imageUrl |
| `TRUST_NO_BRAND` | trust | medium | 40 | no vendor |
| `TRUST_NO_SCHEMA` | trust | medium | 65 | !hasStructuredData |
| `TRUST_NO_REVIEWS` | trust | medium | 50 | reviewCount === 0 |
| `VOICE_TITLE_LONG` | clarity | low | 28 | title word count > 8 |
| `VOICE_TITLE_MODEL_START` | clarity | low | 20 | title starts with model number (regex: `^[A-Z0-9\-]{4,}`) |
| `VOICE_NOT_CONVERSATIONAL` | clarity | low | 22 | no 2nd-person / "we/our/discover/introducing" term |
| `COMPARE_INSUFFICIENT_SPECS` | completeness | medium | 55 | fewer than 2 of: spec terms, dimension terms, material terms (only runs if desc >= 30 words) |
| `SCHEMA_INCOMPLETE` | trust | low | 25 | JSON-LD present but missing name/description/brand/offers/image |
| `SCHEMA_MALFORMED` | trust | medium | 40 | JSON-LD parse error |

### Scoring Formula

```
Per category score = max(0, 100 - Σ(impactScore × 0.8))

clarityScore     = round((titleAnalysisScore + computeScore("clarity")) / 2)
completenessScore = round((descAnalysisScore + computeScore("completeness")) / 2)
trustScore       = round((trustAnalysisScore + computeScore("trust")) / 2)
tagScore         = tagAnalysisScore (unblended)
```

---

## 6. AI Layer (`lib/ai-analyzer.ts`)

Runs once per product, after the rule engine. Only adds NLP nuance for **clarity** — completeness, trust, and tags are pure rule-based.

```
Input: ProductInput (title, description, tags, vendor, productType, ...)

Step 1: runRuleEngine(product) → {ruleScores, violations}

Step 2: chatCompletion(aiPrompt, maxTokens=800)
  Prompt includes:
    - title
    - description (first 400 chars + word count)
    - current tags (up to 10)
    - productType, vendor
  Expected JSON response:
    {
      clarityScore: 0-100,
      aiPerceptionSummary: "2 sentences how a voice AI would describe this product",
      suggestedTags: ["up to 8 semantic retrieval tags"]
    }
  Manual type-checks (not Zod):
    typeof clarityScore === "number" → clamp to [0,100]
    typeof aiPerceptionSummary === "string" → must be non-empty
    Array.isArray(suggestedTags) → filter to strings, max 8

Step 3: Score blending
  clarityScore     = round(0.4 × aiClarityScore + 0.6 × ruleScores.clarity)
  completenessScore = ruleScores.completeness   ← AI has NO influence
  trustScore       = ruleScores.trust           ← AI has NO influence
  tagScore         = ruleScores.tags            ← AI has NO influence
  overallScore     = round((clarity + completeness + trust + tag) / 4)

Step 4: Issues list = violations (1:1 from rule engine — AI does NOT emit new issues)

Fallback: if AI call fails → uses ruleScores.clarity as-is, generic perception summary, empty tags
```

---

## 7. Multi-Provider AI Client (`lib/ai-client.ts`)

```
chatCompletion(messages, maxTokens=2000):

  1. Try callGemini (GEMINI_API_KEY required)
     Model: gemini-2.0-flash (@google/generative-ai SDK)
     Merges system message into first user turn
     generationConfig.maxOutputTokens = maxTokens

  2. On failure → try callGroq (GROQ_API_KEY)
     Endpoint: https://api.groq.com/openai/v1
     Model: llama-3.3-70b-versatile
     Standard OpenAI Chat Completions payload

  3. On failure → try callCerebras (CEREBRAS_API_KEY)
     Endpoint: https://api.cerebras.ai/v1
     Model: llama-3.3-70b

  4. All fail → throw "All AI providers failed. Last error: ..."

Non-primary provider success is logged at info level.
No retry within a single provider (single attempt per).
```

---

## 8. Full Analysis Pipeline (`POST /api/stores/:storeId/analyze`)

This is the core pipeline. It runs **asynchronously** — the route responds immediately, the work happens in `setImmediate`.

```
[Client]                    [API Server - sync]
   │── POST /analyze ──────►│
   │                        │ generate jobId (32-hex)
   │                        │ UPDATE stores SET status='analyzing'
   │                        │ INSERT activity 'analysis_started'
   │◄── {jobId, storeId, status:"running"} ─────────────────────────────────────

[API Server - async, setImmediate]

┌─ STEP A: Ingestion ─────────────────────────────────────────────────────────┐
│  ingestStore(domain, accessToken)                                            │
│    → fetchAllProducts (GQL paginated, cap 250)                               │
│      + extractReviewSignals per product                                      │
│      + detectStructuredData per product                                      │
│    → enrichWithPageSignals (batch 8, 6s timeout each)                       │
│    → fetchPolicyCoverage (GQL shop policies, isPolicySubstantive)            │
│    → fetchFaqPage (GQL pages, find FAQ by handle/title)                      │
│                                                                              │
│  if snapshot.products.length === 0 → throw (skip to error path)             │
│                                                                              │
│  policyScore = round((truthy policies count / 4) × 100)                     │
│                                                                              │
│  DELETE fixes WHERE storeId       ← hard reset every run                    │
│  DELETE gaps WHERE storeId        ← hard reset every run                    │
│  DELETE products WHERE storeId    ← hard reset every run                    │
│                                                                              │
│  INSERT products[] (ingest data only, scores=0)                             │
│  INSERT policy gaps (productId=null):                                        │
│    !refund   → "Missing return policy" (high)                               │
│    !shipping → "Missing shipping policy" (high)                              │
│    !faqPage  → "No FAQ page" (medium, category:completeness)                │
└─────────────────────────────────────────────────────────────────────────────┘

┌─ STEP B: Product Analysis (concurrency = 5) ────────────────────────────────┐
│  For each product in batches of 5:                                           │
│    analyzeProduct(product):                                                  │
│      runRuleEngine → {ruleScores, violations}                                │
│      chatCompletion(aiPrompt, 800) → {clarityScore, summary, suggestedTags} │
│      blend scores (40% AI clarity + 60% rule clarity)                       │
│      return {clarityScore, completenessScore, trustScore, tagScore,          │
│              overallScore, aiPerceptionSummary, suggestedTags, issues}       │
└─────────────────────────────────────────────────────────────────────────────┘

┌─ STEP C: Persist Scores + Gaps ─────────────────────────────────────────────┐
│  For each analyzed product:                                                  │
│    UPDATE products SET clarityScore, completenessScore, trustScore,          │
│      tagScore, overallScore, issueCount, aiPerceptionSummary,                │
│      suggestedTags, analyzedAt = now()                                       │
│    INSERT gaps[] for each violation:                                         │
│      {storeId, productId, category, severity, title, description,            │
│       suggestion, evidence, impactScore, effortLevel, ruleId}               │
│  Accumulate score sums for store averages                                    │
└─────────────────────────────────────────────────────────────────────────────┘

┌─ STEP D: Fix Generation (concurrency = 5) ──────────────────────────────────┐
│  For each product where:                                                     │
│    completenessScore < 70 → generate description fix                         │
│    tagScore < 65          → generate tags fix                                │
│                                                                              │
│  generateFix(type, originalContent, context):                                │
│    chatCompletion(type-specific prompt, 1500)                                │
│    → {improvedContent, explanation, estimatedScoreImprovement 1-20}          │
│                                                                              │
│  INSERT fixes[] (status="pending")                                           │
└─────────────────────────────────────────────────────────────────────────────┘

┌─ STEP E: Store Consistency Analysis ────────────────────────────────────────┐
│  analyzeStoreConsistency(products[title, description, tags]):                │
│    Sample first 10 products                                                  │
│    chatCompletion(consistency prompt, 1500)                                  │
│    → {overallConsistencyScore, issues[{type,description,affectedCount,       │
│        examples}], suggestedStructure[]}                                     │
│  UPSERT consistency_reports                                                  │
└─────────────────────────────────────────────────────────────────────────────┘

┌─ STEP F: Action Plan Ranking ───────────────────────────────────────────────┐
│  SELECT all gaps for store                                                   │
│  buildPrioritizedActionPlan(gaps):                                           │
│    map each gap → {gapId, conversionImpact label, suggestedFix, ...}        │
│    sort by: severityWeight (high=3 med=2 low=1) DESC                         │
│            → conversionImpactWeight (policy=3, desc/faq=2, tags/schema=2...) │
│    → stored in store_summaries.prioritizedActionPlan (jsonb)                 │
└─────────────────────────────────────────────────────────────────────────────┘

┌─ STEP G: Perception Simulation ─────────────────────────────────────────────┐
│  simulateStorePerception({products, policies, faqPage, storeName}):          │
│    summarizeFaq: count questions (?), check 5 FAQ_TOPICS                     │
│    Sample first 8 products (title, desc 320 chars, tags, reviews, ...)       │
│    chatCompletion(perception prompt, 1800)                                   │
│    → {agentNarrative, unansweredQuestions[], ambiguities[],                  │
│        perceivedStrengths[]}                                                 │
│    Fallback: buildFallbackNarrative (deterministic from counts)              │
│  UPSERT perception_reports                                                   │
└─────────────────────────────────────────────────────────────────────────────┘

┌─ STEP H: Summary Aggregation ───────────────────────────────────────────────┐
│  Compute averages: clarityScore, completenessScore, trustScore, tagScore,    │
│    overallScore across all analyzed products                                 │
│  Count gaps by severity: criticalIssues (high), mediumIssues, lowIssues     │
│  UPSERT store_summaries {all score averages, issue counts, policyScore,      │
│    consistencyScore, totalProducts, analyzedProducts, pendingFixes,          │
│    prioritizedActionPlan, updatedAt}                                         │
└─────────────────────────────────────────────────────────────────────────────┘

┌─ STEP I: Finalize ──────────────────────────────────────────────────────────┐
│  UPDATE stores SET status='analyzed', lastAnalyzed=now(), overallScore       │
│  INSERT activity 'analysis_completed'                                        │
└─────────────────────────────────────────────────────────────────────────────┘

Error path (any unhandled throw):
  UPDATE stores SET status='error'
  INSERT activity 'analysis_failed' {errorMessage}
```

**Rough timing on a 50-product store:**
- Ingestion (products + page signals): ~15–25s (network-bound, 8 concurrent)
- Analysis (50 products, concurrency=5): ~30–50s (10 batches × AI call)
- Fix generation (subset, concurrency=5): ~5–10s
- Consistency + Perception: ~3–5s
- **Total: 50–90s for 50 products**

---

## 9. Fix Apply Flow

```
POST /stores/:storeId/fixes/:fixId/apply

1. Load fix from DB → 404 if missing
   If status==="applied" → idempotent early return

2. contentToApply = improvedContent (body override) || fix.improvedContent

3. Shopify write-back (only if productId exists AND type !== "structure"):
   updateShopifyProduct(domain, token, shopifyProductId, {type, content})
     → mutation productUpdate($input: ProductInput!)
     Mapping:
       description → descriptionHtml
       tags        → content.split(",").map(trim)
       title       → title
     Returns {success: bool, error?: string}

   If success:
     Mirror locally: UPDATE products SET {description|tags|title}
     verifyShopifyUpdate(domain, token, shopifyProductId, {type, content})
       → query product(id){ title, descriptionHtml, tags }
       → compare: title (trim-equal), desc (first 100 chars stripped), tags (all applied tags present)
       → shopifySynced = verified bool
     If verifyShopifyUpdate throws → shopifySynced = true (⚠ trust-the-mutation fallback)

4. UPDATE fixes SET status='applied', appliedAt, shopifySynced, shopifyError

5. Score bump: UPDATE products SET overallScore = min(100, current + estimatedScoreImprovement)
   ⚠ ALL gaps for this product marked isFixed=true (not just the related gap)

6. INSERT activity 'fix_applied'
7. Recount pendingFixes/appliedFixes → UPDATE store_summaries

Response: {fixId, success:true, shopifySynced, shopifyError}
```

---

## 10. Webhook Real-Time Sync

```
Shopify → POST /api/shopify/webhooks/products-update
          POST /api/shopify/webhooks/products-delete

Authentication:
  HMAC-SHA256 of rawBody using SHOPIFY_CLIENT_SECRET   ← ⚠ wrong var (should be SHOPIFY_API_SECRET)
  timingSafeEqual(computed, x-shopify-hmac-sha256 header)
  Requires rawBody (captured in express.json verify hook)

ACK: 200 immediately (before processing — Shopify retries if no 200 in 5s)

PRODUCTS_UPDATE (setImmediate):
  Parse payload {id, title, body_html, tags, images, variants, product_type, vendor}
  Look up store by normalized domain
  UPDATE products SET {title, description, tags, productType, vendor, imageUrl, price,
    aiQaCachedAt=null}                                ← cache bust
  INSERT activity 'product_updated'

PRODUCTS_DELETE (setImmediate):
  DELETE products WHERE shopifyProductId AND storeId
  INSERT activity 'product_deleted'

Webhooks registered on store connect:
  Topics: PRODUCTS_UPDATE, PRODUCTS_DELETE
  registerStoreWebhooks(domain, token, APP_BASE_URL)
    → webhookSubscriptionCreate GQL mutation per topic
    → errors silently swallowed (no log, no UI indicator)
```

---

## 11. On-Demand AI Features (Cached)

All live in `lib/ai-features.ts`. Cache TTL = 24 hours. Check pattern: if `cachedAt` exists and age < TTL, return cached result; else run AI and write back.

| Feature | Endpoint | Cache | Input | AI Prompt |
|---------|----------|-------|-------|-----------|
| Query Simulation | `GET /stores/:id/query-simulation` | `store_summaries.querySimulation*` | 15 products (title/type/tags/price/descWords) | 6 realistic buyer queries → recommend/not, reasoning, missingInfo, confidence 0-100 |
| Topical Authority | `GET /stores/:id/topical-authority` | `store_summaries.topicalAuthority*` | All products with spec-detection | Topic clusters: coverageScore, gaps[] |
| Internal Links | `GET /stores/:id/internal-links` | `store_summaries.internalLinks*` | First 20 products | Up to 12 link suggestions: complementary / alternative / same-category / upsell |
| AI Product Q&A | `GET /stores/:id/products/:pid/ai-qa` | `products.aiQa*` (busted by webhook) | Product + 5 hard-coded buyer questions | canAnswer: bool, answer, missingInfo for each |
| Perception | `GET /stores/:id/perception` | `perception_reports` (set at analysis time) | Stored report | Already computed |
| FAQ Schema | `GET /stores/:id/faq-schema` | None (always regenerated) | 8 products + unansweredTopics | 8-10 Q&A pairs → FAQPage JSON-LD |
| LLMs.txt | `GET /stores/:id/llms-txt` | None (always regenerated) | Store + products + policies | Markdown llms.txt following emerging standard |
| Tag Optimizer | `GET /stores/:id/tag-optimizer` | None (always regenerated) | Per-product tags | Returned from DB (rule-engine suggestedTags) |
| Benchmark | `GET /stores/:id/benchmark` | None | Other stores' products | P90 if ≥10 analyzed products exist, else aspirational constants |

---

## 12. Database Schema Summary

```
users          id, googleId (unique), email (unique), name, avatarUrl, createdAt
stores         id, domain (unique), name, accessToken, desiredPositioning,
               status, productsFetched, lastAnalyzed, overallScore, productCount,
               userId (nullable ⚠ no FK), createdAt
products       id, storeId, shopifyProductId, title, description, productType,
               vendor, tags[], collections[], imageUrl, price (text),
               reviewCount, reviewRating, hasStructuredData,
               clarityScore, completenessScore, trustScore, tagScore, overallScore,
               issueCount, hasAppliedFixes, aiPerceptionSummary, suggestedTags[],
               aiQaResults (jsonb), aiQaCachedAt,
               analyzedAt, createdAt
gaps           id, storeId, productId (nullable = store-level gap), category,
               severity, title, description, suggestion, evidence,
               impactScore (default 50), effortLevel (default "medium"),
               ruleId, isFixed, createdAt
fixes          id, storeId, productId, type, status (default "pending"),
               title, originalContent, improvedContent, editedContent,
               explanation, estimatedScoreImprovement,
               shopifySynced, shopifyError, createdAt, appliedAt
activity       id, storeId, type, message, metadata (jsonb), createdAt
store_summaries storeId (PK), clarityScore, completenessScore, trustScore, tagScore,
               overallScore, consistencyScore, policyScore,
               criticalIssues, mediumIssues, lowIssues,
               pendingFixes, appliedFixes,
               totalProducts, analyzedProducts,
               prioritizedActionPlan (jsonb),
               querySimulationResults (jsonb), querySimulationCachedAt,
               topicalAuthorityResults (jsonb), topicalAuthorityCachedAt,
               internalLinksResults (jsonb), internalLinksCachedAt,
               updatedAt
consistency_reports  storeId (PK), overallConsistencyScore, issues (jsonb),
               suggestedStructure[], analyzedAt
perception_reports   storeId (PK), agentNarrative, unansweredQuestions (jsonb),
               ambiguities (jsonb), perceivedStrengths (jsonb),
               faqPageFound, faqPageTitle, faqQuestionCount, faqGaps (jsonb),
               updatedAt
conversations  (legacy — no active routes reference this table)
messages       (legacy — no active routes reference this table)
```

---

## 13. AI/Deterministic Boundary

This is the most important design decision. The boundary is explicit and intentional:

```
DETERMINISTIC (rules)          │  AI (LLM)
─────────────────────────────  │  ─────────────────────────────────────
All gap detection (25 rules)   │  clarityScore NLP nuance (40% weight)
Completeness scoring           │  aiPerceptionSummary (2-sentence blurb)
Trust scoring                  │  suggestedTags (up to 8)
Tag scoring                    │  Fix content generation
Policy quality detection       │  Consistency analysis
Gap prioritization (regex→rank)│  Query simulation
Structured-data detection      │  Topical authority clustering
Review signal extraction       │  Internal link suggestions
Verification (write-back check)│  Store perception narrative
Benchmark P90 computation      │  FAQ schema Q&A generation
Cache invalidation logic       │  LLMs.txt content
                               │  AI Q&A per product
─────────────────────────────  │  ─────────────────────────────────────
Fast, free, traceable, testable│  Slow, paid, non-deterministic, cached
```

**AI failure is non-fatal for core scoring.** Every AI call has a rule-based fallback. The store's score will be lower without AI (clarity gets no uplift) but will not be wrong or missing.

---

## 14. Scalability Assessment

### Current design — what scales

| Component | Current | Verdict |
|-----------|---------|---------|
| Database | Neon PostgreSQL (serverless) | ✅ scales automatically |
| Frontend | Static Vite SPA | ✅ CDN-deployable, no backend dependency |
| AI fallback chain | Gemini → Groq → Cerebras | ✅ survives one provider outage |
| Product cap (250) | Hard cap in ingestion | ✅ prevents runaway analysis cost |
| Concurrency (5) | `p-limit` in analysis batches | ✅ keeps LLM costs predictable |
| Caching | 24h DB cache on expensive endpoints | ✅ reuses results across users |
| Webhook ACK | 200 before setImmediate | ✅ correct — avoids Shopify retries |

### What does NOT scale

**1. In-process analysis with setImmediate**
Analysis runs on the same Node.js event loop thread. A 50-product store blocks the event loop for 1–2 minutes. With 10 concurrent analysis requests, all other API requests queue behind them.
- Risk: API timeouts, slow auth responses, health checks fail
- Fix: Move to a real queue (BullMQ + Redis, or Trigger.dev)

**2. MemoryStore for sessions**
Sessions are in process memory. One server = fine. Two servers = users randomly get logged out between requests.
- Fix: `connect-pg-simple` pointing at Neon (zero new infra)

**3. No job status endpoint**
Client has no way to know if an analysis is still running (server restarted, crashed). Polling `/summary` works by accident because `lastAnalyzed` changes on completion.
- Fix: Persist job rows in DB, expose `GET /jobs/:jobId`

**4. Hard delete on re-analyze**
Every analysis does `DELETE products WHERE storeId` + full re-ingest. For a 250-product store this is a 30s gap where products are gone from the DB. Concurrent reads return empty lists.
- Fix: Soft-replace — mark old rows as `version = N`, insert new as `version = N+1`, swap in a transaction

**5. No horizontal sharding of analysis**
A single store's 250 products all run on one worker. There is no mechanism to distribute a single analysis job across workers.
- Fix: In a job queue world, each product analysis batch becomes an individual task

**6. All products fetched fresh every analysis**
Even if only 3 products changed, all 250 are re-fetched and re-analyzed. Webhooks keep products fresh incrementally — but analysis always starts from scratch.
- Fix: Track `shopifyUpdatedAt` per product; only re-analyze products that changed since last analysis

**7. N+1 style Shopify GQL + HTTP requests in enrichment**
`enrichWithPageSignals` fetches one storefront HTTP page per product (capped at batch-8). For 250 products = 32 serial batches × 6s timeout = up to 192s. If Shopify rate-limits these, they fail silently.
- Fix: Cache storefront HTML per product URL with short TTL (1h); parallelize within rate-limit budget

**8. Linear scan for benchmark P90**
`GET /benchmark` selects ALL products from ALL stores where `analyzedAt IS NOT NULL`, loads them into memory, and sorts. At 100 stores × 250 products = 25,000 rows in memory per benchmark request.
- Fix: Materialized view or scheduled job that pre-computes P90 values once per hour

**9. `prioritizedActionPlan` stored as a 5,000-row jsonb blob**
The full ranked action plan for every store is stored inline in `store_summaries`. At scale this creates wide rows and slow reads for callers who only need the summary scores.
- Fix: Move to a separate `action_plan_items` table with pagination

**10. No queue/backpressure for concurrent analyses**
If 20 merchants all click "Run Analysis" at the same time, 20 concurrent `setImmediate` calls each make 50+ LLM API calls simultaneously. Gemini has a 60 RPM free-tier limit; this will cause provider failures for everyone.
- Fix: Rate-limit analysis triggers per store (once per 10 min), globally limit concurrent analysis jobs

---

## 15. Issues Specific to the Pipeline

### Pipeline-level bugs

| # | Severity | Issue | Location |
|---|----------|-------|----------|
| P-1 | CRITICAL | Webhook HMAC reads `SHOPIFY_CLIENT_SECRET` but OAuth uses `SHOPIFY_API_SECRET` — every webhook returns 401 | `webhooks.ts:43,125` |
| P-2 | CRITICAL | jobId never persisted — server restart drops in-progress analysis silently | `routes/analysis.ts:32` |
| P-3 | HIGH | Hard delete of products/gaps/fixes at start of analysis — concurrent reads see empty lists during the 30–60s run | `analysis.ts:71–73` |
| P-4 | HIGH | `shopifySynced = true` when `verifyShopifyUpdate` throws — silent false-positive | `fixes.ts:107` |
| P-5 | HIGH | All gaps for a product marked `isFixed` on any single fix apply — unrelated gaps incorrectly cleared | `fixes.ts:134–137` |
| P-6 | MEDIUM | Fix generation skips `title` type — only description and tags fixes are auto-generated; title issues require manual "Generate Fix" | `analysis.ts step D` |
| P-7 | MEDIUM | `structure` and `schema` fix types written to DB but never synced to Shopify; `shopifySynced` flag is misleading | `fixes.ts:65` |
| P-8 | MEDIUM | `enrichWithPageSignals` errors silently — if storefront is password-protected or rate-limited, `hasStructuredData` and `reviewCount` fall back to metafield-only values with no log | `shopify-ingestion.ts:292` |
| P-9 | MEDIUM | Benchmark always returns aspirational constants in demos with < 10 analyzed products — no UI indicator | `analysis.ts:569` |
| P-10 | MEDIUM | `analyzeStoreConsistency` samples first 10 products regardless of distribution — if first 10 are all the same type, consistency score is misleading | `ai-analyzer.ts:128` |
| P-11 | LOW | AI provider fallback is silent to the end user — if Gemini is down, scores degrade silently (AI clarity = rule clarity, no suggestions) | `ai-client.ts` |
| P-12 | LOW | `BENCHMARK_SCORES` constant exported from `ai-analyzer.ts` but never imported — dead code | `ai-analyzer.ts:39–49` |
| P-13 | LOW | `apply` and `bulk-apply` handlers share ~80% logic but are copied — bug P-4/P-5 must be fixed in both places | `fixes.ts` |

### Suggested Pipeline Improvements

**Short-term (before submission)**
1. Fix P-1: change `SHOPIFY_CLIENT_SECRET` → `SHOPIFY_API_SECRET` in webhooks.ts
2. Fix P-5: mark only gaps with matching `ruleId` or `category` as fixed, not all gaps for the product
3. Fix P-4: on verifyShopifyUpdate throw, set `shopifySynced=false` and `shopifyError="Verification failed — check Shopify manually"`
4. Add Zod schema for all LLM JSON responses (clarityScore range, string non-empty, tag array items)
5. Log `enrichWithPageSignals` failures at warn level with product handle

**Medium-term (post-hackathon)**
1. Replace `setImmediate` with BullMQ + Redis; persist job rows; expose `GET /jobs/:jobId`
2. Replace MemoryStore with `connect-pg-simple`
3. Soft-replace products during re-analysis (version column + transaction swap)
4. Only re-analyze products whose `webhookUpdatedAt > lastAnalyzedAt`
5. Add per-store analysis rate limit (once per 10 minutes minimum)
6. Pre-compute benchmark P90 with a scheduled job; cache result in `store_summaries`
7. Separate `action_plan_items` table instead of jsonb blob in `store_summaries`

**Long-term (production)**
1. Stream analysis progress via SSE or WebSocket (step names + percentage)
2. Distribute analysis across workers — one BullMQ job per product batch
3. Tiered analysis: fast rule-only pass (<5s) immediately, then AI layer async
4. Multi-tenant isolation: enforce `userId` filter on all store queries
5. Add OpenTelemetry tracing across the analysis pipeline (ingestion → rules → AI → persist)

---

## 16. Flow Summary Diagram

```
Merchant triggers "Run Analysis"
          │
          ▼
POST /api/stores/:storeId/analyze
  → 202 {jobId}  (instant response)
          │
          ▼ setImmediate
┌─────────────────────────────────────────────────────────────┐
│  A. INGEST                                                  │
│     Shopify GQL → products (250 max)                        │
│     + Shopify GQL → policies                                │
│     + Shopify GQL → FAQ page                               │
│     + Storefront HTTP → JSON-LD signals (batch 8, 6s ea)   │
│                                  │                          │
│  B. ANALYZE (concurrency = 5)    │                          │
│     Rule engine (25 rules)       │                          │
│     + AI clarity (Gemini→Groq→Cerebras)                     │
│     = scores + violations        │                          │
│                                  │                          │
│  C. PERSIST                      │                          │
│     UPDATE products (scores)     │                          │
│     INSERT gaps (violations)     │                          │
│                                  │                          │
│  D. GENERATE FIXES (conc = 5)    │                          │
│     AI fix for completeness<70   │                          │
│     AI fix for tags<65           │                          │
│     INSERT fixes (pending)       │                          │
│                                  │                          │
│  E. CONSISTENCY                  │                          │
│     AI → tone/structure analysis │                          │
│     UPSERT consistency_reports   │                          │
│                                  │                          │
│  F. ACTION PLAN                  │                          │
│     Deterministic rank all gaps  │                          │
│     (severityWeight × conversionImpactWeight)               │
│                                  │                          │
│  G. PERCEPTION                   │                          │
│     AI → agent narrative         │                          │
│     UPSERT perception_reports    │                          │
│                                  │                          │
│  H. SUMMARIZE                    │                          │
│     Avg scores, count issues     │                          │
│     UPSERT store_summaries       │                          │
│                                  │                          │
│  I. FINALIZE                     │                          │
│     UPDATE stores status=analyzed│                          │
│     INSERT activity completed    │                          │
└─────────────────────────────────────────────────────────────┘
          │
          ▼
Client polls GET /stores/:id/summary  (TanStack Query refetchInterval)
→ when lastAnalyzed changes → dashboard refreshes with new scores
```

---

*Document verified against source code — April 2026. Re-verify after any changes to `artifacts/api-server/src/lib/` or `routes/`.*
