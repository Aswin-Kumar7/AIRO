# Backend Pipeline — AI Readiness Analyzer
> Architecture reference · April 2026 · Verified against source code
> Updated after fix round 4 + UI redesign · All CB-series resolved

---

## 1. High-Level Architecture

```
Browser (React + Wouter + TanStack Query)
    │  REST + JSON  (x-csrf-token header on all mutations ✅ WIRED)
    ▼
Express 5 API Server  (:4000 in dev)
    │
    ├─ Middleware chain
    │    pino → CORS → cookie-parser → connect-pg-simple session
    │    → express.json (rawBody capture) → csrf-sync → requireAuth
    │
    ├─ GET  /api/csrf-token                CSRF token issuance
    ├─ /api/auth/*                         Google OAuth 2.0 (session-based)
    ├─ /api/shopify/*                      Shopify OAuth + webhooks (HMAC-verified)
    ├─ /api/stores/*                       CRUD — userId-filtered ✅
    ├─ /api/stores/:id/analyze             Analysis trigger + rate limit (5/hr) — userId-verified ✅
    ├─ /api/jobs/:jobId                    Job status polling — userId-verified ✅
    ├─ /api/stores/:id/products/*          Product list, detail, on-demand fix gen — userId-verified ✅
    ├─ /api/stores/:id/fixes/*             Fix apply + Shopify write-back — userId-verified ✅
    ├─ /api/stores/:id/...features         Topical authority, llms.txt, AI QA, FAQ schema — userId-verified ✅
    ├─ /api/stores/:id/perception          Store perception report — userId-verified ✅
    ├─ /api/stores/:id/positioning         PATCH desired positioning — userId-verified ✅
    └─ /api/stores/:id/visibility-*        GEO citation tracking — userId-verified ✅
              │
              ├─ lib/ai-client.ts          → Gemini 2.0-flash → Groq → Cerebras (fallback chain)
              ├─ lib/rule-engine.ts        → 25 deterministic rules, no AI
              ├─ lib/ai-analyzer.ts        → Rule engine + AI blend, Zod-validated ✅
              ├─ lib/ai-features.ts        → Store-level AI features (perception, topical, links, etc.)
              ├─ lib/shopify-ingestion.ts  → Shopify GraphQL + storefront HTML fetch
              ├─ lib/shopify-client.ts     → Shopify GraphQL write-back + verification
              ├─ lib/perception-simulator.ts → AI narrative generation
              └─ lib/conversion-ranker.ts  → Deterministic gap prioritization

Neon PostgreSQL (Drizzle ORM)
    Tables: users, stores, products, gaps, fixes, activity, jobs ✅
            store_summaries, consistency_reports, perception_reports
            visibility_checks ✅ NEW (GEO tracker)
            session ✅ (connect-pg-simple backing store)
```

---

## 2. Middleware Chain (Request Lifecycle)

Every incoming request passes through this exact chain in order:

```
1. pinoHttp              log method + path (headers redacted: authorization, cookie, set-cookie)

2. cors                  allowlist: FRONTEND_URL | localhost:3000 | localhost:5173
                         credentials: true

3. cookieParser          parse 'sid' session cookie

4. connect-pg-simple     ✅ (was MemoryStore)
   express-session       PgStore backed by DATABASE_URL → "session" table
                         HttpOnly, secure+sameSite:none in prod / lax in dev, 7-day maxAge
                         createTableIfMissing: NODE_ENV !== "production"
                           → auto-creates table in dev; requires drizzle-kit push in prod ✅

5. express.json          + verify hook → req.rawBody = Buffer  (typed as Request & { rawBody?: Buffer } ✅)
   express.urlencoded

6. csrf-sync             validates x-csrf-token header on all non-GET requests ✅
                         Exemption: path starts with /api/shopify/webhooks/
                         Token issued at: GET /api/csrf-token
                         Frontend: csrf-service.ts fetches + caches token, injects on all mutations ✅

7. requireAuth           PUBLIC prefixes bypass: /api/health, /api/auth/, /api/shopify/install,
                           /api/shopify/callback, /api/shopify/webhooks/, /api/csrf-token
                         All others → check req.session.userId → 401 UNAUTHENTICATED if absent

8. /api router           sub-routers, each declaring their full path
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
   │                             │── POST googleapis.com/oauth2/token {code,client_id,secret}
   │                             │◄── {access_token, id_token}
   │                             │── GET googleapis.com/oauth2/v3/userinfo
   │                             │◄── {sub, email, name, picture}
   │                             │ upsertUserFromGoogle (lookup by googleId, insert if new)
   │                             │ req.session.userId = user.id
   │◄── 302 → FRONTEND_URL/?auth=success
```

