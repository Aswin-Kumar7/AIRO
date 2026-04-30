import { pgTable, text, timestamp, real, boolean, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { storesTable } from "./stores";

export const fixesTable = pgTable("fixes", {
  id: text("id").primaryKey(),
  storeId: text("store_id").notNull().references(() => storesTable.id, { onDelete: "cascade" }),
  productId: text("product_id"),
  // CB-9: links fix back to the exact gap it resolves, enabling precise gap closure
  sourceGapId: text("source_gap_id"),
  type: text("type").notNull(),
  status: text("status").notNull().default("pending"),
  title: text("title").notNull(),
  originalContent: text("original_content").notNull(),
  improvedContent: text("improved_content").notNull(),
  editedContent: text("edited_content"),
  explanation: text("explanation").notNull(),
  roiRationale: text("roi_rationale"),
  estimatedScoreImprovement: real("estimated_score_improvement").notNull().default(0),
  shopifySynced: boolean("shopify_synced").notNull().default(false),
  shopifyError: text("shopify_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  appliedAt: timestamp("applied_at", { withTimezone: true }),
}, (t) => [
  index("fixes_store_id_idx").on(t.storeId),
  index("fixes_store_product_status_idx").on(t.storeId, t.productId, t.type, t.status),
]);

export const insertFixSchema = createInsertSchema(fixesTable).omit({ createdAt: true });
export type InsertFix = z.infer<typeof insertFixSchema>;
export type Fix = typeof fixesTable.$inferSelect;
