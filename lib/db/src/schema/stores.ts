import { pgTable, text, timestamp, real, integer, boolean, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

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
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  // Needed for dashboard load: "give me all stores for this user"
  index("stores_user_id_idx").on(t.userId),
]);

export const insertStoreSchema = createInsertSchema(storesTable).omit({ createdAt: true });
export type InsertStore = z.infer<typeof insertStoreSchema>;
export type Store = typeof storesTable.$inferSelect;
