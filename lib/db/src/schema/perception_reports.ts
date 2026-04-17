import { pgTable, text, timestamp, jsonb, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const perceptionReportsTable = pgTable("perception_reports", {
  storeId: text("store_id").primaryKey(),
  agentNarrative: text("agent_narrative").notNull().default(""),
  unansweredQuestions: jsonb("unanswered_questions").notNull().default([]),
  ambiguities: jsonb("ambiguities").notNull().default([]),
  perceivedStrengths: jsonb("perceived_strengths").notNull().default([]),
  faqPageFound: boolean("faq_page_found").notNull().default(false),
  faqPageTitle: text("faq_page_title"),
  faqQuestionCount: integer("faq_question_count").notNull().default(0),
  faqGaps: jsonb("faq_gaps").notNull().default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPerceptionReportSchema = createInsertSchema(perceptionReportsTable);
export type InsertPerceptionReport = z.infer<typeof insertPerceptionReportSchema>;
export type PerceptionReport = typeof perceptionReportsTable.$inferSelect;