import { pgTable, text, timestamp, real, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const productsTable = pgTable("products", {
  id: text("id").primaryKey(),
  storeId: text("store_id").notNull(),
  shopifyProductId: text("shopify_product_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  productType: text("product_type"),
  vendor: text("vendor"),
  tags: text("tags").array().notNull().default([]),
  collections: text("collections").array().notNull().default([]),
  imageUrl: text("image_url"),
  price: text("price"),
  reviewCount: integer("review_count").notNull().default(0),
  reviewRating: real("review_rating").notNull().default(0),
  hasStructuredData: boolean("has_structured_data").notNull().default(false),
  clarityScore: real("clarity_score").notNull().default(0),
  completenessScore: real("completeness_score").notNull().default(0),
  trustScore: real("trust_score").notNull().default(0),
  tagScore: real("tag_score").notNull().default(0),
  overallScore: real("overall_score").notNull().default(0),
  issueCount: integer("issue_count").notNull().default(0),
  hasAppliedFixes: boolean("has_applied_fixes").notNull().default(false),
  aiPerceptionSummary: text("ai_perception_summary"),
  // CB-11: AI output provenance — was clarity score from AI, rule-based fallback, or hard fallback?
  scoringSource: text("scoring_source").$type<"ai" | "rule" | "fallback">(),
  suggestedTags: text("suggested_tags").array().notNull().default([]),
  aiQaResults: jsonb("ai_qa_results"),
  aiQaCachedAt: timestamp("ai_qa_cached_at", { withTimezone: true }),
  analyzedAt: timestamp("analyzed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertProductSchema = createInsertSchema(productsTable).omit({ createdAt: true });
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof productsTable.$inferSelect;
