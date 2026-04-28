import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, storesTable, scheduledAnalysesTable, scoreSnapshotsTable } from "@workspace/db";
import { computeNextRun } from "../lib/scheduler";
import { sendScheduledReport } from "../lib/email";
import { generateId } from "../lib/id";
import { getOwnedStore } from "../lib/owned-store";

const router: IRouter = Router();

// GET /stores/:storeId/schedule
router.get("/stores/:storeId/schedule", async (req, res): Promise<void> => {
  const storeId = Array.isArray(req.params.storeId) ? req.params.storeId[0] : req.params.storeId;
  const userId = req.session?.userId;
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const store = await getOwnedStore(storeId, userId);
  if (!store) { res.status(403).json({ error: "Forbidden" }); return; }

  const [schedule] = await db.select().from(scheduledAnalysesTable).where(eq(scheduledAnalysesTable.storeId, storeId));

  res.json(schedule ? serializeSchedule(schedule) : defaultSchedule(storeId));
});

// PUT /stores/:storeId/schedule  — upsert full schedule config
router.put("/stores/:storeId/schedule", async (req, res): Promise<void> => {
  const storeId = Array.isArray(req.params.storeId) ? req.params.storeId[0] : req.params.storeId;
  const userId = req.session?.userId;
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const store = await getOwnedStore(storeId, userId);
  if (!store) { res.status(403).json({ error: "Forbidden" }); return; }

  const body = req.body as {
    enabled?: boolean;
    paused?: boolean;
    frequency?: string;
    dayOfWeek?: number;
    dayOfMonth?: number;
    hourUtc?: number;
    timezone?: string;
    emailRecipients?: string;
    emailOnlyOnChange?: boolean;
    emailOnlyOnRegression?: boolean;
    minDeltaToNotify?: number;
  };

  // Merge with existing or defaults, then compute nextRunAt
  const [existing] = await db.select().from(scheduledAnalysesTable).where(eq(scheduledAnalysesTable.storeId, storeId));
  const merged = {
    storeId,
    enabled: body.enabled ?? existing?.enabled ?? false,
    paused: body.paused ?? existing?.paused ?? false,
    frequency: body.frequency ?? existing?.frequency ?? "weekly",
    dayOfWeek: body.dayOfWeek ?? existing?.dayOfWeek ?? 1,
    dayOfMonth: body.dayOfMonth ?? existing?.dayOfMonth ?? 1,
    hourUtc: body.hourUtc ?? existing?.hourUtc ?? 9,
    timezone: body.timezone ?? existing?.timezone ?? "UTC",
    emailRecipients: body.emailRecipients ?? existing?.emailRecipients ?? "",
    emailOnlyOnChange: body.emailOnlyOnChange ?? existing?.emailOnlyOnChange ?? false,
    emailOnlyOnRegression: body.emailOnlyOnRegression ?? existing?.emailOnlyOnRegression ?? false,
    minDeltaToNotify: body.minDeltaToNotify ?? existing?.minDeltaToNotify ?? 0,
    updatedAt: new Date(),
  };

  const nextRunAt = merged.enabled && !merged.paused
    ? computeNextRun(merged as typeof scheduledAnalysesTable.$inferSelect)
    : null;

  await db.insert(scheduledAnalysesTable).values({ ...merged, nextRunAt }).onConflictDoUpdate({
    target: scheduledAnalysesTable.storeId,
    set: { ...merged, nextRunAt },
  });

  const [updated] = await db.select().from(scheduledAnalysesTable).where(eq(scheduledAnalysesTable.storeId, storeId));
  res.json(serializeSchedule(updated!));
});

// PATCH /stores/:storeId/schedule/toggle  — enable/disable without touching other settings
router.patch("/stores/:storeId/schedule/toggle", async (req, res): Promise<void> => {
  const storeId = Array.isArray(req.params.storeId) ? req.params.storeId[0] : req.params.storeId;
  const userId = req.session?.userId;
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const store = await getOwnedStore(storeId, userId);
  if (!store) { res.status(403).json({ error: "Forbidden" }); return; }

  const { enabled } = req.body as { enabled?: boolean };
  if (enabled === undefined) { res.status(400).json({ error: "enabled field required" }); return; }

  const [schedule] = await db.select().from(scheduledAnalysesTable).where(eq(scheduledAnalysesTable.storeId, storeId));
  if (!schedule) { res.status(404).json({ error: "No schedule configured for this store" }); return; }

  const nextRunAt = enabled && !schedule.paused
    ? computeNextRun({ ...schedule, enabled: true })
    : null;

  await db.update(scheduledAnalysesTable).set({ enabled, nextRunAt, updatedAt: new Date() }).where(eq(scheduledAnalysesTable.storeId, storeId));

  const [updated] = await db.select().from(scheduledAnalysesTable).where(eq(scheduledAnalysesTable.storeId, storeId));
  res.json(serializeSchedule(updated!));
});

