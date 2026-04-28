import { pgTable, text, timestamp, real, integer, jsonb } from "drizzle-orm/pg-core";

export const productScoreHistoryTable = pgTable("product_score_history", {
  id: text("id").primaryKey(),
  storeId: text("store_id").notNull(),
  productId: text("product_id").notNull(),
  shopifyProductId: text("shopify_product_id").notNull(),
  productTitle: text("product_title").notNull(),
  // Scores at this point in time
  overallScore: real("overall_score").notNull(),
  clarityScore: real("clarity_score").notNull(),
  completenessScore: real("completeness_score").notNull(),
  trustScore: real("trust_score").notNull(),
  tagScore: real("tag_score").notNull(),
  imageQualityScore: real("image_quality_score"),
  issueCount: integer("issue_count").notNull().default(0),
  // Delta vs previous snapshot (null on first run)
  deltaOverall: real("delta_overall"),
  deltaClarity: real("delta_clarity"),
  deltaCompleteness: real("delta_completeness"),
  deltaTrust: real("delta_trust"),
  deltaTags: real("delta_tags"),
  // What changed (new issues added, issues resolved)
  newIssues: jsonb("new_issues"),   // array of {title, severity}
  resolvedIssues: jsonb("resolved_issues"),
  triggeredBy: text("triggered_by").notNull().default("manual"), // "manual" | "scheduled"
  correlationId: text("correlation_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
