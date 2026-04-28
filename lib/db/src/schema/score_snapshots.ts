import { pgTable, text, timestamp, real, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const scoreSnapshotsTable = pgTable("score_snapshots", {
  id: text("id").primaryKey(),
  storeId: text("store_id").notNull(),
  triggeredBy: text("triggered_by").notNull(), // "manual" | "scheduled"
  overallScore: real("overall_score"),
  clarityScore: real("clarity_score"),
  completenessScore: real("completeness_score"),
  trustScore: real("trust_score"),
  tagScore: real("tag_score"),
  consistencyScore: real("consistency_score"),
  policyScore: real("policy_score"),
  totalProducts: integer("total_products"),
  analyzedProducts: integer("analyzed_products"),
  criticalIssues: integer("critical_issues"),
  mediumIssues: integer("medium_issues"),
  lowIssues: integer("low_issues"),
  error: text("error"),
  emailSent: boolean("email_sent").notNull().default(false),
  emailSkippedReason: text("email_skipped_reason"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertScoreSnapshotSchema = createInsertSchema(scoreSnapshotsTable);
export type InsertScoreSnapshot = z.infer<typeof insertScoreSnapshotSchema>;
export type ScoreSnapshot = typeof scoreSnapshotsTable.$inferSelect;