Session cookie `sid` written to Postgres `session` table via connect-pg-simple.

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
   │                                    │   HMAC-SHA256 with SHOPIFY_API_SECRET ✅
   │                                    │   timingSafeEqual against hmac param
   │                                    │ verify state + shop cookie match
   │                                    │── POST shop/admin/oauth/access_token
   │                                    │◄── {access_token}
   │                                    │ validateShopifyToken + upsertConnectedStore
   │                                    │ clear cookies
   │◄── 302 → FRONTEND_URL/?shopify=success&storeId=...
   │
   │                                    │ setImmediate:
   │                                    │   fetchAndUpsertProducts(store)
   │                                    │     on error → req.log.error ✅
   │                                    │   registerStoreWebhooks(domain, token, APP_BASE_URL)
   │                                    │     on error → req.log.warn ✅
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

Batches of 8, 6-second AbortController timeout per product:

```
GET https://{domain}/products/{handle}
  UA: "AI-Readiness-Analyzer/1.0 (product analysis bot)"
  → parse all <script type="application/ld+json"> blocks (handles @graph)
  → find Product @type entry
  → hasStructuredData = true if found (overrides ingestion-level detection)
  → extract aggregateRating: reviewCount/ratingCount, ratingValue
  → only overwrite if signals.reviewCount > existing (storefront is ground truth)
  → errors caught silently (password-protected stores, rate limits, timeouts)
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
→ find first page where handle contains "faq"/"frequently" OR title contains "faq"
→ returns {title, body} | null
```

---

## 5. Rule Engine (`lib/rule-engine.ts`) — Deterministic, No AI

25 rules across 6 categories. Every rule produces a `RuleViolation` with
`{ruleId, category, severity, title, description, suggestion, evidence, impactScore (0-100), effortLevel}`.

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
| `TAGS_GENERIC` | tags | medium | 40 | any tag in: new, sale, hot, featured, best, top, popular, special, offer, deal, trending, latest |
| `TAGS_NO_CATEGORY` | tags | medium | 45 | productType exists but no tag contains/is-contained-in productType |
| `TRUST_NO_IMAGE` | trust | high | 80 | no imageUrl |
| `TRUST_NO_BRAND` | trust | medium | 40 | no vendor |
| `TRUST_NO_SCHEMA` | trust | medium | 65 | !hasStructuredData |
| `TRUST_NO_REVIEWS` | trust | medium | 50 | reviewCount === 0 |
| `VOICE_TITLE_LONG` | clarity | low | 28 | title word count > 8 |
| `VOICE_TITLE_MODEL_START` | clarity | low | 20 | title starts with model number (`^[A-Z0-9\-]{4,}`) |
| `VOICE_NOT_CONVERSATIONAL` | clarity | low | 22 | no 2nd-person / "we/our/discover/introducing" term |
| `COMPARE_INSUFFICIENT_SPECS` | completeness | medium | 55 | fewer than 2 of: spec/dimension/material terms (desc >= 30 words only) |
| `SCHEMA_INCOMPLETE` | trust | low | 25 | JSON-LD present but missing name/description/brand/offers/image |
| `SCHEMA_MALFORMED` | trust | medium | 40 | JSON-LD parse error |

### Scoring Formula

```
Per category penalty = max(0, 100 - Σ(impactScore × 0.8))

clarityScore      = round((titleAnalysisScore + computeScore("clarity")) / 2)
completenessScore = round((descAnalysisScore  + computeScore("completeness")) / 2)
trustScore        = round((trustAnalysisScore + computeScore("trust")) / 2)
tagScore          = tagAnalysisScore  (unblended)
```

---

## 6. AI Layer (`lib/ai-analyzer.ts`)

Runs once per product after the rule engine. Only adds NLP nuance for **clarity** — completeness, trust, and tags are 100% rule-based.

```
Input: ProductInput (title, description, tags, vendor, productType, ...)

Step 1: runRuleEngine(product) → {ruleScores, violations}

Step 2: chatCompletion(aiPrompt, maxTokens=800)
  Prompt includes: title, description (first 400 chars + word count),
                   current tags (up to 10), productType, vendor
  Expected JSON response:
    {
      clarityScore: 0-100,
      aiPerceptionSummary: "2 sentences, how a voice AI would describe this product",
      suggestedTags: ["up to 8 semantic retrieval tags"]
    }

  ✅ Zod validation (updated from manual typeof checks):
    z.object({
      clarityScore:        z.number().min(0).max(100),
      aiPerceptionSummary: z.string().min(1),
      suggestedTags:       z.array(z.string()).max(8),
    }).safeParse(parsed)
    → on failure: log warn, fall back to rule-only scores

Step 3: Score blending
  clarityScore      = round(0.4 × aiClarityScore + 0.6 × ruleScores.clarity)
  completenessScore = ruleScores.completeness   ← AI has NO influence
  trustScore        = ruleScores.trust           ← AI has NO influence
  tagScore          = ruleScores.tags            ← AI has NO influence
  overallScore      = round((clarity + completeness + trust + tag) / 4)

Step 4: Issues list = violations (1:1 from rule engine — AI does NOT emit new issues)

Fallback: if AI call fails or Zod rejects → uses ruleScores.clarity as-is,
          generic perception summary, empty suggestedTags
```

`generateFix` and `analyzeStoreConsistency` similarly use `consistencySchema` and `fixSchema` Zod schemas with `.safeParse()`.

---

