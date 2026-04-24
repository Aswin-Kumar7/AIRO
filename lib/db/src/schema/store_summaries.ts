import { pgTable, text, timestamp, real, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const storeSummariesTable = pgTable("store_summaries", {
  storeId: text("store_id").primaryKey(),
  overallScore: real("overall_score").notNull().default(0),
  clarityScore: real("clarity_score").notNull().default(0),
  completenessScore: real("completeness_score").notNull().default(0),
  trustScore: real("trust_score").notNull().default(0),
  tagScore: real("tag_score").notNull().default(0),
  consistencyScore: real("consistency_score").notNull().default(0),
  policyScore: real("policy_score").notNull().default(0),
  totalProducts: integer("total_products").notNull().default(0),
  analyzedProducts: integer("analyzed_products").notNull().default(0),
  criticalIssues: integer("critical_issues").notNull().default(0),
  mediumIssues: integer("medium_issues").notNull().default(0),
  lowIssues: integer("low_issues").notNull().default(0),
  pendingFixes: integer("pending_fixes").notNull().default(0),
  appliedFixes: integer("applied_fixes").notNull().default(0),
  prioritizedActionPlan: jsonb("prioritized_action_plan").notNull().default([]),
  querySimulationResults: jsonb("query_simulation_results"),
  querySimulationCachedAt: timestamp("query_simulation_cached_at", { withTimezone: true }),
  topicalAuthorityResults: jsonb("topical_authority_results"),
  topicalAuthorityCachedAt: timestamp("topical_authority_cached_at", { withTimezone: true }),
  internalLinksResults: jsonb("internal_links_results"),
  internalLinksCachedAt: timestamp("internal_links_cached_at", { withTimezone: true }),
  // CB-6: SHA-256 hash of catalog content at the time each feature was last computed.
  // If the catalog changes, hashes diverge and the cache is invalidated automatically.
  queryCatalogHash: text("query_catalog_hash"),
  topicalCatalogHash: text("topical_catalog_hash"),
  linksCatalogHash: text("links_catalog_hash"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertStoreSummarySchema = createInsertSchema(storeSummariesTable);
export type InsertStoreSummary = z.infer<typeof insertStoreSummarySchema>;
export type StoreSummary = typeof storeSummariesTable.$inferSelect;
