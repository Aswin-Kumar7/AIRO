import { pgTable, text, timestamp, boolean, real, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { storesTable } from "./stores";

export const gapsTable = pgTable("gaps", {
  id: text("id").primaryKey(),
  storeId: text("store_id").notNull().references(() => storesTable.id, { onDelete: "cascade" }),
  productId: text("product_id"),
  category: text("category").notNull(),
  severity: text("severity").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  suggestion: text("suggestion").notNull(),
  evidence: text("evidence"),
  impactScore: real("impact_score").notNull().default(50),
  effortLevel: text("effort_level").notNull().default("medium"),
  ruleId: text("rule_id"),
  isFixed: boolean("is_fixed").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("gaps_store_id_idx").on(t.storeId),
  index("gaps_store_product_idx").on(t.storeId, t.productId),
]);

export const insertGapSchema = createInsertSchema(gapsTable).omit({ createdAt: true });
export type InsertGap = z.infer<typeof insertGapSchema>;
export type Gap = typeof gapsTable.$inferSelect;