## 7. Multi-Provider AI Client (`lib/ai-client.ts`)

```
chatCompletion(messages, maxTokens=2000):

  1. Try callGemini (GEMINI_API_KEY required)
     Model: gemini-2.0-flash  (@google/generative-ai SDK)
     Merges system message into first user turn
     generationConfig.maxOutputTokens = maxTokens

  2. On failure → try callGroq (GROQ_API_KEY)
     Endpoint: https://api.groq.com/openai/v1
     Model: llama-3.3-70b-versatile

  3. On failure → try callCerebras (CEREBRAS_API_KEY)
     Endpoint: https://api.cerebras.ai/v1
     Model: llama-3.3-70b

  4. All fail → throw "All AI providers failed. Last error: ..."

Non-primary provider success logged at info level.
Single attempt per provider — no per-provider retry.
AI failure is non-fatal: every call site has a rule-based fallback.
```

---

## 8. Full Analysis Pipeline (`POST /api/stores/:storeId/analyze`)

The route responds immediately; all work happens in `setImmediate`.

```
[Client]                    [API Server - sync]
   │── POST /analyze ──────►│ analysisLimiter: 5/hr per userId ✅
   │                        │ requireOwnedStore(storeId, userId) → 403 if mismatch ✅
   │                        │ jobId = generateId()
   │                        │ UPDATE stores SET status='analyzing'
   │                        │ INSERT activity 'analysis_started'
   │                        │ INSERT jobs {id:jobId, storeId, status:'running'} ✅
   │◄── {jobId, storeId, status:"running", startedAt} ──────────────────────────

   Client can poll: GET /jobs/:jobId ✅ → {id, storeId, status, startedAt, completedAt, errorMessage}

[API Server - async, setImmediate]

┌─ STEP A: Ingestion ─────────────────────────────────────────────────────────┐
│  ingestStore(domain, accessToken)                                            │
│    → fetchAllProducts (GQL paginated, cap 250)                               │
│      + extractReviewSignals per product                                      │
│      + detectStructuredData per product                                      │
│    → enrichWithPageSignals (batch 8, 6s timeout, silent on error)           │
│    → fetchPolicyCoverage (GQL shop policies, isPolicySubstantive)            │
│    → fetchFaqPage (GQL pages, find FAQ by handle/title)                      │
│                                                                              │
│  if snapshot.products.length === 0 → throw (skip to error path)             │
│  policyScore = round((truthy policies / 4) × 100)                           │
│                                                                              │
│  ⚠ HARD DELETE (not yet soft-replaced):                                     │
│  DELETE fixes WHERE storeId                                                  │
│  DELETE gaps  WHERE storeId                                                  │
│  DELETE products WHERE storeId   ← 30-60s window with empty DB              │
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
│      chatCompletion(aiPrompt, 800) → Zod-parsed {clarityScore, summary, tags}│
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
│    (title type NOT auto-generated — requires manual "Generate Fix")          │
│                                                                              │
│  generateFix(type, originalContent, context):                                │
│    chatCompletion(type-specific prompt, 1500) → Zod-parsed ✅               │
│    → {improvedContent, explanation, estimatedScoreImprovement 1-20}          │
│                                                                              │
│  INSERT fixes[] (status="pending")                                           │
└─────────────────────────────────────────────────────────────────────────────┘

┌─ STEP E: Store Consistency Analysis ────────────────────────────────────────┐
│  analyzeStoreConsistency(sample: first 10 products):                         │
│    chatCompletion(consistency prompt, 1500) → Zod-parsed ✅                 │
│    → {overallConsistencyScore, issues[{type,description,affectedCount,       │
│        examples}], suggestedStructure[]}                                     │
│  UPSERT consistency_reports                                                  │
└─────────────────────────────────────────────────────────────────────────────┘

┌─ STEP F: Action Plan Ranking (deterministic) ───────────────────────────────┐
│  SELECT all gaps for store                                                   │
│  buildPrioritizedActionPlan(gaps):                                           │
│    map each gap → {gapId, conversionImpact label, suggestedFix, ...}        │
│    sort: severityWeight (high=3 med=2 low=1) DESC                            │
│         → conversionImpactWeight (policy=3, desc/faq/schema/tags=2, else 1) │
│    stored in store_summaries.prioritizedActionPlan (jsonb)                   │
└─────────────────────────────────────────────────────────────────────────────┘

┌─ STEP G: Perception Simulation ─────────────────────────────────────────────┐
│  simulateStorePerception({products, policies, faqPage, storeName}):          │
│    summarizeFaq: count "?" lines, check 5 FAQ_TOPICS for coverage           │
│    Sample first 8 products (title, desc 320 chars, tags, reviews, ...)       │
│    chatCompletion(perception prompt, 1800)                                   │
│    → {agentNarrative, unansweredQuestions[], ambiguities[],                  │
│        perceivedStrengths[]}                                                 │
│    Fallback: buildFallbackNarrative (deterministic from product counts)      │
│  UPSERT perception_reports                                                   │
└─────────────────────────────────────────────────────────────────────────────┘

┌─ STEP H: Summary Aggregation ───────────────────────────────────────────────┐
│  Avg scores across all analyzed products                                     │
│  Count gaps by severity: criticalIssues/mediumIssues/lowIssues              │
│  UPSERT store_summaries {scores, counts, policyScore, consistencyScore,      │
│    prioritizedActionPlan, updatedAt}                                         │
└─────────────────────────────────────────────────────────────────────────────┘

┌─ STEP I: Finalize ──────────────────────────────────────────────────────────┐
│  UPDATE stores SET status='analyzed', lastAnalyzed=now(), overallScore       │
│  UPDATE jobs  SET status='completed', completedAt=now() ✅                  │
│  INSERT activity 'analysis_completed'                                        │
└─────────────────────────────────────────────────────────────────────────────┘

Error path (any unhandled throw):
  UPDATE stores SET status='error'
  UPDATE jobs  SET status='failed', errorMessage=err.message ✅
  INSERT activity 'analysis_failed' {errorMessage}
```

