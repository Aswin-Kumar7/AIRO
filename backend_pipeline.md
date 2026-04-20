# Backend Pipeline — AI Readiness Analyzer
> Architecture reference · April 2026 · Verified against source code
> Updated after fix round 1 — reflects all verified changes

---

## 1. High-Level Architecture

```
Browser (React + Wouter + TanStack Query)
    │  REST + JSON  (x-csrf-token header on all mutations ⚠ NOT YET WIRED — see §15)
    ▼
Express 5 API Server  (:4000 in dev)
    │
    ├─ Middleware chain
    │    pino → CORS → cookie-parser → connect-pg-simple session
    │    → express.json (rawBody capture) → csrf-sync → requireAuth
    │
    ├─ GET  /api/csrf-token           CSRF token issuance
    ├─ /api/auth/*                    Google OAuth 2.0 (session-based)
    ├─ /api/shopify/*                 Shopify OAuth + webhooks (HMAC-verified)
    ├─ /api/stores/*                  CRUD — userId-filtered ✅
    ├─ /api/stores/:id/analyze        Analysis trigger + rate limit (5/hr)
    ├─ /api/jobs/:jobId               Job status polling ✅ NEW
    ├─ /api/stores/:id/products/*     Product list, detail, on-demand fix gen ⚠ no userId check
    ├─ /api/stores/:id/fixes/*        Fix apply + Shopify write-back ⚠ no userId check
    └─ /api/stores/:id/...features    Query sim, topical authority, llms.txt, AI QA, etc.
              │
              ├─ lib/ai-client.ts          → Gemini 2.0-flash → Groq → Cerebras (fallback chain)
              ├─ lib/rule-engine.ts        → 25 deterministic rules, no AI
              ├─ lib/ai-analyzer.ts        → Rule engine + AI blend, Zod-validated ✅
              ├─ lib/ai-features.ts        → Store-level AI features (query sim, perception, etc.)
              ├─ lib/shopify-ingestion.ts  → Shopify GraphQL + storefront HTML fetch
              ├─ lib/shopify-client.ts     → Shopify GraphQL write-back + verification
              ├─ lib/perception-simulator.ts → AI narrative generation
              └─ lib/conversion-ranker.ts  → Deterministic gap prioritization

Neon PostgreSQL (Drizzle ORM)
    Tables: users, stores, products, gaps, fixes, activity, jobs ✅ NEW
            store_summaries, consistency_reports, perception_reports
            session ✅ NEW  (connect-pg-simple backing store)
```

---

## 2. Middleware Chain (Request Lifecycle)

Every incoming request passes through this exact chain in order:

```
1. pinoHttp              log method + path (headers redacted: authorization, cookie, set-cookie)

2. cors                  allowlist: FRONTEND_URL | localhost:3000 | localhost:5173
                         credentials: true

3. cookieParser          parse 'sid' session cookie

4. connect-pg-simple     ✅ UPDATED (was MemoryStore)
   express-session       PgStore backed by DATABASE_URL → "session" table
                         HttpOnly, secure+sameSite:none in prod / lax in dev, 7-day maxAge
                         createTableIfMissing: false  ⚠ table must exist before startup

5. express.json          + verify hook → req.rawBody = Buffer  (typed as `any` ⚠ regression)
   express.urlencoded

6. csrf-sync             ✅ NEW — validates x-csrf-token header on all non-GET requests
                         Exemption: path starts with /api/shopify/webhooks/
                         Token issued at: GET /api/csrf-token
                         ⚠ CRITICAL: frontend never fetches or sends this token
                           → all POST/DELETE/PATCH return 403 until wired up

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
   │── POST /analyze ──────►│ analysisLimiter: 5/hr per userId ✅ NEW
   │                        │ load store (no userId check ⚠ — see §15 N-4)
   │                        │ jobId = generateId()
   │                        │ UPDATE stores SET status='analyzing'
   │                        │ INSERT activity 'analysis_started'
   │                        │ INSERT jobs {id:jobId, storeId, status:'running'} ✅ NEW
   │◄── {jobId, storeId, status:"running", startedAt} ──────────────────────────

   Client can poll: GET /jobs/:jobId ✅ NEW → {id, storeId, status, startedAt}

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
│  UPDATE jobs  SET status='completed'  ✅ NEW                                 │
│  INSERT activity 'analysis_completed'                                        │
└─────────────────────────────────────────────────────────────────────────────┘

Error path (any unhandled throw):
  UPDATE stores SET status='error'
  UPDATE jobs  SET status='failed'   ✅ NEW
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
  ⚠ No userId ownership check on storeId — see §15 N-4

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
   ⚠ ALL gaps for this product marked isFixed=true — not scoped to fix type/category (N-5)

6. INSERT activity 'fix_applied'
7. Recount pendingFixes/appliedFixes → UPDATE store_summaries

Response: {fixId, success, shopifySynced, shopifyError}
```

