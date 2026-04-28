import cron from "node-cron";
import { toZonedTime, fromZonedTime } from "date-fns-tz";
import { eq, lte, and, isNotNull } from "drizzle-orm";
import {
  db,
  scheduledAnalysesTable,
  storesTable,
  storeSummariesTable,
  scoreSnapshotsTable,
  activityTable,
} from "@workspace/db";
import { logger } from "./logger";
import { generateId } from "./id";
import { sendScheduledReport, sendVisibilityPulse, type ScoreData } from "./email";
import { executeAnalysisPipeline } from "./analysis-pipeline";

let schedulerStarted = false;

export function startScheduler(): void {
  if (schedulerStarted) return;
  schedulerStarted = true;

  // Tick every minute — check for stores whose nextRunAt has passed
  cron.schedule("* * * * *", async () => {
    try {
      await runDueSchedules();
    } catch (err) {
      logger.error({ err }, "Scheduler tick error");
    }
  });

  logger.info("Scheduled analysis cron started");
}

async function runDueSchedules(): Promise<void> {
  const now = new Date();

  const dueSchedules = await db
    .select({
      schedule: scheduledAnalysesTable,
      store: storesTable,
    })
    .from(scheduledAnalysesTable)
    .innerJoin(storesTable, eq(scheduledAnalysesTable.storeId, storesTable.id))
    .where(
      and(
        eq(scheduledAnalysesTable.enabled, true),
        eq(scheduledAnalysesTable.paused, false),
        isNotNull(scheduledAnalysesTable.nextRunAt),
        lte(scheduledAnalysesTable.nextRunAt, now),
      ),
    );

  for (const { schedule, store } of dueSchedules) {
    // Immediately advance nextRunAt to prevent duplicate runs if the analysis takes > 1 minute
    const nextRun = computeNextRun(schedule);
    await db
      .update(scheduledAnalysesTable)
      .set({ nextRunAt: nextRun, lastRunAt: now, updatedAt: now })
      .where(eq(scheduledAnalysesTable.storeId, schedule.storeId));

    runScheduledAnalysis(store, schedule).catch((err) => {
      logger.error({ err, storeId: store.id }, "Scheduled analysis failed");
    });
  }
}

