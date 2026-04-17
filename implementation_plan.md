# Detailed Implementation Plan: AI Readiness Analyzer

Based on your project specifications, here is a highly granular, module-by-module implementation plan mapping out exactly how each feature will be built into the `kasparro-track5` codebase.

## User Review Required

> [!IMPORTANT]
> - **Shopify Auth Flow:** Since standard NextAuth isn't built for full Shopify App HMAC validation, the plan assumes we use a Custom App approach (merchant generates a token and inputs it) for standard development. Let me know if you want the strict OAuth flow (which would require installing `@shopify/shopify-api`).
> - **Database Usage:** We will store analysis history in Neon Postgres (`schema.ts`). We will *not* store the entire HTML product catalog of stores to save space, but rather compute and store the results.

---

## Module 1: Shopify App Integration
**Goal:** Connect to Shopify and securely handle authorization tokens.

- **`src/lib/db/schema.ts`**: Update the `stores` table to safely hold `domain`, `access_token`, and installation timestamps.
- **`src/app/settings/page.tsx`**: A simple UI allowing the merchant to input their `*.myshopify.com` URL and their Admin API access token.
- **`src/lib/shopify/admin-client.ts`**: Enhance existing GraphQL client to validate connection upon token submission by fetching the shop's name.

## Module 2: Data Ingestion Layer
**Goal:** Extract necessary information from the store securely and efficiently.