**Bulk apply** (`POST /stores/:storeId/fixes/bulk-apply`) calls the same `applyFixToShopify`
helper in a sequential loop, then refreshes counts once at the end.

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

| Feature | Endpoint | Cache | Input | Notes |
|---------|----------|-------|-------|-------|
| Query Simulation | `GET /stores/:id/query-simulation` | `store_summaries.querySimulation*` | 15 products | 6 buyer queries → recommend/confidence/missingInfo |
| Topical Authority | `GET /stores/:id/topical-authority` | `store_summaries.topicalAuthority*` | All products | Topic clusters + coverageScore + gaps |
| Internal Links | `GET /stores/:id/internal-links` | `store_summaries.internalLinks*` | First 20 products | 12 link suggestions by type |
| AI Product Q&A | `GET /stores/:id/products/:pid/ai-qa` | `products.aiQa*` (busted by webhook) | Product + 5 questions | canAnswer/answer/missingInfo |
| Perception | `GET /stores/:id/perception` | `perception_reports` (set at analysis) | Stored report | Pre-computed in pipeline |
| FAQ Schema | `GET /stores/:id/faq-schema` | None (always live) | 8 products + unanswered topics | FAQPage JSON-LD |
| LLMs.txt | `GET /stores/:id/llms-txt` | None (always live) | Store + products + policies | Markdown standard |
| Tag Optimizer | `GET /stores/:id/tag-optimizer` | None | Per-product suggestedTags from DB | Rule-engine output |
| Benchmark | `GET /stores/:id/benchmark` | None | Other stores' products | P90 if ≥10 stores; `benchmarkSource` flag returned ✅ |

**Benchmark transparency (updated):** Response now includes `benchmarkSource: "real-p90" | "aspirational"`. When aspirational (< 10 analyzed stores exist), benchmark gap fields return `null` so the frontend can render "Not enough data" instead of fabricated comparisons.

---

## 12. Database Schema Summary