// PATCH /stores/:storeId/schedule/pause  — soft pause (keeps schedule config)
router.patch("/stores/:storeId/schedule/pause", async (req, res): Promise<void> => {
  const storeId = Array.isArray(req.params.storeId) ? req.params.storeId[0] : req.params.storeId;
  const userId = req.session?.userId;
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const store = await getOwnedStore(storeId, userId);
  if (!store) { res.status(403).json({ error: "Forbidden" }); return; }

  const { paused } = req.body as { paused?: boolean };
  if (paused === undefined) { res.status(400).json({ error: "paused field required" }); return; }

  const [schedule] = await db.select().from(scheduledAnalysesTable).where(eq(scheduledAnalysesTable.storeId, storeId));
  if (!schedule) { res.status(404).json({ error: "No schedule configured" }); return; }

  const nextRunAt = schedule.enabled && !paused
    ? computeNextRun({ ...schedule, paused: false })
    : null;

  await db.update(scheduledAnalysesTable).set({ paused, nextRunAt, updatedAt: new Date() }).where(eq(scheduledAnalysesTable.storeId, storeId));

  const [updated] = await db.select().from(scheduledAnalysesTable).where(eq(scheduledAnalysesTable.storeId, storeId));
  res.json(serializeSchedule(updated!));
});

// DELETE /stores/:storeId/schedule
router.delete("/stores/:storeId/schedule", async (req, res): Promise<void> => {
  const storeId = Array.isArray(req.params.storeId) ? req.params.storeId[0] : req.params.storeId;
  const userId = req.session?.userId;
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const store = await getOwnedStore(storeId, userId);
  if (!store) { res.status(403).json({ error: "Forbidden" }); return; }

  await db.delete(scheduledAnalysesTable).where(eq(scheduledAnalysesTable.storeId, storeId));
  res.json({ deleted: true });
});

// GET /stores/:storeId/snapshots  — paginated run history
router.get("/stores/:storeId/snapshots", async (req, res): Promise<void> => {
  const storeId = Array.isArray(req.params.storeId) ? req.params.storeId[0] : req.params.storeId;
  const userId = req.session?.userId;
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const store = await getOwnedStore(storeId, userId);
  if (!store) { res.status(403).json({ error: "Forbidden" }); return; }

  const limit = Math.min(Number(req.query.limit) || 30, 100);
  const offset = Number(req.query.offset) || 0;

  const snapshots = await db
    .select()
    .from(scoreSnapshotsTable)
    .where(eq(scoreSnapshotsTable.storeId, storeId))
    .orderBy(desc(scoreSnapshotsTable.createdAt))
    .limit(limit)
    .offset(offset);

  res.json(snapshots.map(serializeSnapshot));
});

// GET /stores/:storeId/snapshots/:snapshotId
router.get("/stores/:storeId/snapshots/:snapshotId", async (req, res): Promise<void> => {
  const storeId = Array.isArray(req.params.storeId) ? req.params.storeId[0] : req.params.storeId;
  const snapshotId = Array.isArray(req.params.snapshotId) ? req.params.snapshotId[0] : req.params.snapshotId;
  const userId = req.session?.userId;
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const store = await getOwnedStore(storeId, userId);
  if (!store) { res.status(403).json({ error: "Forbidden" }); return; }

  const [snapshot] = await db
    .select()
    .from(scoreSnapshotsTable)
    .where(and(eq(scoreSnapshotsTable.id, snapshotId), eq(scoreSnapshotsTable.storeId, storeId)));

  if (!snapshot) { res.status(404).json({ error: "Snapshot not found" }); return; }
  res.json(serializeSnapshot(snapshot));
});