- **`src/lib/shopify/ingestion.ts` [NEW]**: Create an ingestion pipeline.
  - **Products**: Fetch up to 250 products (including Titles, HTML descriptions, Tags, Vendor, Variants).
  - **Collections**: Fetch category groupings to provide context to the AI.
  - **Policies**: Fetch Shop Policies via GraphQL (Refund, Shipping, Terms of Service) for trust signals.
  - **FAQ Pages**: Fetch store Pages via the REST/GraphQL Pages API, filtering by handle containing `faq` or `frequently-asked`. Extract raw HTML body as a text block for AI analysis.
  - **Product Reviews**: Fetch product metafields targeting the `reviews` namespace (compatible with Shopify's native reviews or Judge.me metafield format) to surface social proof signals.
  - **Structured Data (JSON-LD)**: For each product page, detect the presence of `schema.org/Product` JSON-LD markup via the Storefront API's `metafields` or by inspecting the `descriptionHtml` for embedded scripts. Flag products missing structured data.
  - **Pagination Handling**: Implement GraphQL cursor-based pagination so large stores don't time out.

## Module 3: AI Analysis Engine
**Goal:** Process the ingested data through the Gemini LLM.

- **`src/lib/ai/perception-engine.ts` [MODIFY]**:
  - Restrict the `ProviderConfig` to exclusively use `@google/genai` (Gemini 2.5/1.5 Flash).
  - Expand the `CONFIDENCE_JSON` schema. The AI must return structured objects evaluating: **Clarity** (0-100), **Completeness** (0-100), and **Trust signals** (0-100).
- **`src/lib/ai/prompts.ts` [MODIFY]**: Emphasize checking descriptions for material specs, usage instructions, and policy references to calculate these new sub-scores.

## Module 4: Product-Level Scoring
**Goal:** Assign a quantifiable "AI Readiness" grade per product.

- **`src/lib/analysis/scoring.ts` [NEW]**:
  - A weighted algorithm taking the sub-scores from the AI Engine.
    - *Clarity* (40% weight)
    - *Completeness* (30% weight)
    - *Trust* (15% weight)
    - *Tag Quality* (15% weight)
  - Output an aggregated 0-100 `aiReadiness` score per product ID and store it in `analysis_results`.

## Module 5: Store-Level Scoring
**Goal:** Compute the overall store grade.

- **`src/lib/analysis/scoring.ts` [MODIFY]**:
  - Compute average product score across the catalog.
  - Verify overall presence of Shipping/Refund policies.
  - Return a macro `storeReadiness` metric to be saved to `store_summaries`.

## Module 6: Tag Optimization Engine
**Goal:** Detect poor tags and generate semantic ones.

- **`src/lib/ai/tag-optimizer.ts` [NEW]**:
  - Passes current tags + description to Gemini.
  - **Detection logic:** Flag tags that are single generic words ("shirt") vs semantic contextual tags ("summer linen shirt men").
  - **Generation logic:** Returns an array of suggested high-value semantic tags.

## Module 7: Consistency Checker
**Goal:** Check formatting uniformity across the store.

- **`src/lib/analysis/consistency.ts` [NEW]**:
  - Runs a post-analysis pass. It examines the structured JSON results of all products.
  - If 80% of products have 'materials' listed but 20% do not, it flags a *Structural Inconsistency*.
  - Assigns a `consistencyScore` to the Store Summary.

## Module 8: Gap Detection Engine
**Goal:** Identify specific flaws and rank them by severity.

- **`src/lib/ai/gap-detector.ts` [NEW]**:
  - Distills raw AI output into a list of issues.
  - **Ranking System**:
    - *High Severe*: Missing description / Unreadable format / Missing shipping policy.
    - *Medium Severe*: Lacking usage details / Generic tags.
    - *Low Severe*: Redundant wording / Minor formatting.

## Module 13: AI Perception Simulator
**Goal:** Show merchants exactly how an AI shopping agent currently perceives and would describe their store — the centerpiece differentiator of this track.

> **Note:** No external Search API (Google, Bing) is required. The simulator feeds the store's own ingested data directly to Gemini and prompts it to reason as an AI shopping agent. It never crawls the web.

- **`src/lib/ai/perception-simulator.ts` [NEW]**:
  - Takes the full ingested store snapshot (products, policies, FAQ, reviews, structured data flags) as context.
  - Sends a two-part prompt to Gemini:
    1. *"Act as an AI shopping assistant. A customer asks you to recommend a product from this store. Based only on the store data provided, what would you say? What questions could you not answer?"*
    2. *"List every fact about this store that is ambiguous, missing, or contradictory from an AI agent's perspective."*
  - Returns a structured `PerceptionReport` object:
    ```ts
    {
      agentNarrative: string;       // What the AI would currently say about the store
      unansweredQuestions: string[]; // Questions the AI could not answer from store data
      ambiguities: string[];         // Contradictory or unclear signals found
      perceivedStrengths: string[];  // What the AI would highlight positively
    }
    ```
- **`src/lib/db/schema.ts` [MODIFY]**: Add a `perception_reports` table to persist `agentNarrative`, `unansweredQuestions`, and `ambiguities` per store per run.
- **`src/app/api/analyze/perception/route.ts` [NEW]**: API route that triggers the perception simulation after the main analysis completes.

---

## Module 14: Conversion Impact Ranker
**Goal:** Transform the severity-ranked gap list into a business-prioritized action plan linked to conversion impact.

- **`src/lib/analysis/conversion-ranker.ts` [NEW]**:
  - Accepts the output array from the Gap Detection Engine (Module 8).
  - For each gap, appends a `conversionImpact` label drawn from a mapping table:
    ```ts
    const IMPACT_MAP = {
      'Missing return policy':     'High — AI agents flag stores without return policies as untrustworthy',
      'Missing description':       'High — product is invisible to AI recommendation engines',
      'No FAQ page':               'Medium — common customer questions will go unanswered in AI sessions',
      'Generic tags':              'Medium — reduces discoverability in AI-assisted product searches',
      'No JSON-LD structured data':'Medium — AI agents cannot extract machine-readable product facts',
      'Missing reviews':           'Medium — AI agents cannot surface social proof to hesitant buyers',
      'Redundant wording':         'Low — minor clarity reduction in AI summaries',
    }
    ```
  - Re-sorts the gap list: first by severity, then by conversion impact weight, producing a final `prioritizedActionPlan` array.
  - Each action item format: `{ gap, severity, conversionImpact, suggestedFix }`.
- **`src/lib/db/schema.ts` [MODIFY]**: Store the final `prioritizedActionPlan` JSON in the `analysis_results` table alongside the existing score fields.

---

## Module 9: Auto-Optimization Mode
**Goal:** Allow one-click bulk fixing of an entire catalog.

- **`src/app/api/optimize/bulk/route.ts` [NEW]**:
  - Background API endpoint that accepts an array of `productIds`.
  - Iterates over them, pings the fix generator, and uses standard Next.js promises configuration to parallelize within Gemini's free tier RPS limits.
- **`src/components/dashboard/BulkOptimizer.tsx` [NEW]**: UI checkboxed table to select products and hit "Optimize Selected".

## Module 10: Competitor Benchmarking
**Goal:** Compare store performance to a theoretically perfect store.

- **`src/lib/benchmarks/ideal-profile.ts` [NEW]**:
  - A hardcoded JSON object representing standard E-commerce AI expectations (e.g. `expected_clarity: 90`, `requires_refund_policy: true`).
- A comparison function that calculates the delta between the Store-Level Score and the Ideal Benchmark Score, generating string outputs like *"Your store is 15% less readable than the benchmark standard."*

## Module 11: Fix Generation and Application
**Goal:** Write new content and push it to Shopify.

- **`src/lib/ai/fix-generator.ts` [NEW]**:
  - Takes the isolated Gaps, the old HTML description, and prompts Gemini to act as a premium copywriter to merge the fixes into a cohesive, aesthetically pleasing HTML payload.
- **`src/app/api/shopify/apply/route.ts`**: Connects the generated fix and pushes it via the `updateProductDescription` (already present in `admin-client.ts`).

## Module 12: Dashboard UI
**Goal:** Visualize all this data cleanly to the merchant.

- **`src/app/dashboard/page.tsx` [MODIFY]**: Extend the existing layout to include new interactive components:
  - Add **Tag Suggestions Panel**: Shows "Current Tags" vs "AI Recommended Tags".
  - Add **Consistency Report Panel**: Shows pie chart of standard vs rogue product formats.
  - Add **Benchmarking Radar Chart** using `recharts` to compare Store Metrics against the Benchmark Profile.
  - Wire up the "Apply Fix" button inside the `SimulatorPanel` to hit the new Fix Application routes.
  - Add **AI Perception Panel** (`src/components/dashboard/PerceptionPanel.tsx` [NEW]): A split-view card showing:
    - Left: *"How AI currently sees your store"* — renders the `agentNarrative` and `unansweredQuestions` from the Perception Report.
    - Right: *"How you want to be represented"* — a merchant-editable text field for desired positioning/tone, stored in the `stores` table.
  - Add **FAQ Health Card** (`src/components/dashboard/FaqHealthCard.tsx` [NEW]): Displays whether a FAQ page was found, how many questions it covers, and which common AI-agent questions are not addressed.
  - Add **Structured Data Status Card** (`src/components/dashboard/StructuredDataCard.tsx` [NEW]): Lists products missing JSON-LD markup with a direct "Add Fix" shortcut.
  - Add **Prioritized Action Plan Panel** (`src/components/dashboard/ActionPlanPanel.tsx` [NEW]): Renders the `prioritizedActionPlan` output from the Conversion Impact Ranker as a sortable table with columns: *Gap | Severity | Conversion Impact | Suggested Fix*.

---

## Verification Plan
1. **Module 1 & 2:** Create a test shop, submit token, verify product ingestion logs print 5+ products, a FAQ page body, at least one review metafield, and structured data flags.
2. **Module 3, 4 & 5:** Run scripts to verify Gemini securely returns the new `Clarity`, `Completeness`, and `Trust` JSON keys without failing.
3. **Module 6 & 8:** Ensure missing specs trigger "High Severe" gap detection and generic tags are caught.
4. **Module 13:** Delete the FAQ page from the test store, re-run analysis, and confirm `unansweredQuestions` contains FAQ-related entries and the dashboard Perception Panel reflects the gap.
5. **Module 14:** Confirm the Prioritized Action Plan lists "Missing FAQ" above "Redundant wording" based on conversion impact weight, not just severity.
6. **Module 11 & 12:** Use the Dashboard Simulator to generate a fix, click apply, and verify live updating on the Shopify dev store.