```
users           id, googleId (unique), email (unique), name, avatarUrl, createdAt

stores          id, domain (unique), name, accessToken, desiredPositioning,
                status, productsFetched, lastAnalyzed, overallScore, productCount,
                userId (nullable ⚠ no FK constraint), createdAt

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

jobs  ✅ NEW    id, storeId, status ("running"|"completed"|"failed"),
                startedAt
                ⚠ missing: completedAt, errorMessage

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

session ✅ NEW  sid (PK varchar), sess (json), expire (timestamp)
                index: IDX_session_expire on expire
                ⚠ must exist before server starts (createTableIfMissing: false)

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
Review signal extraction         │  Query simulation (6 buyer queries)
Write-back verification          │  Topical authority clustering
Benchmark P90 computation        │  Internal link suggestions
Cache invalidation logic         │  Store perception narrative
                                 │  FAQ schema Q&A generation
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
| Analysis rate limit | 5/hr per userId ✅ NEW | ✅ prevents credit abuse |
| Job persistence | jobsTable ✅ NEW | ✅ survives server restart |

### What does NOT scale

**1. In-process setImmediate analysis** — blocks the event loop for 60–90s per run.
10 concurrent analyses = all other requests queue. No backpressure.
- Fix: BullMQ + Redis (or Trigger.dev); one queue, N workers

**2. Hard delete during re-analysis** — 30–60s window where products table is empty.
Concurrent API reads return no data. No transaction isolation.
- Fix: Version column + swap-in-transaction (soft replace)

**3. No job completedAt / errorMessage** — client can poll status but cannot see finish
time or failure reason without reading the activity log.
- Fix: Add `completedAt timestamp` and `errorMessage text` to `jobs` table

**4. Analysis does not check store ownership** — any authenticated user can trigger
analysis on any store by guessing storeId (bypasses per-user isolation).
- Fix: Add `eq(storesTable.userId, req.session.userId!)` to the store lookup

**5. CSRF token never sent by frontend** — all write mutations return 403 in current state.
- Fix: Frontend csrfService that fetches `/api/csrf-token` once and injects header

**6. All products fetched fresh every analysis** — even if 1 product changed, all 250
re-ingested and re-analyzed. Webhooks keep DB fresh incrementally but analysis ignores this.
- Fix: Track `shopifyUpdatedAt` per product; skip re-analysis if unchanged

**7. enrichWithPageSignals — serial batches, silent failures** — 32 batches × 6s timeout
= up to 192s for 250 products. Password-protected stores silently return stale data.
- Fix: Short-TTL HTTP cache per product URL; log timeouts at warn level

**8. Benchmark P90 loads all products into memory** — at 100 stores × 250 products = 25k
rows per benchmark request with no pagination or index.
- Fix: Materialized view refreshed on a schedule; query the view instead

**9. prioritizedActionPlan stored as large jsonb blob** — every summary read loads the
full action plan even when only scores are needed.
- Fix: Separate `action_plan_items` table with pagination

**10. All gaps for a product cleared on any single fix** — fixing a description clears
title and trust gaps too, corrupting issue counts.
- Fix: Scope `gapsTable.isFixed` update to matching `ruleId` or `category`

---

## 15. Current Pipeline Issues

### Open bugs (code-verified)

| # | Sev | Issue | Location |
|---|-----|-------|----------|
| N-2 | **CRITICAL** | CSRF middleware added but frontend never sends `x-csrf-token` → all mutations return 403 | `app.ts:102–120` / frontend has no csrf code |
| N-4 | **HIGH** | `POST /analyze`, all products/fixes/insights/features routes load store by storeId only — no userId ownership check | `analysis.ts:36`, `fixes.ts`, `products.ts` |
| N-6 | **HIGH** | `GET /stores/:storeId/activity` lacks userId filter — any user can read another store's activity log | `stores.ts:181–196` |
| N-5 | **MED** | `isFixed=true` applied to ALL product gaps when any single fix applied — unrelated gaps incorrectly cleared | `fixes.ts:163–165` |
| N-3 | **MED** | `activeStoreId` in localStorage not validated against live store list — deleted store causes silent 404s | `store-context.tsx` |
| N-7 | **MED** | `createTableIfMissing: false` — fresh clone crashes silently if `drizzle-kit push` not run | `app.ts:82` |
| N-1 | **MED** | `jobs` table missing `completedAt` and `errorMessage` columns — status endpoint can't report why/when | `schema/jobs.ts` |
| M-5 | **MED** | `.env.example` missing `SESSION_SECRET`, `APP_BASE_URL`, `GOOGLE_CLIENT_ID/SECRET`, `GOOGLE_REDIRECT_URI` | `.env.example` |
| M-8 | **MED** | No global React error boundary — component crash = blank white screen | `App.tsx` |
| L-5 | **LOW** | Coarse commit messages don't satisfy "clean git history" rubric criterion | git history |
| L-7 | **LOW** | `stores.userId` nullable with no FK constraint — orphaned rows possible | `schema/stores.ts` |
| L-8 | **LOW** | Score values render blank/undefined while summary is loading (missing `?? 0` guards) | `dashboard.tsx` |
| L-10 | **LOW** | `rawBody` now typed as `any` — regressed from inline type extension | `app.ts:96` |
| N-8 | **LOW** | `home.tsx` and `login.tsx` orphaned in pages/ — not imported or routed | `src/pages/` |

### Fixed in round 1 (19 of 27 original issues)

| Original | What changed |
|----------|--------------|
| C-1 Dashboard dead links | Remapped to `/issues`, `/ai-readiness`, `/tools` |
| C-2 Webhook HMAC env var | `SHOPIFY_CLIENT_SECRET` → `SHOPIFY_API_SECRET` |
| C-3 No job persistence | `jobsTable` + `GET /jobs/:jobId` added |
| H-1 SESSION_SECRET fallback | Throws in production |
| H-2 No CSRF (partial) | `csrf-sync` added to backend; frontend wiring pending |
| H-3 No userId filter (partial) | `stores.ts` CRUD routes filtered; other routes open |
| H-4 MemoryStore | `connect-pg-simple` + `session.ts` schema |
| H-5 No rate limiting | `express-rate-limit` 5/hr per userId on analyze |
| M-1 LLM JSON not Zod-validated | Zod schemas + `safeParse` in ai-analyzer.ts |
| M-2 shopifySynced false positive | `false` + error message on verification catch |
| M-3 structure/schema skip Shopify | "Manual action required" returned; shopifySynced=false |
| M-6 pendingStoreUrl never read | Consumed in `connect.tsx` on mount |
| M-7 Benchmark no transparency | `benchmarkSource` flag + null gaps when aspirational |
| M-9 implementation_plan.md wrong stack | Updated to Express + Vite + @google/generative-ai |
| L-1 Fabricated social proof | Honest hackathon stats; tech logos |
| L-2 13 orphaned pages | All deleted |
| L-3 BENCHMARK_SCORES dead code | Removed from ai-analyzer.ts |
| L-4 apply/bulk-apply duplicated | Shared `applyFixToShopify` helper |
| L-9 Webhook errors silent | Logged via `req.log.warn/error` |

---

## 16. Recommended Next Fixes (Priority Order)

```
1. N-2  Wire CSRF token in frontend
        → fetch GET /api/csrf-token on app init, store in memory
        → inject x-csrf-token header on all non-GET fetches in the Orval client wrapper

