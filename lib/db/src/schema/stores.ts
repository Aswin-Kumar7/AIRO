import { pgTable, text, timestamp, real, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const storesTable = pgTable("stores", {
  id: text("id").primaryKey(),
  domain: text("domain").notNull().unique(),
  name: text("name").notNull(),
  accessToken: text("access_token").notNull(),
  desiredPositioning: text("desired_positioning"),
  status: text("status").notNull().default("connected"),
  productsFetched: boolean("products_fetched").notNull().default(false),
  lastAnalyzed: timestamp("last_analyzed", { withTimezone: true }),
  overallScore: real("overall_score"),
  productCount: integer("product_count"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertStoreSchema = createInsertSchema(storesTable).omit({ createdAt: true });
export type InsertStore = z.infer<typeof insertStoreSchema>;
export type Store = typeof storesTable.$inferSelect;