// POST /stores/:storeId/schedule/test-email  — send a test report right now
router.post("/stores/:storeId/schedule/test-email", async (req, res): Promise<void> => {
  const storeId = Array.isArray(req.params.storeId) ? req.params.storeId[0] : req.params.storeId;
  const userId = req.session?.userId;
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const store = await getOwnedStore(storeId, userId);
  if (!store) { res.status(403).json({ error: "Forbidden" }); return; }

  const [schedule] = await db.select().from(scheduledAnalysesTable).where(eq(scheduledAnalysesTable.storeId, storeId));
  if (!schedule) { res.status(400).json({ error: "No schedule configured" }); return; }

  const recipients = schedule.emailRecipients.split(",").map((e) => e.trim()).filter(Boolean);
  if (recipients.length === 0) { res.status(400).json({ error: "No email recipients configured" }); return; }

  const [latestSnapshot] = await db
    .select()
    .from(scoreSnapshotsTable)
    .where(eq(scoreSnapshotsTable.storeId, storeId))
    .orderBy(desc(scoreSnapshotsTable.createdAt))
    .limit(1);

  const scores = {
    overall: latestSnapshot?.overallScore ?? 0,
    clarity: latestSnapshot?.clarityScore ?? 0,
    completeness: latestSnapshot?.completenessScore ?? 0,
    trust: latestSnapshot?.trustScore ?? 0,
    tags: latestSnapshot?.tagScore ?? 0,
    consistency: latestSnapshot?.consistencyScore ?? 0,
    policy: latestSnapshot?.policyScore ?? 0,
  };

  const dashboardUrl = `${process.env.APP_URL ?? "https://app.kasparro.com"}/dashboard/${storeId}`;
  const { sent, error } = await sendScheduledReport({
    storeName: store.name,
    storeDomain: store.domain,
    recipientEmails: recipients,
    currentScores: scores,
    previousScores: null,
    totalProducts: latestSnapshot?.totalProducts ?? 0,
    criticalIssues: latestSnapshot?.criticalIssues ?? 0,
    pendingFixes: 0,
    snapshotId: latestSnapshot?.id ?? "test",
    dashboardUrl,
  });

  res.json({ sent, error: error ?? null, recipients });
});

// GET /stores/:storeId/snapshots/export.csv  — Google Sheets-compatible CSV export
router.get("/stores/:storeId/snapshots/export.csv", async (req, res): Promise<void> => {
  const storeId = Array.isArray(req.params.storeId) ? req.params.storeId[0] : req.params.storeId;
  const userId = req.session?.userId;
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const store = await getOwnedStore(storeId, userId);
  if (!store) { res.status(403).json({ error: "Forbidden" }); return; }

  const snapshots = await db
    .select()
    .from(scoreSnapshotsTable)
    .where(eq(scoreSnapshotsTable.storeId, storeId))
    .orderBy(desc(scoreSnapshotsTable.createdAt))
    .limit(500);

  const header = "Date,Trigger,Overall,Clarity,Completeness,Trust,Tags,Consistency,Policy,Products,Critical Issues,Error";
  const rows = snapshots.map((s) => [
    s.createdAt.toISOString(),
    s.triggeredBy,
    s.overallScore ?? "",
    s.clarityScore ?? "",
    s.completenessScore ?? "",
    s.trustScore ?? "",
    s.tagScore ?? "",
    s.consistencyScore ?? "",
    s.policyScore ?? "",
    s.totalProducts ?? "",
    s.criticalIssues ?? "",
    s.error ? `"${s.error.replace(/"/g, '""')}"` : "",
  ].join(","));

  const csv = [header, ...rows].join("\n");
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="score-history-${storeId}.csv"`);
  res.send(csv);
});

function serializeSchedule(s: typeof scheduledAnalysesTable.$inferSelect) {
  return {
    storeId: s.storeId,
    enabled: s.enabled,
    paused: s.paused,
    frequency: s.frequency,
    dayOfWeek: s.dayOfWeek,
    dayOfMonth: s.dayOfMonth,
    hourUtc: s.hourUtc,
    timezone: s.timezone,
    emailRecipients: s.emailRecipients,
    emailOnlyOnChange: s.emailOnlyOnChange,
    emailOnlyOnRegression: s.emailOnlyOnRegression,
    minDeltaToNotify: s.minDeltaToNotify,
    nextRunAt: s.nextRunAt?.toISOString() ?? null,
    lastRunAt: s.lastRunAt?.toISOString() ?? null,
    updatedAt: s.updatedAt.toISOString(),
  };
}

function defaultSchedule(storeId: string) {
  return {
    storeId,
    enabled: false,
    paused: false,
    frequency: "weekly",
    dayOfWeek: 1,
    dayOfMonth: 1,
    hourUtc: 9,
    timezone: "UTC",
    emailRecipients: "",
    emailOnlyOnChange: false,
    emailOnlyOnRegression: false,
    minDeltaToNotify: 0,
    nextRunAt: null,
    lastRunAt: null,
    updatedAt: null,
  };
}

function serializeSnapshot(s: typeof scoreSnapshotsTable.$inferSelect) {
  return {
    id: s.id,
    storeId: s.storeId,
    triggeredBy: s.triggeredBy,
    overallScore: s.overallScore,
    clarityScore: s.clarityScore,
    completenessScore: s.completenessScore,
    trustScore: s.trustScore,
    tagScore: s.tagScore,
    consistencyScore: s.consistencyScore,
    policyScore: s.policyScore,
    totalProducts: s.totalProducts,
    criticalIssues: s.criticalIssues,
    mediumIssues: s.mediumIssues,
    lowIssues: s.lowIssues,
    error: s.error,
    emailSent: s.emailSent,
    emailSkippedReason: s.emailSkippedReason,
    createdAt: s.createdAt.toISOString(),
  };
}

export default router;