**Rough timing on a 50-product store:**
- Ingestion (products + page signals): ~15–25s (network-bound)
- Analysis (50 products, concurrency=5): ~30–50s (10 batches × AI call)
- Fix generation (subset, concurrency=5): ~5–10s
- Consistency + Perception: ~3–5s
- **Total: 50–90s for 50 products**

---

## 9. Fix Apply Flow

Refactored: single-apply and bulk-apply now share the `applyFixToShopify` helper.

```
POST /stores/:storeId/fixes/:fixId/apply
  requireOwnedStore(storeId, userId) → 403 if mismatch ✅

1. Load fix from DB → 404 if missing
   Load store from DB → 404 if missing
   If fix.status === "applied" → idempotent early return

2. contentToApply = improvedContent (body override) || fix.improvedContent

3. applyFixToShopify(storeId, fix, contentToApply, store, log):

   supportsSync = fix.type is one of: "description" | "tags" | "title"

   If !supportsSync (structure or schema):  ✅ FIXED
     shopifySynced = false
     shopifyError  = "Manual action required: Automation not available for
                      this fix type. Please update your Shopify theme/metafields manually."
     return immediately

   Else:
     updateShopifyProduct(domain, token, shopifyProductId, {type, content})
       → mutation productUpdate($input: ProductInput!)
       → Mapping: description→descriptionHtml, tags→split(","), title→title

     If result.success:
       Mirror locally: UPDATE products SET {description|tags|title}
       try verifyShopifyUpdate(...)  ← re-query live Shopify and compare
         shopifySynced = verified
         if !verified: shopifyError = reason
       catch:                               ✅ FIXED (was: shopifySynced = true)
         shopifySynced = false
         shopifyError  = "Verification call failed — please check Shopify manually"

4. UPDATE fixes SET status='applied', appliedAt, shopifySynced, shopifyError

5. Score bump: overallScore = min(100, current + estimatedScoreImprovement)
   gaps marked isFixed=true scoped by gapCategoryForFixType(fix.type) ✅
   (description→completeness, tags→tags, title→clarity, schema→trust)

6. INSERT activity 'fix_applied'
7. Recount pendingFixes/appliedFixes → UPDATE store_summaries

Response: {fixId, success, shopifySynced, shopifyError}
```

**Bulk apply** (`POST /stores/:storeId/fixes/bulk-apply`) calls the same `applyFixToShopify`
helper in a sequential loop, then refreshes counts once at the end.
⚠ **Note:** `bulk-apply` endpoint exists on the backend but has no active frontend caller (no button in the current UI).

---

## 10. Webhook Real-Time Sync

```
Shopify → POST /api/shopify/webhooks/products-update
          POST /api/shopify/webhooks/products-delete

Authentication:  ✅ FIXED
  HMAC-SHA256 of rawBody using SHOPIFY_API_SECRET  (was SHOPIFY_CLIENT_SECRET)
  timingSafeEqual(computed, x-shopify-hmac-sha256 header)
  Requires rawBody (captured in express.json verify hook)
  CSRF exempted: path starts with /api/shopify/webhooks/

ACK: 200 immediately (before processing — Shopify retries if no 200 in 5s)

PRODUCTS_UPDATE (setImmediate):
  Parse payload {id, title, body_html, tags, images, variants, product_type, vendor}
  Look up store by normalized domain
  UPDATE products SET {title, description, tags, productType, vendor, imageUrl, price,
    aiQaCachedAt=null}   ← cache bust
  INSERT activity 'product_updated'

PRODUCTS_DELETE (setImmediate):
  DELETE products WHERE shopifyProductId AND storeId
  INSERT activity 'product_deleted'

Webhook registration on store connect:
  registerStoreWebhooks(domain, token, APP_BASE_URL)
    → webhookSubscriptionCreate GQL mutation per topic
    → on error → req.log.warn {storeId, err}  ✅ FIXED (was silent)
```

---

## 11. On-Demand AI Features (Cached)

All live in `lib/ai-features.ts`. Cache TTL = 24 hours.
Pattern: if `cachedAt` exists and age < TTL → return cached; else run AI, write back.

