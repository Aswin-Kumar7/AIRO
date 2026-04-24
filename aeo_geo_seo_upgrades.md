# AEO / GEO / SEO Upgrades — Shopify Store Analysis

## Scope (important)
This document is **not** about optimizing *your app website’s* SEO.

It is a strict upgrade plan to make your **Shopify store analysis** (ingestion → scoring → gaps → fixes → features) more competitive for:
- **SEO**: classic search for the merchant’s storefront
- **AEO**: “answer engines” extracting direct answers from the store
- **GEO**: AI assistants recommending/citing the store in shopping conversations

External framing: GEO is SEO’s evolution and still depends on SEO fundamentals + brand authority + data quality; AI agents often run multi-query “fan‑out” using traditional search inputs.  
Sources: Shopify GEO playbook (`https://www.shopify.com/enterprise/blog/generative-engine-optimization`), Zipify GEO overview (`https://zipify.com/blog-geo/?hss_channel=lcp-71584946`).

---

## Executive Summary (Strict)

### What you already do well (from `backend_pipeline.md`)
- **Strong merchant AEO/GEO building blocks already exist**: rule engine + evidence-backed gaps, AI perception, AI Q&A, FAQ schema generator, `llms.txt` generator, topical authority, internal link suggestions.
- You also enrich with **live storefront JSON‑LD signals** (Product + AggregateRating) which is a serious edge for trust scoring.

### The real problem
You currently over-index on **product text quality** and “schema exists” detection, but under-index on:
- **SEO fundamentals that feed GEO** (crawlability/indexability, sitemap/robots, canonical/meta coverage)
- **data quality completeness** (variants/availability/currency/offer details; taxonomy specificity)
- **brand authority signals** (off-site trust signals Shopify highlights)
- **measurement** (“are we being cited/mentioned?”)

### Verdict (for Shopify store analysis)
- **SEO audit quality**: **Not yet competitive** (missing technical SEO fundamentals checks).
- **AEO readiness**: **Good but incomplete** (needs answer-first structure + grounding).
- **GEO readiness**: **Partially strong** (llms.txt + schema signals) but missing **pillar 2** (authority) and deeper **pillar 3** (data quality) rigor.

---

## What “good” looks like for merchant stores (2026 baseline)

### SEO fundamentals still power GEO
Shopify’s GEO guidance explicitly treats SEO hygiene as transferable into AI visibility (crawlers and agents still need to discover and trust pages).  
Source: Shopify GEO playbook (`https://www.shopify.com/enterprise/blog/generative-engine-optimization`).

### Product structured data completeness matters (SEO + shopping visibility)
Rich `Product` structured data eligibility depends on having correct, complete fields (offers, availability, currency, identifiers where possible).  
Source: Google Search Central Product structured data (`https://developers.google.com/structured-data/rich-snippets/products`).

### Answer-first clarity increases extraction (AEO + GEO)
Zipify emphasizes that AI favors **clarity**, **use-case specificity**, and **structured summaries** (TL;DR blocks, tables, “best for” lists).  
Source: Zipify GEO overview (`https://zipify.com/blog-geo/?hss_channel=lcp-71584946`).

---

## Pipeline Map: where SEO/AEO/GEO currently live

### Ingestion (`lib/shopify-ingestion.ts`)
- **SEO inputs**: product title/description/tags/productType/vendor + (limited) metafields + policies + FAQ page + live JSON‑LD scrape.
- **Gap**: you do not audit site-wide crawlability (robots/sitemap), meta/canonical, collection/blog surfaces, nor do you capture enough offer/variant detail.

### Rule engine (`lib/rule-engine.ts`)
- Strong for deterministic content quality + trust proxies.
- **Gap**: “technical SEO” checks aren’t represented as first-class rules (so they don’t show up as gaps/action plan items).

### AI analyzer & features (`lib/ai-analyzer.ts`, `lib/ai-features.ts`)
- Good for perception, Q&A, llms.txt, FAQ schema, topical authority.
- **Gap**: outputs are not consistently **grounded** in real store policy text; and fixes don’t enforce “answer-first” structures.

---

## High‑Value Upgrades (Ranked by ROI for hackathon judging)

### Upgrade 1 — Add a **Technical SEO + Crawlability** module (store-level)
**Goal:** Make your analysis reflect Shopify/SEO fundamentals that feed GEO: discoverability + indexability + canonicalization + metadata hygiene.

**What to implement**
- Fetch and evaluate:
  - `https://{domain}/robots.txt` (presence + obvious disallows)
  - `https://{domain}/sitemap.xml` (presence + references to product/collection/page sitemaps)
  - Sample pages (HTML head parsing):
    - home page
    - 5 product pages
    - 3 collection pages (if present)
    - policy pages
  - Extract: `<title>`, `meta name="description"`, `<link rel="canonical">`

**Output**
- New **store-level gaps** (productId = null) with evidence, severity, and fix guidance:
  - `ROBOTS_BLOCKING_PRODUCTS`
  - `SITEMAP_MISSING_OR_THIN`
  - `CANONICAL_MISSING`
  - `META_DESCRIPTION_MISSING_OR_DUPLICATE`

**Why it’s GEO-relevant**
AI agents often rely on traditional search inputs (“fan‑out”), and Shopify explicitly treats robots/sitemaps/title/headings as GEO fundamentals.  
Source: Shopify GEO playbook (`https://www.shopify.com/enterprise/blog/generative-engine-optimization`).

**Acceptance tests**
- A store with `robots.txt` blocking `/products/` is flagged with evidence lines.
- A store with missing `sitemap.xml` is flagged.
- A store with empty/missing meta description on sampled product pages is flagged.

