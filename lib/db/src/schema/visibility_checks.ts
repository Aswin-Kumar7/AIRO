import { pgTable, text, boolean, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { storesTable } from "./stores";

export const visibilityChecksTable = pgTable("visibility_checks", {
  id: text("id").primaryKey(),
  storeId: text("store_id").notNull().references(() => storesTable.id, { onDelete: "cascade" }),
  query: text("query").notNull(),
  queryType: text("query_type").notNull().default("manual"),
  // e.g. "ChatGPT", "Perplexity", "Claude", "Gemini", "Copilot"
  aiEngine: text("ai_engine"),
  wasCited: boolean("was_cited").notNull().default(false),
  citationUrl: text("citation_url"),
  notes: text("notes"),
  checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertVisibilityCheckSchema = createInsertSchema(visibilityChecksTable);
export type InsertVisibilityCheck = z.infer<typeof insertVisibilityCheckSchema>;
export type VisibilityCheck = typeof visibilityChecksTable.$inferSelect;
