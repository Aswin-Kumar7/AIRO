# AIRO — Decision Log

> A running record of every significant architectural, product, and scope decision made during the build.
> Format: **We considered X. We chose Y. Because Z.**

---

## Infrastructure & Deployment

---

### DL-001 · Monorepo vs Separate Repos

**We considered** maintaining three separate repositories — one for the API, one for the frontend, and one for shared types.

**We chose** a single pnpm monorepo with workspace packages (`lib/db`, `lib/api-zod`, `lib/api-client-react`, `artifacts/api-server`, `artifacts/ai-readiness`).

**Because** shared Zod schemas and generated React Query hooks need to be co-versioned with the API. A type change in a route would require coordinating three PRs across repos. The monorepo lets TypeScript's project references enforce correctness across packages at compile time, and a single `pnpm typecheck` command validates everything before any deployment.

---

### DL-002 · Railway vs Vercel for the API

**We considered** deploying the Express API to Vercel Serverless Functions or to a traditional VPS.

**We chose** Railway with a Dockerfile for the API.

**Because** the GEO scanner runs 5 AI agents in parallel per query — each with HTTP calls that can take 10–20 seconds. Vercel Serverless has a 10-second execution limit on the Hobby plan and cold start overhead. Railway gives us a persistent process, predictable latency, and Docker-based builds that match production exactly. The Dockerfile also means zero environment drift between local and production.

---

### DL-003 · Cross-Origin Session Cookies — Vercel Proxy vs Custom Domain

**We considered** purchasing a custom domain (`airo.dev`) and serving both frontend and API under subdomains (`app.airo.dev`, `api.airo.dev`) with shared cookies on `.airo.dev`.

**We chose** a Vercel rewrite rule that proxies `/api/*` from the Vercel frontend to the Railway API.

**Because** a custom domain adds DNS configuration, TLS provisioning, and cost that is not justified for a hackathon build. The Vercel rewrite makes all API calls appear same-origin to the browser (`kasparro-airo.vercel.app/api/...`), which means session cookies are first-party and work without `SameSite=None` workarounds. The trade-off is that Vercel adds a proxy hop, which adds ~20–50ms of latency to every API call. Acceptable for this stage.

---

### DL-004 · Neon vs PlanetScale vs Supabase for the Database

**We considered** PlanetScale (MySQL), Supabase (PostgreSQL + extras), and Neon (serverless PostgreSQL).

**We chose** Neon with Drizzle ORM.

**Because** Neon's serverless driver branches and scales to zero — eliminating idle compute cost during inactive periods. Drizzle gives us typed queries without the runtime overhead of Prisma (no query engine binary). Neon also supports connection pooling via pgbouncer-compatible endpoints, which matters when Railway containers restart frequently.

---

## AI Architecture

---

### DL-005 · OpenAI vs AWS Bedrock for the Content Judge

**We considered** OpenAI GPT-4o-mini as the second AI content-quality judge in the GEO scanner.

**We chose** AWS Bedrock with Claude 3 Haiku (`apac.anthropic.claude-3-haiku-20240307-v1:0`).

**Because** AWS Bedrock gives us access to Claude (Anthropic) and Nova (Amazon) under a single Bearer-token auth model, with no dependency on OpenAI and APAC-region endpoints for lower latency to our Asia-Pacific deployment. Claude 3 Haiku is purpose-built for fast, structured evaluation tasks — the exact workload of a content quality judge. Its instruction-following for strict JSON-only output is more reliable than GPT-4o-mini for this use case. Bedrock also keeps all AI calls within a single cloud provider account, simplifying credentials management.

---

### DL-006 · Two Bedrock Models vs One

**We considered** using a single Bedrock model for both the brand-knowledge agent and the content-quality judge in the GEO scanner.

**We chose** two separate models: Nova Lite (`apac.amazon.nova-lite-v1:0`) for brand knowledge and Claude 3 Haiku for content quality.

**Because** they answer different questions. Nova is Amazon's own model with strong product/brand world knowledge — better for "Would an AI recommend this brand?" Claude is Anthropic's model with superior instruction-following for structured evaluation — better for "Is this product description good enough for AI to recommend it?". Using two independent models from different providers also prevents correlated failures and gives judges a multi-perspective signal.

---

### DL-007 · Deterministic Gap IDs vs UUID-Based IDs

**We considered** generating random UUIDs for each detected gap when an analysis runs.

**We chose** deterministic gap IDs computed as `gap_{storeId[-8]}_{productId[-8]}_{ruleId}`.

