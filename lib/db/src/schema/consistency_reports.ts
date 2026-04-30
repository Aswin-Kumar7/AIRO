import { pgTable, text, timestamp, real, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { storesTable } from "./stores";

export const consistencyReportsTable = pgTable("consistency_reports", {
  // PK doubles as FK — storeId is unique so no separate index needed
  storeId: text("store_id").primaryKey().references(() => storesTable.id, { onDelete: "cascade" }),
  overallConsistencyScore: real("overall_consistency_score").notNull().default(0),
  issues: jsonb("issues").notNull().default([]),
  suggestedStructure: text("suggested_structure").array().notNull().default([]),
  analyzedAt: timestamp("analyzed_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertConsistencyReportSchema = createInsertSchema(consistencyReportsTable);
export type InsertConsistencyReport = z.infer<typeof insertConsistencyReportSchema>;
export type ConsistencyReport = typeof consistencyReportsTable.$inferSelect;