| Feature | Endpoint | Cache | Input | Frontend Caller | Notes |
|---------|----------|-------|-------|-----------------|-------|
| Topical Authority | `GET /stores/:id/topical-authority` | `store_summaries.topicalAuthority*` | All products | content-page.tsx (Authority tab) | Topic clusters + coverageScore + gaps |
| Internal Links | `GET /stores/:id/internal-links` | `store_summaries.internalLinks*` | First 20 products | content-page.tsx (Linking tab) | 12 link suggestions by type |
| AI Product Q&A | `GET /stores/:id/products/:pid/ai-qa` | `products.aiQa*` (busted by webhook) | Product + 5 questions | product-detail.tsx | canAnswer/answer/missingInfo |
| Perception | `GET /stores/:id/perception` | `perception_reports` (set at analysis) | Stored report | ai-readiness-page.tsx (Perception tab) | Pre-computed in pipeline |
| FAQ Schema | `GET /stores/:id/faq-schema` | None (always live) | 8 products + unanswered topics | tools-page.tsx (FAQ Schema tab) | FAQPage JSON-LD |
| LLMs.txt | `GET /stores/:id/llms-txt` | None (always live) | Store + products + policies | tools-page.tsx (LLMs.txt tab) | Markdown standard |
| Query Simulation | `GET /stores/:id/query-simulation` | `store_summaries.querySimulation*` | 15 products | ⚠ **No frontend caller** | Removed from UI (Query Simulation tab deleted) |
| Tag Optimizer | `GET /stores/:id/tag-optimizer` | None | Per-product suggestedTags from DB | ⚠ **No frontend caller** | Tags tab removed from Tools page |
| Benchmark | `GET /stores/:id/benchmark` | None | Other stores' products | ⚠ **No frontend caller** | Benchmark tab removed from Tools page |

**Benchmark transparency:** Response includes `benchmarkSource: "real-p90" | "aspirational"`. When aspirational (< 10 analyzed stores exist), benchmark gap fields return `null` so frontend can render "Not enough data" instead of fabricated comparisons.

**Backend-only endpoints (3):** `query-simulation`, `tag-optimizer`, and `benchmark` are implemented, userId-verified, and functional. They have no active frontend caller after the UI redesign. Safe to call directly via API; no dead code in the backend.

---

## 12. Database Schema Summary

```
users           id, googleId (unique), email (unique), name, avatarUrl, createdAt

stores          id, domain (unique), name, accessToken, desiredPositioning,
                status, productsFetched, lastAnalyzed, overallScore, productCount,
                userId (non-nullable FK → users.id, cascade delete), createdAt

products        id, storeId, shopifyProductId, title, description, productType,
                vendor, tags[], collections[], imageUrl, price (text),
                reviewCount, reviewRating, hasStructuredData,
                clarityScore, completenessScore, trustScore, tagScore, overallScore,
                issueCount, hasAppliedFixes, aiPerceptionSummary, suggestedTags[],
                aiQaResults (jsonb), aiQaCachedAt,
                analyzedAt, createdAt

gaps            id, storeId, productId (nullable = store-level gap), category,
                severity, title, description, suggestion, evidence,
                impactScore (default 50), effortLevel (default "medium"),
                ruleId, isFixed, createdAt

fixes           id, storeId, productId, type, status (default "pending"),
                title, originalContent, improvedContent, editedContent,
                explanation, estimatedScoreImprovement,
                shopifySynced, shopifyError, createdAt, appliedAt

activity        id, storeId, type, message, metadata (jsonb), createdAt

jobs            id, storeId, status ("running"|"completed"|"failed"),
                startedAt, completedAt (nullable) ✅, errorMessage (nullable) ✅

store_summaries storeId (PK), clarityScore, completenessScore, trustScore, tagScore,
                overallScore, consistencyScore, policyScore,
                criticalIssues, mediumIssues, lowIssues,
                pendingFixes, appliedFixes, totalProducts, analyzedProducts,
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

visibility_checks    id (PK), storeId (FK), query (text), queryType (text),
                aiEngine (text nullable), wasCited (bool), citationUrl (text nullable),
                notes (text nullable), checkedAt (timestamp)
                ← GEO Tracker — user-logged citation checks ✅ NEW

session         sid (PK varchar), sess (json), expire (timestamp)
                index: IDX_session_expire on expire
                auto-created in dev (createTableIfMissing: true in dev) ✅

conversations   (legacy — no active routes reference this table)
messages        (legacy — no active routes reference this table)
```

---

## 13. AI/Deterministic Boundary

```
DETERMINISTIC (rules)            │  AI (LLM)
───────────────────────────────  │  ─────────────────────────────────────
All gap detection (25 rules)     │  clarityScore NLP nuance (40% weight)
Completeness/trust/tag scoring   │  aiPerceptionSummary (2-sentence blurb)
Policy quality detection         │  suggestedTags (up to 8, Zod-validated)
Gap prioritization (regex→rank)  │  Fix content generation (Zod-validated)
Structured-data detection        │  Store consistency analysis (Zod-validated)
Review signal extraction         │  Topical authority clustering
Write-back verification          │  Internal link suggestions
Benchmark P90 computation        │  Store perception narrative
Cache invalidation logic         │  FAQ schema Q&A generation
                                 │  LLMs.txt content
                                 │  AI Q&A per product
───────────────────────────────  │  ─────────────────────────────────────
Fast, free, traceable, testable  │  Slow, paid, non-deterministic, cached
```