**Because** merchants re-run analyses as they fix issues. If gap IDs are random, the system cannot track whether a specific gap was resolved between runs, which breaks fix-tracking, deduplication, and analytics. Deterministic IDs mean the same rule violation on the same product always produces the same ID — enabling idempotent upserts and progress tracking without a separate mapping table.

---

### DL-008 · AI vs Deterministic for Gap Detection

**We considered** using an LLM to evaluate each product and generate free-form gap reports.

**We chose** a deterministic rule engine for gap detection, with AI used only for content generation (rewrites) and perception evaluation.

**Because** gap detection needs to be auditable. If an LLM says "this description is unclear," a merchant cannot reproduce or challenge that finding. Deterministic rules — "description is under 50 words," "no price in metadata," "return policy not mentioned" — produce the same result on every run, can be unit-tested, and give merchants a clear action. AI handles what only AI can do: writing better content and simulating how an agent perceives the store.

---

### DL-009 · 5-Agent GEO Scanner vs Single-Agent

**We considered** querying a single AI platform to check store visibility.

**We chose** 5 parallel agents covering Tavily (live web), SerpAPI (Google Search), Nova (brand knowledge), Claude (content quality), and Gemini (perception).

**Because** no single platform represents AI visibility. Tavily tests whether you appear in live web searches that AI agents use for retrieval. SerpAPI tests Google ranking — the primary index for most AI systems. Nova tests brand awareness baked into model training data. Claude tests whether your content quality is sufficient for AI recommendation. Gemini provides a third-party perception signal. Together, these give a 360° view that a single signal cannot.

---

## Product Scope

---

### DL-010 · What We Deliberately Did Not Build

These were considered and explicitly excluded to ship within the hackathon window:

| Feature | Why Excluded |
|---|---|
| Multi-user / team access | Adds auth complexity (roles, invites, permissions) with no core-value impact for solo merchants |
| Webhook-driven real-time sync | Shopify webhooks require HMAC verification, retry handling, and event queuing — 2+ days of infrastructure |
| Automated scheduled scans | Cron + queue infrastructure; merchants need to understand the tool before automation adds value |
| Shopify App Store listing | Requires Shopify review, billing API, and 30+ day approval process |
| Custom AI model fine-tuning | Out of scope — foundation models are sufficient for the evaluation tasks |
| Historical trend charts | Requires time-series storage and aggregation; V2 feature |
| Mobile app | Web-first, responsive dashboard covers mobile browsers sufficiently |

---

### DL-011 · Session-Based Auth vs JWT

**We considered** stateless JWT tokens stored in `localStorage` or `httpOnly` cookies.

**We chose** server-side sessions with `express-session` + `connect-pg-simple` backed by Neon.

**Because** JWTs in `localStorage` are vulnerable to XSS. JWTs in `httpOnly` cookies require refresh token rotation logic to stay secure, which is as complex as session management but less flexible. Server-side sessions let us invalidate a session instantly (important for the "delete account" flow), inspect active sessions in the database, and avoid storing sensitive claims client-side. The trade-off is statefulness — the API server must always reach the database for auth — acceptable for our scale.

---

### DL-012 · AES-256-GCM for Token Encryption

**We considered** storing Shopify access tokens in plaintext (encrypted at rest by Neon) or using bcrypt.

**We chose** AES-256-GCM application-level encryption with a `TOKEN_ENCRYPTION_KEY` environment variable.

**Because** database-level encryption protects against storage breaches but not against a compromised database connection. Application-level encryption means the token is ciphertext even if someone queries the database directly. AES-256-GCM over bcrypt because tokens need to be decrypted for use — bcrypt is one-way and not suitable for values that must be recovered. GCM mode provides authenticated encryption, detecting tampering without a separate HMAC.

---

### DL-013 · pnpm Catalog for Shared Dependency Versions

**We considered** letting each workspace package define its own version of shared dependencies like `zod`, `react`, and `typescript`.

**We chose** a `catalog:` entry in `pnpm-workspace.yaml` that pins shared dependency versions across all packages.

**Because** version skew between packages causes silent type incompatibilities. If `lib/api-zod` uses `zod@3.22` and `artifacts/api-server` uses `zod@3.25`, the Zod types are nominally incompatible even if structurally identical. A single catalog pin ensures the entire monorepo agrees on one version, and bumping a shared dependency is a one-line change.

---

*Last updated: April 2026*
*Maintainer: Aswin Kumar and Naveen*
