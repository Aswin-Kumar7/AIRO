import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { storesTable } from "./stores";

export const jobsTable = pgTable("jobs", {
  id: text("id").primaryKey(),
  storeId: text("store_id").notNull().references(() => storesTable.id, { onDelete: "cascade" }),
  status: text("status").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  errorMessage: text("error_message"),
  // CB-12: idempotency key supplied by client — prevents duplicate analysis runs on retry
  idempotencyKey: text("idempotency_key"),
}, (t) => [
  index("jobs_store_id_idx").on(t.storeId),
  index("jobs_store_idempotency_idx").on(t.storeId, t.idempotencyKey),
  index("jobs_status_started_idx").on(t.status, t.startedAt),
]);

export const insertJobSchema = createInsertSchema(jobsTable);
export type InsertJob = z.infer<typeof insertJobSchema>;
export type Job = typeof jobsTable.$inferSelect;
