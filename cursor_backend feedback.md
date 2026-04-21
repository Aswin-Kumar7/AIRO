  # Cursor Backend Feedback (Strict Audit)

  ## Context
  - Scope reviewed: `backend_pipeline.md`, `artifacts/api-server/src/*` (routes + AI + ingestion), and DB schema files.
  - Goal: industry-grade readiness for a high-competition international hackathon.
  - Evaluation lens: correctness, security, AI accuracy, reliability, scalability, and operator UX.

  ## Executive Verdict
  - **Product direction is strong and differentiated**, especially the rule-first architecture, evidence-backed gaps, and concrete action loop.
  - **Current backend is not yet competition-hardened** for top-tier judging due to reliability and trust gaps in async execution, AI output validation, and data consistency.
  - **Estimated readiness (strict): 7.4/10**.
    - Core concept + implementation quality: high.
    - Production-grade reliability + evaluation rigor: medium.

  ---

  ## Critical/High Findings (Fix Before Demo Submission)

  ### 1) In-process analysis pipeline can block API responsiveness
  - **Severity:** High
  - **Where:** `artifacts/api-server/src/routes/analysis.ts` (`setImmediate` long-running orchestration)
  - **Impact:** Under concurrent usage, analysis jobs compete with request handling in the same process. Tail latency and timeout risk increases exactly when judges stress-test.
  - **Why this matters for judges:** Looks unstable under load and can produce “random slowness”.
  - **Fix (recommended):**
    - Move analysis to a durable queue (BullMQ/Redis or Trigger.dev).
    - API route should only enqueue and return job ID.
    - Worker handles ingestion/analyze/persist with retries + dead-letter.
  - **Acceptance check:**
    - 10 concurrent analyses should not degrade health endpoint P95 > 300ms.

  ### 2) Hard-delete reanalysis creates transient data-loss window
  - **Severity:** High
  - **Where:** `analysis.ts` deletes `fixes`, `gaps`, and `products` before reinserting.
  - **Impact:** During analysis, UI/API can temporarily show empty products/gaps; summary can appear inconsistent.
  - **Fix:**
    - Use versioned analysis snapshots (`analysis_run_id`) and swap active run pointer atomically.
    - Or transaction with staging tables + final swap.
  - **Acceptance check:**
    - Reads during reanalysis always return previous complete dataset until new run finalizes.

  ### 3) AI JSON parsing is brittle in multiple feature paths
  - **Severity:** High
  - **Where:** `ai-analyzer.ts` (validated), but `ai-features.ts` mostly does raw `JSON.parse` without schema validation.
  - **Impact:** Small model format drift can silently degrade endpoints (`query-simulation`, `topical-authority`, `internal-links`, `faq-schema`, `ai-qa`) into empty or malformed outputs.
  - **Fix:**
    - Add Zod schemas for every AI feature response in `ai-features.ts`.
    - Reject/repair malformed output (JSON extraction helper + schema-safe defaults).
    - Persist `generationStatus` and `generationError` alongside cached result.
  - **Acceptance check:**
    - With intentionally malformed provider responses, endpoints return stable typed fallback payloads and clear status metadata.

  ### 4) No deterministic quality benchmark loop for AI accuracy
  - **Severity:** High
  - **Where:** cross-cutting (AI layer and features)
  - **Impact:** Accuracy claims are hard to defend against strong competitors. You need measurable evidence, not only architecture.
  - **Fix:**
    - Build an offline eval suite:
      - 50-100 labeled product fixtures.
      - Golden expectations per rule and per AI endpoint output shape.
      - Weekly scorecard: precision/recall for gap detection and answerability consistency.
    - Add regression CI gate for eval deltas.
  - **Acceptance check:**
    - CI fails when model or prompt changes reduce KPI thresholds.

  ---

  ## Medium Findings (Should Fix for Final Polish)

  ### 5) Secrets at rest not encrypted (Shopify access tokens)
  - **Severity:** Medium
  - **Where:** store token persistence path (DB `stores.accessToken` usage)
  - **Impact:** DB compromise exposes merchant credentials directly.
  - **Fix:**
    - Encrypt tokens at rest with KMS-managed key or app-level envelope encryption.
    - Rotate key support + audit logging for decrypt operations.

  ### 6) Cache freshness strategy is coarse (24h fixed TTL)
  - **Severity:** Medium
  - **Where:** `features.ts` + `ai-features.ts`
  - **Impact:** Stale insights after major catalog edits; conversely unnecessary recomputation for unchanged stores.
  - **Fix:**
    - Add freshness key derived from product hash + updated timestamps.
    - Invalidate feature caches on meaningful content updates, not only time.

  ### 7) Rule-engine keyword heuristics likely overfit English and can false-positive
  - **Severity:** Medium
  - **Where:** `rule-engine.ts`
  - **Impact:** Non-English catalogs or unusual copy style may receive misleading penalties.
  - **Fix:**
    - Add language detection and locale-aware keyword packs.
    - Add exception rules and confidence score per violation.
    - Preserve raw matched evidence snippets for reviewability.

  ### 8) Benchmark endpoint scales poorly with dataset growth
  - **Severity:** Medium
  - **Where:** `analysis.ts` benchmark section querying all analyzed products.
  - **Impact:** O(N) read cost per request; slower dashboards as store count grows.
  - **Fix:**
    - Precompute percentiles via materialized view/job.
    - Serve benchmark from summarized table.

  ### 9) Gaps fixed-by-category can still over-close unrelated issues
  - **Severity:** Medium
  - **Where:** `fixes.ts` uses category mapping (`description -> completeness`, etc.)
  - **Impact:** One fix can mark multiple unrelated rules in same category as fixed.
  - **Fix:**
    - Link each generated fix to source `gapId`/`ruleId`.
    - Update only those targeted gap rows.

  ### 10) Insufficient structured observability for judge/debug confidence
  - **Severity:** Medium
  - **Where:** global backend
  - **Impact:** Hard to explain failures during live demo.
  - **Fix:**
    - Add metrics: job duration, step failure counts, provider fallback rate, cache hit rate.
    - Add correlation IDs across analysis substeps and webhooks.

  ---

  ## Low Findings (Quality + Maintainability)

  ### 11) `backend_pipeline.md` is now partially stale vs code
  - **Severity:** Low
  - **Examples:** several issues marked open in doc are already fixed in code.
  - **Fix:** regenerate this document after each fix round; treat as release artifact.

  ### 12) AI output provenance not exposed to frontend
  - **Severity:** Low
  - **Impact:** Users can’t distinguish deterministic vs AI-generated fields.
  - **Fix:** include `source: "rule" | "ai" | "fallback"` on major outputs.

  ### 13) Missing explicit idempotency keys for mutate endpoints
  - **Severity:** Low
  - **Where:** analyze/apply flows
  - **Impact:** retries from flaky clients may duplicate work in edge cases.
  - **Fix:** accept `Idempotency-Key` and persist operation dedupe per store.

  ---

  ## Already Improved (Good Signals)
  - Ownership checks now applied across major store-scoped routes.
  - `jobs` includes `completedAt` and `errorMessage` with status endpoint support.
  - CSRF pipeline exists and frontend wiring exists for mutating calls.
  - Session store moved from memory to Postgres-backed `connect-pg-simple`.
  - Rule-first scoring architecture remains a strong trust and explainability advantage.

  ---

  ## Strict Priority Plan (Execution Order)

  ### P0 (48 hours)
  1. Queue-based async analysis worker (remove in-process long runs).
  2. Remove hard-delete window (versioned snapshots + atomic switch).
  3. Add Zod validation to all `ai-features.ts` endpoints + fallback metadata.
  4. Add smoke-load test script and capture response-time baseline.

  ### P1 (3-5 days)
  1. Token encryption at rest.
  2. Rule-to-fix linkage (`fix.gapId`/`fix.ruleId`) and exact gap closure.
  3. Freshness-key cache invalidation.
  4. Benchmark precompute/materialized view.

  ### P2 (1 week)
  1. Offline eval harness with dataset + CI quality gates.
  2. Locale-aware heuristics and lower false-positive rate.
  3. Metrics dashboard (provider fallback %, cache hit %, analysis step timing).

  ---

  ## Suggested Judge-Facing Proof Pack
  - One-page architecture + deterministic/AI boundary.
  - Before/after merchant case study (real store snapshot).
  - Reliability evidence:
    - load-test chart (latency under concurrent analyses),
    - eval scorecard trend,
    - fallback behavior screenshot (when provider fails).
  - Security checklist:
    - CSRF, ownership checks, token handling, session hardening.

  ---

  ## Final Strict Scorecard
  - **Product thinking:** 9/10
  - **Backend correctness:** 8/10
  - **AI output robustness:** 6.5/10
  - **Scalability under stress:** 6/10
  - **Security/privacy posture:** 7/10
  - **Judge/demo resilience:** 7/10

  **Overall:** strong contender with clear differentiation, but needs reliability + eval hardening to beat top international teams consistently.