async function runScheduledAnalysis(
  store: typeof storesTable.$inferSelect,
  schedule: typeof scheduledAnalysesTable.$inferSelect,
): Promise<void> {
  const snapshotId = generateId();
  const storeId = store.id;

  logger.info({ storeId, snapshotId }, "Running scheduled analysis");

  // Capture previous scores before overwriting
  const [prevSummary] = await db
    .select()
    .from(storeSummariesTable)
    .where(eq(storeSummariesTable.storeId, storeId));

  const previousScores: ScoreData | null = prevSummary
    ? {
        overall: prevSummary.overallScore,
        clarity: prevSummary.clarityScore,
        completeness: prevSummary.completenessScore,
        trust: prevSummary.trustScore,
        tags: prevSummary.tagScore,
        consistency: prevSummary.consistencyScore,
        policy: prevSummary.policyScore,
      }
    : null;

  let analysisError: string | null = null;
  let currentScores: ScoreData | null = null;

  try {
    await executeAnalysisPipeline(store, snapshotId);

    const [newSummary] = await db
      .select()
      .from(storeSummariesTable)
      .where(eq(storeSummariesTable.storeId, storeId));

    if (newSummary) {
      currentScores = {
        overall: newSummary.overallScore,
        clarity: newSummary.clarityScore,
        completeness: newSummary.completenessScore,
        trust: newSummary.trustScore,
        tags: newSummary.tagScore,
        consistency: newSummary.consistencyScore,
        policy: newSummary.policyScore,
      };
    }
  } catch (err) {
    analysisError = err instanceof Error ? err.message : "Unknown error";
    logger.error({ err, storeId }, "Scheduled analysis pipeline failed");
  }

  // Write the snapshot regardless of success/failure
  const [finalSummary] = await db
    .select()
    .from(storeSummariesTable)
    .where(eq(storeSummariesTable.storeId, storeId));

  await db.insert(scoreSnapshotsTable).values({
    id: snapshotId,
    storeId,
    triggeredBy: "scheduled",
    overallScore: analysisError ? null : (finalSummary?.overallScore ?? null),
    clarityScore: analysisError ? null : (finalSummary?.clarityScore ?? null),
    completenessScore: analysisError ? null : (finalSummary?.completenessScore ?? null),
    trustScore: analysisError ? null : (finalSummary?.trustScore ?? null),
    tagScore: analysisError ? null : (finalSummary?.tagScore ?? null),
    consistencyScore: analysisError ? null : (finalSummary?.consistencyScore ?? null),
    policyScore: analysisError ? null : (finalSummary?.policyScore ?? null),
    totalProducts: finalSummary?.totalProducts ?? null,
    analyzedProducts: finalSummary?.analyzedProducts ?? null,
    criticalIssues: finalSummary?.criticalIssues ?? null,
    mediumIssues: finalSummary?.mediumIssues ?? null,
    lowIssues: finalSummary?.lowIssues ?? null,
    error: analysisError,
    emailSent: false,
    metadata: { scheduledBy: "cron", frequency: schedule.frequency },
  });

  await db.insert(activityTable).values({
    id: generateId(),
    storeId,
    type: analysisError ? "analysis_failed" : "analysis_completed",
    message: analysisError
      ? `Scheduled analysis failed — ${analysisError}`
      : `Scheduled analysis complete — overall score: ${Math.round(finalSummary?.overallScore ?? 0)}/100`,
    metadata: { snapshotId, triggeredBy: "scheduled" },
  });

  if (analysisError || !currentScores || !finalSummary) return;

  // Determine whether to send email
  const recipients = schedule.emailRecipients
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);

  if (recipients.length === 0) {
    await db
      .update(scoreSnapshotsTable)
      .set({ emailSkippedReason: "no_recipients" })
      .where(eq(scoreSnapshotsTable.id, snapshotId));
    return;
  }

  const delta = previousScores !== null ? currentScores.overall - previousScores.overall : null;

  // "only on change" check
  if (schedule.emailOnlyOnChange && delta !== null && Math.abs(delta) < schedule.minDeltaToNotify) {
    await db
      .update(scoreSnapshotsTable)
      .set({ emailSkippedReason: "no_change" })
      .where(eq(scoreSnapshotsTable.id, snapshotId));
    logger.info({ storeId, delta }, "Skipping email — score didn't change enough");
    return;
  }

  // "only on regression" check
  if (schedule.emailOnlyOnRegression && delta !== null && delta >= 0) {
    await db
      .update(scoreSnapshotsTable)
      .set({ emailSkippedReason: "regression_only" })
      .where(eq(scoreSnapshotsTable.id, snapshotId));
    logger.info({ storeId, delta }, "Skipping email — no regression detected");
    return;
  }

  const dashboardUrl = `${process.env.APP_URL ?? "https://app.kasparro.com"}/dashboard/${storeId}`;
  const { sent, error: emailError } = await sendScheduledReport({
    storeName: store.name,
    storeDomain: store.domain,
    recipientEmails: recipients,
    currentScores,
    previousScores,
    totalProducts: finalSummary.totalProducts,
    criticalIssues: finalSummary.criticalIssues,
    pendingFixes: finalSummary.pendingFixes,
    snapshotId,
    dashboardUrl,
  });

  await db
    .update(scoreSnapshotsTable)
    .set({
      emailSent: sent,
      emailSkippedReason: sent ? null : (emailError ?? "send_failed"),
    })
    .where(eq(scoreSnapshotsTable.id, snapshotId));

  // Send AI Visibility Pulse for weekly schedules (supplementary email with AI-focused framing)
  if (schedule.frequency === "weekly" && sent && recipients.length > 0) {
    const topIssues = (finalSummary.prioritizedActionPlan as Array<{ title?: string; severity?: string }> | undefined ?? [])
      .slice(0, 5)
      .map((item) => ({ title: item.title ?? "Unknown issue", severity: item.severity ?? "medium" }));

    const topRecommendations = topIssues.slice(0, 3).map((i) => i.title);

    await sendVisibilityPulse({
      storeName: store.name,
      storeDomain: store.domain,
      recipientEmails: recipients,
      weekOf: new Date().toISOString(),
      overallScore: currentScores.overall,
      previousOverall: previousScores?.overall ?? null,
      aiReadinessScore: currentScores.overall,
      topIssues,
      topRecommendations,
      pendingFixes: finalSummary.pendingFixes,
      criticalIssues: finalSummary.criticalIssues,
      dashboardUrl,
    }).catch((err) => {
      logger.warn({ err, storeId }, "AI Visibility Pulse email failed — non-critical");
    });
  }
}

export function computeNextRun(schedule: typeof scheduledAnalysesTable.$inferSelect): Date {
  const tz = schedule.timezone || "UTC";
  const now = new Date();
  const nowInTz = toZonedTime(now, tz);

  const candidate = new Date(nowInTz);
  candidate.setMinutes(0, 0, 0);
  candidate.setHours(schedule.hourUtc);

  if (schedule.frequency === "daily") {
    if (candidate <= nowInTz) candidate.setDate(candidate.getDate() + 1);
    return fromZonedTime(candidate, tz);
  }

  if (schedule.frequency === "weekly") {
    const targetDay = schedule.dayOfWeek ?? 1; // default Monday
    const daysUntil = (targetDay - candidate.getDay() + 7) % 7;
    candidate.setDate(candidate.getDate() + (daysUntil === 0 && candidate <= nowInTz ? 7 : daysUntil));
    return fromZonedTime(candidate, tz);
  }

  if (schedule.frequency === "monthly") {
    const targetDay = Math.min(schedule.dayOfMonth ?? 1, 28);
    candidate.setDate(targetDay);
    if (candidate <= nowInTz) {
      candidate.setMonth(candidate.getMonth() + 1);
      candidate.setDate(targetDay);
    }
    return fromZonedTime(candidate, tz);
  }

  // Fallback: 1 week from now
  candidate.setDate(candidate.getDate() + 7);
  return fromZonedTime(candidate, tz);
}