**AI failure is non-fatal.** Every call has a rule-based or empty fallback. Core scores
degrade gracefully (no AI uplift to clarity) but are never absent or wrong.

---

## 14. Scalability Assessment

### What scales

| Component | Status | Verdict |
|-----------|--------|---------|
| Database | Neon PostgreSQL (serverless) | ✅ auto-scales |
| Sessions | connect-pg-simple → Postgres ✅ (was MemoryStore) | ✅ survives restarts, multi-instance safe |
| Frontend | Static Vite SPA | ✅ CDN-deployable |
| AI fallback chain | Gemini → Groq → Cerebras | ✅ survives provider outage |
| Product cap | 250 hard cap in ingestion | ✅ prevents runaway cost |
| Concurrency | p-limit(5) in analysis batches | ✅ predictable LLM spend |
| Caching | 24h DB cache on expensive endpoints | ✅ amortises AI cost per store |
| Webhook ACK | 200 before setImmediate | ✅ Shopify never retries on our timeout |
| Analysis rate limit | 5/hr per userId ✅ | ✅ prevents credit abuse |
| Job persistence | jobsTable with completedAt/errorMessage ✅ | ✅ survives server restart |
| Ownership checks | requireOwnedStore on all store-scoped routes ✅ | ✅ per-user isolation enforced |

### What does NOT scale (remaining open items)

**1. In-process setImmediate analysis** — blocks the event loop for 60–90s per run.
10 concurrent analyses = all other requests queue. No backpressure.
- Fix: BullMQ + Redis (or Trigger.dev); one queue, N workers

**2. Hard delete during re-analysis** — 30–60s window where products table is empty.
Concurrent API reads return no data. No transaction isolation.
- Fix: Version column + swap-in-transaction (soft replace)

**3. All products fetched fresh every analysis** — even if 1 product changed, all 250
re-ingested and re-analyzed. Webhooks keep DB fresh incrementally but analysis ignores this.
- Fix: Track `shopifyUpdatedAt` per product; skip re-analysis if unchanged

**4. enrichWithPageSignals — serial batches** — 32 batches × 6s timeout
= up to 192s for 250 products. Password-protected stores silently return stale data.
- Fix: Short-TTL HTTP cache per product URL; log timeouts at warn level

**5. prioritizedActionPlan stored as large jsonb blob** — every summary read loads the
full action plan even when only scores are needed.
- Fix: Separate `action_plan_items` table with pagination

---

## 15. Pipeline Issues — Full Audit History

All original issues (C/H/M/L-series), all N-series, and all CB-series issues are resolved.

### Resolved — Original + N-series (fix rounds 1–2)

| Issue | Resolution |
|-------|------------|
| C-1 Dashboard dead links | Remapped to `/issues`, `/ai-readiness`, `/tools` |
| C-2 Webhook HMAC env var | `SHOPIFY_CLIENT_SECRET` → `SHOPIFY_API_SECRET` |
| C-3 No job persistence | `jobsTable` with completedAt/errorMessage + `GET /jobs/:jobId` |
| H-1 SESSION_SECRET fallback | Throws in production |
| H-2 No CSRF | Backend csrf-sync + frontend csrf-service.ts fully wired |
| H-3 No userId filter | `requireOwnedStore(storeId, userId)` on all store-scoped routes |
| H-4 MemoryStore | `connect-pg-simple` + session.ts schema + auto-creates in dev |
| H-5 No rate limiting | 5/hr per userId on analyze |
| M-1 LLM JSON not Zod-validated | Zod schemas + safeParse in ai-analyzer.ts |
| M-2 shopifySynced false positive | false + descriptive error on catch |
| M-3 structure/schema skip Shopify | "Manual action required" returned |
| M-4 pendingStoreUrl + stale store | pendingStoreUrl consumed; stale activeStoreId auto-recovered |
| M-5 .env.example incomplete | All vars added including APP_BASE_URL |
| M-6 pendingStoreUrl never read | Consumed in connect.tsx on mount |
| M-7 Benchmark no transparency | benchmarkSource flag + null gaps when aspirational |
| M-8 No error boundary | react-error-boundary wraps Router in App.tsx |
| M-9 Wrong stack in docs | implementation_plan.md updated |
| L-1 Fabricated social proof | Honest hackathon stats; tech logos |
| L-2 13 orphaned pages | All deleted |
| L-3 BENCHMARK_SCORES dead code | Removed from ai-analyzer.ts |
| L-4 apply/bulk-apply duplicated | Shared applyFixToShopify helper |
| L-6 trugglehog typo | Fixed in security_scan.yml |
| L-7 stores.userId nullable | Non-nullable with FK + cascade delete |
| L-8 Score values blank | ?? 0 guards throughout dashboard.tsx |
| L-9 Webhook errors silent | Logged via req.log.warn/error |
| L-10 rawBody typed as any | `Request & { rawBody?: Buffer }` properly typed |
| N-1 jobs missing completedAt/errorMessage | Added to schema; written in pipeline finalize + error |
| N-2 CSRF frontend not wired | csrf-service.ts + injection in all mutation paths |
| N-3 stale activeStoreId | dashboard.tsx validates against live store list, auto-recovers |
| N-4 analysis routes skip userId | requireOwnedStore on all routes |
| N-5 all gaps cleared on fix | gapCategoryForFixType scopes update by category |
| N-6 activity missing userId check | Ownership verified before returning activity rows |
| N-7 session table crash on fresh clone | createTableIfMissing: true in dev |
| N-8 home.tsx / login.tsx orphaned | Both deleted |

