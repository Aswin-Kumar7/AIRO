import { pgTable, text, boolean, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const scheduledAnalysesTable = pgTable("scheduled_analyses", {
  storeId: text("store_id").primaryKey(),
  enabled: boolean("enabled").notNull().default(false),
  paused: boolean("paused").notNull().default(false),
  frequency: text("frequency").notNull().default("weekly"), // "daily" | "weekly" | "monthly"
  dayOfWeek: integer("day_of_week"), // 0=Sun…6=Sat, for weekly
  dayOfMonth: integer("day_of_month"), // 1–28, for monthly
  hourUtc: integer("hour_utc").notNull().default(9),
  timezone: text("timezone").notNull().default("UTC"),
  emailRecipients: text("email_recipients").notNull().default(""), // comma-separated
  emailOnlyOnChange: boolean("email_only_on_change").notNull().default(false),
  emailOnlyOnRegression: boolean("email_only_on_regression").notNull().default(false),
  minDeltaToNotify: integer("min_delta_to_notify").notNull().default(0), // threshold for "changed enough"
  nextRunAt: timestamp("next_run_at", { withTimezone: true }),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertScheduledAnalysisSchema = createInsertSchema(scheduledAnalysesTable);
export type InsertScheduledAnalysis = z.infer<typeof insertScheduledAnalysisSchema>;
export type ScheduledAnalysis = typeof scheduledAnalysesTable.$inferSelect;