2. N-4  Add userId ownership check to analysis + products + fixes + insights + features routes
        → and(eq(storesTable.id, storeId), eq(storesTable.userId, req.session.userId!))
        → return 403 on ownership mismatch

3. N-6  Add userId check to GET /stores/:storeId/activity
        → join through storesTable or add userId column to activityTable

4. N-5  Scope isFixed update to matching gaps only
        → add eq(gapsTable.category, fix.category) or match by ruleId

5. M-5  Complete .env.example with all required vars

6. N-7  Set createTableIfMissing: true in dev session store config

7. N-1  Add completedAt + errorMessage to jobs table schema
```

---

## 17. Flow Summary Diagram

```
Merchant clicks "Run Analysis"
          │
          ▼
POST /api/stores/:storeId/analyze    ← rate limited: 5/hr per userId
  → INSERT jobs {status:'running'}   ← persisted ✅
  → 200 {jobId, status:"running"}

Client: GET /api/jobs/:jobId (poll)  ← status endpoint ✅

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
└──────────────────────────────────────────────────────┘

Client: poll detects lastAnalyzed changed → dashboard refreshes
```

---

*Document verified against source code — April 2026 (post fix round 1).*
*Re-verify after changes to `artifacts/api-server/src/` or `lib/db/src/schema/`.*