---

### Upgrade 2 — Expand data quality capture (variants/offers/taxonomy) to avoid “fake schema”
**Goal:** Stop generating or recommending structured data that’s wrong (currency/availability/price) and improve retrieval precision for GEO.

**What to change in ingestion**
- Fetch richer variant/offer details:
  - variant count, min/max price, compare-at, SKU where available
  - availability / inventory hint if accessible
  - more images (first 3–5)
- Record a **taxonomy specificity score**:
  - penalize vague productType (“Accessories”, “Footwear”) vs specific (“Women’s waterproof hiking boots”)

**New rules / gaps**
- `VARIANTS_INCOMPLETE_DATA`
- `TAXONOMY_TOO_GENERIC`
- `OFFERS_MISSING_PRICE_RANGE`

**Why it matters**
Shopify calls out incomplete primary fields, bad taxonomy specificity, and confusing modeling (variants treated as separate products) as risks for AI agents.  
Source: Shopify GEO playbook (`https://www.shopify.com/enterprise/blog/generative-engine-optimization`).

---

### Upgrade 3 — Make FAQ schema and “policy answers” strictly grounded (AEO correctness)
**Goal:** Your FAQ schema should never confidently hallucinate store policies.

**What to implement**
- In `generateFaqSchema`, pass real policy bodies (refund/shipping/privacy/terms) as authoritative context.
- Require the model to label each answer:
  - `answerSource: "policy-backed" | "missing" | "inferred"`
- If policy text is missing → answer must explicitly say “Not specified by this store”.

**Why it’s valuable**
This improves trust for AEO (answers won’t be contradicted by the store) and makes your tool feel “enterprise grade”.

---

### Upgrade 4 — “Answer-first” product page structure fixes (AEO + GEO extraction)
**Goal:** Beyond rewriting prose, generate structured blocks that answer engines extract.

**New fix type**
- `structure_answer_first` (storefront content template)

**Template output requirements**
- 1–2 sentence TL;DR (“What it is” + “Who it’s for”)
- “Best for” bullets (use cases)
- Specs table (material, dimensions, compatibility, care) with “Unknown” explicitly marked
- Shipping/returns section that links to (or quotes) actual policy snippets when available

Zipify’s GEO guidance emphasizes scannable, structured summaries and “best for” clarity.  
Source: Zipify GEO overview (`https://zipify.com/blog-geo/?hss_channel=lcp-71584946`).

---

### Upgrade 5 — Structured data auditing: from “exists?” → “eligible + correct?”
Right now you detect “has JSON‑LD / schema.org/product” and some completeness checks, but you should grade:
- Is there a `Product` entity?
- Are `offers` present and coherent (price/currency/availability)?
- Are `image`, `brand`, `name`, `description` present?
- Is there `aggregateRating` / `reviewCount` when reviews exist?

Tie this to Google’s rich results expectations for product schema completeness.  
Source: Google Product structured data (`https://developers.google.com/structured-data/rich-snippets/products`).

**Output**
- A structured “Schema Readiness” score per product with explicit missing fields list.
- Fix guidance that prefers **deriving values from Shopify** over hardcoding.

---

### Upgrade 6 — Add “Brand Authority Signals” (GEO pillar #2)
Shopify emphasizes that AI trust often comes from **off-site** signals (reviews, community, press).  
Source: Shopify GEO playbook (`https://www.shopify.com/enterprise/blog/generative-engine-optimization`).

**Practical, hackathon-feasible implementation**
- Add a store-level panel and gap set:
  - review coverage consistency across catalog (already partially available)
  - vendor/brand consistency across products
  - merchant-provided “official profiles” (Instagram/TikTok/YouTube) and “press links”
  - optional: a guided workflow: “ask an LLM ‘what does the internet say about brand X’ and paste citations” (manual, but judged as strong product thinking)

---

### Upgrade 7 — Add measurement: “Are we being cited / mentioned?” (GEO loop)
No one can promise “rank #1 in ChatGPT”, so the advantage is in measurement + iteration loops (Shopify) and monitoring/iterating (Zipify).  
Sources: Shopify GEO playbook (`https://www.shopify.com/enterprise/blog/generative-engine-optimization`), Zipify GEO overview (`https://zipify.com/blog-geo/?hss_channel=lcp-71584946`).

**Implement**
- Store-level “Visibility Check” report:
  - query templates by niche (“best X for Y”, “X under $Z”, “alternatives to competitor”)
  - fields to track per query run: mentioned? cited? which competitor cited?
  - manual input is acceptable for hackathon; persist results to DB and trend over time

---

## What NOT to do (non‑sloppy rules)
- Don’t output schema fixes with hardcoded currency/availability unless you derived them from Shopify.
- Don’t generate policy answers that “sound right” but are not in the store’s policy bodies.
- Don’t claim a store is GEO-optimized without checking crawlability (robots/sitemap) and data quality completeness.

---

## Hackathon‑grade “48 hour” checklist (store-analysis only)
If you only have 2 days, ship these upgrades in this order:
1. **Technical SEO + crawlability module** (robots/sitemap/meta/canonical sampling) → store-level gaps + Action Plan integration.
2. **Ground FAQ schema in policy bodies** + add `answerSource` labels.
3. **Structured data auditing**: correct/eligible Product schema checks (offers/currency/availability).
4. **Answer-first structure fix** template for product pages (TL;DR + specs + best-for + policy links).
5. **Measurement loop**: simple “Visibility Check” tracking mentions/citations over time.