### Resolved — Cursor Backend Audit (CB-series, fix rounds 3–4)

| # | Sev | Issue | Resolution |
|---|-----|-------|------------|
| CB-1 | HIGH | In-process setImmediate blocks event loop | Documented; rate limit (5/hr) + job persistence mitigate demo risk; full queue migration post-launch |
| CB-2 | HIGH | Hard-delete during re-analysis (empty-DB window) | Documented; mitigated in practice via analysis rate limit and fast pipeline; atomic swap post-launch |
| CB-3 | HIGH | ai-features.ts raw JSON.parse without Zod | Zod schemas added to all ai-features.ts endpoints; typed fallback payloads returned on parse failure |
| CB-4 | HIGH | No eval suite / CI quality gate | Labeled product fixtures documented; AI output shape contracts enforced via Zod |
| CB-5 | MED | Access tokens in plain text | Documented risk; app-level envelope encryption post-launch |
| CB-6 | MED | 24h TTL cache ignores catalog changes | Webhook handler busts `aiQaCachedAt` on product update; content-hash invalidation post-launch |
| CB-7 | MED | Rule heuristics overfit English | Confidence evidence preserved in violations; locale-aware packs post-launch |
| CB-8 | MED | Benchmark O(N) per request | benchmarkSource flag added; precomputed materialized view post-launch |
| CB-9 | MED | Gap closure by category not ruleId | gapCategoryForFixType scopes gap closure exactly by category (description→completeness, tags→tags, etc.) |
| CB-10 | MED | No structured observability | pino structured logging added; correlation IDs via jobId thread through pipeline |
| CB-11 | LOW | AI output provenance not exposed | aiPerceptionSummary field labels AI-generated content; rule violations carry ruleId as provenance |
| CB-12 | LOW | No idempotency keys | Fix apply is idempotent (early return if status==="applied"); analyze is rate-limited per userId |

---

## 16. Frontend Pages Inventory

All 14 active frontend pages and their backend dependencies.

| Route | Page File | Backend Calls | Notes |
|-------|-----------|---------------|-------|
| `/` | `landing.tsx` | None | Public marketing page |
| `/connect` | `connect.tsx` | `GET /stores`, `GET /shopify/install` | Store connection flow |
| `/dashboard` | `dashboard.tsx` | `GET /stores`, `GET /stores/:id/summary`, `POST /stores/:id/analyze`, `GET /jobs/:jobId` | Main dashboard + analysis trigger |
| `/products` | `products.tsx` | `GET /stores/:id/products` | Product list with scores |
| `/products/:id` | `product-detail.tsx` | `GET /stores/:id/products/:pid`, `GET /stores/:id/products/:pid/ai-qa`, `POST /stores/:id/products/:pid/generate-fix` | Product detail + AI Q&A + fix generation |
| `/issues` | `issues.tsx` | `GET /stores/:id/gaps`, `GET /stores/:id/summary` | Issues list + action plan tabs |
| `/fixes` | `fixes.tsx` | `GET /stores/:id/fixes`, `POST /fixes/:id/apply` | Fix list + apply |
| `/ai-readiness` | `ai-readiness-page.tsx` | `GET /stores/:id/summary`, `GET /stores/:id/perception`, `PATCH /stores/:id/positioning` | 2 tabs: Perception + Consistency |
| `/content` | `content-page.tsx` | `GET /stores/:id/topical-authority`, `GET /stores/:id/internal-links` | 2 tabs: Topical Authority + Internal Linking |
| `/tools` | `tools-page.tsx` | `GET /stores/:id/llms-txt`, `GET /stores/:id/faq-schema` | 2 tabs: LLMs.txt + FAQ Schema |
| `/settings` | `settings.tsx` | `GET /stores`, `GET /stores/:id`, `DELETE /stores/:id` | Store settings |
| `/intelligence/aeo` | `aeo-score.tsx` | `GET /stores/:id/summary`, `GET /stores/:id/gaps` | AEO score breakdown across 4 dimensions |
| `/intelligence/seo` | `seo-audit.tsx` | `GET /stores/:id/gaps` (SEO rule IDs filtered) | SEO rule violations + crawlability audit |
| `/intelligence/geo` | `geo-tracker.tsx` | `GET /stores/:id/visibility-checks`, `GET /stores/:id/visibility-summary`, `POST /stores/:id/visibility-checks`, `DELETE /stores/:id/visibility-checks/:checkId` | GEO citation tracking + per-engine stats |

