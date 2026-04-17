import { pgTable, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const gapsTable = pgTable("gaps", {
  id: text("id").primaryKey(),
  storeId: text("store_id").notNull(),
  productId: text("product_id"),
  category: text("category").notNull(),
  severity: text("severity").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  suggestion: text("suggestion").notNull(),
  isFixed: boolean("is_fixed").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertGapSchema = createInsertSchema(gapsTable).omit({ createdAt: true });
export type InsertGap = z.infer<typeof insertGapSchema>;
export type Gap = typeof gapsTable.$inferSelect;
