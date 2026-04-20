# Implementation Plan: KaspySense AI Readiness Analyzer
> **Note:** This document has been updated to reflect the actual production architecture: Express (API), Vite (Frontend), and @google/generative-ai (Gemini).

## Architecture Overview
- **Backend**: Node.js + Express (TypeScript).
- **Frontend**: React (Vite) + Wouter (Routing) + TanStack Query.
- **Database**: PostgreSQL + Drizzle ORM.
- **AI**: Google Gemini Pro via `@google/generative-ai`.
- **Styling**: Vanilla CSS + Tailwind + Lucide Icons.

---

## Module 1: Shopify & Multi-Tenant Core
**Goal:** Securely connect Shopify stores and isolate data.

- **`lib/db/src/schema/stores.ts`**: Stores `domain`, `accessToken`, and `userId`. Enforces per-tenant isolation.
- **`artifacts/api-server/src/routes/shopify.ts`**: Handles the Shopify connection flow, token validation, and OAuth session state.
- **`lib/api-client-react/src/custom-fetch.ts`**: Ensures all frontend requests include CSRF tokens and session cookies.

## Module 2: Data Ingestion & Enrichment
**Goal:** Extract a holistic view of the shop for AI reasoning.

- **`artifacts/api-server/src/lib/shopify-ingestion.ts`**:
  - **Batching**: Fetches products in chunks to handle large catalogs.
  - **Trust Signals**: Ingests vendor, product types, and tags.
  - **Web Presence**: Fetches live page HTML to detect JSON-LD structured data and AggregateRating (reviews) missing from metafields.
  - **Policies**: Pulls Shopify policies (Refund, Shipping) to evaluate trust factors.

## Module 3: AI Analyzer (The Brain)
**Goal:** Multi-dimensional store evaluation using Gemini.

- **`artifacts/api-server/src/lib/ai-analyzer.ts`**:
  - Uses `@google/generative-ai` with fallback logic across different Gemini models/providers.
  - **Dimensions**: Evaluates Clarity, Completeness, Trust, and Tag Quality.
  - **Perception Simulation**: Generates an "AI Perception Report" describing how an LLM sees the store.
  - **Gap Detection**: Identifies specific inconsistencies (e.g., missing materials in 20% of products).
  - **Strict Validation**: Uses `zod` to ensure AI outputs match expected schemas (Clarity: 0-100, Tags: array of strings).

## Module 4: Scoring & Benchmarking
**Goal:** Quantify readiness and compare against the market.

- **`artifacts/api-server/src/routes/analysis.ts`**:
  - **Dynamic Benchmarking**: Computes P90 scores from all stores in the database.
  - **Aspirational Fallback**: Falls back to "Not enough data" or aspirational targets if the sample size is < 10 stores (M-7).
  - **Job Persistence**: Uses a `jobs` table to track analysis progress across server restarts (C-3).

## Module 5: Automated Fix Generation
**Goal:** Turn identified gaps into one-click improvements.

- **`artifacts/api-server/src/routes/fixes.ts`**:
  - **Single & Bulk Apply**: Updates Shopify product titles, descriptions, and tags.
  - **Manual Fix Handling**: Flags `structure` and `schema` fixes as manual actions since they often require theme-level changes (M-3).
  - **Verification**: Re-fetches the product from Shopify after a write to verify the change actually landed (M-2).

## Module 6: Dashboard & Visualization (Frontend)
**Goal:** Premium, actionable UI for the merchant.

- **`artifacts/ai-readiness/src/pages/dashboard.tsx`**: Consolidated view for Gap Analysis, Perception Report, and Scoring history.
- **`artifacts/ai-readiness/src/pages/connect.tsx`**: Onboarding flow with session-prefill for a seamless entry (M-6).
- **`artifacts/ai-readiness/src/App.tsx`**: Global Error Boundary wrapping the router to prevent white-screen crashes (M-8).

---

## Technical Stack Reference
- **Frontend Framework**: Vite + React
- **API Framework**: Express
- **ORM**: Drizzle ORM
- **AI SDK**: `@google/generative-ai`
- **State Management**: TanStack Query (React Query)
- **Security**: `express-session` with `connect-pg-simple`, `csrf-sync`, `helmet`.