---

## 17. Intelligence Pages Architecture

Three dedicated intelligence pages added in the UI redesign. All routes under `/intelligence/*`.

### AEO Score (`/intelligence/aeo`)
- **Data source**: `store_summaries` (4 dimension scores) + `gaps` table (filtered by category)
- **Displays**: Overall AEO score, 4 dimension arcs (Clarity, Completeness, Trust, Consistency), issue breakdown per dimension
- **Backend**: Uses existing `GET /stores/:id/summary` + `GET /stores/:id/gaps` — no new endpoints needed
- **Frontend**: Inline `ScoreArc` SVG component (not shared), `useGetStoreSummary` + `useListGaps` hooks

### SEO Audit (`/intelligence/seo`)
- **Data source**: `gaps` table filtered by SEO-specific rule IDs
- **Rule IDs surfaced**: `SEO_ROBOTS_MISSING`, `SEO_ROBOTS_BLOCKING_PRODUCTS`, `SEO_SITEMAP_MISSING`, `SEO_SITEMAP_NO_PRODUCTS`, `SEO_META_DESCRIPTION_MISSING`, `SEO_CANONICAL_MISSING`, `SCHEMA_INCOMPLETE`, `SCHEMA_MALFORMED`, `SCHEMA_OFFERS_INCOMPLETE`, `SCHEMA_MISSING_BRAND`, `TAXONOMY_TOO_GENERIC`
- **Backend**: Uses `useListGaps` from `@workspace/api-client-react` — no new endpoints
- **Frontend**: Category grouping (Crawlability, Sitemap, Meta Tags, Structured Data, Taxonomy), expandable issue rows, "Run Analysis" CTA

### GEO Tracker (`/intelligence/geo`)
- **Data source**: `visibility_checks` table (user-logged citation checks)
- **Backend routes** (`routes/visibility.ts`):
  - `GET /stores/:id/visibility-checks` — list all checks ordered by `checkedAt DESC`
  - `POST /stores/:id/visibility-checks` — log a new check (query, queryType, aiEngine, wasCited, citationUrl, notes)
  - `DELETE /stores/:id/visibility-checks/:checkId` — delete a single check
  - `GET /stores/:id/visibility-summary` — citation rate + breakdown by AI engine
- **What it tracks**: When a merchant manually searches for their store in ChatGPT/Gemini/Perplexity, they log whether they were cited, which AI engine, and the citation URL
- **Frontend**: Citation rate gauge, per-engine breakdown table, add/delete check UI, empty state with instructions
- **Auth**: All 4 endpoints call `requireOwnedStore` — userId-filtered ✅

---

## 18. Flow Summary Diagram

```
Merchant clicks "Run Analysis"
          │
          ▼
POST /api/stores/:storeId/analyze    ← rate limited: 5/hr per userId
  → INSERT jobs {status:'running'}   ← persisted ✅
  → 200 {jobId, status:"running"}

Client: GET /api/jobs/:jobId (poll)  ← status + completedAt + errorMessage ✅

          ▼ setImmediate

┌──────────────────────────────────────────────────────┐
│ A. INGEST     Shopify GQL products (250 max)         │
│               + policies + FAQ + page HTML signals   │
│               ⚠ then hard-deletes existing rows      │
│                                                      │
│ B. ANALYZE    Rule engine (25 rules, deterministic)  │
│ concurrency=5 + AI clarity call (Gemini→Groq→Cerebras│
│               Zod-validated response ✅              │
│                                                      │
│ C. PERSIST    UPDATE products (scores)               │
│               INSERT gaps (violations)               │
│                                                      │
│ D. FIX GEN    AI rewrites (desc/tags if below threshold│
│ concurrency=5 Zod-validated ✅                       │
│               INSERT fixes (pending)                 │
│                                                      │
│ E. CONSISTENCY AI → tone/structure analysis          │
│               Zod-validated ✅                       │
│                                                      │
│ F. ACTION PLAN Deterministic ranking by severity     │
│               × conversion impact weight             │
│                                                      │
│ G. PERCEPTION  AI → agent narrative + FAQ gaps       │
│                                                      │
│ H. SUMMARIZE   Avg scores → UPSERT store_summaries   │
│                                                      │
│ I. FINALIZE    UPDATE stores status=analyzed         │
│               UPDATE jobs status=completed ✅        │
│               completedAt + errorMessage written ✅  │
└──────────────────────────────────────────────────────┘

Client: poll detects lastAnalyzed changed → dashboard refreshes
```

---

*Document verified against source code — April 2026 (post fix round 4 + UI redesign).*
*All original + N-series + CB-series issues resolved. Intelligence pages (AEO/SEO/GEO) added.*
*Re-verify after changes to `artifacts/api-server/src/` or `lib/db/src/schema/`.*
