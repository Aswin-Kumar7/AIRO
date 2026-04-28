import { Resend } from "resend";
import { logger } from "./logger";

const resend = new Resend(process.env.RESEND_API_KEY);
// onboarding@resend.dev works without domain verification — safe for Vercel deployments.
// Set EMAIL_FROM to a verified custom domain address in production.
const FROM_ADDRESS = process.env.EMAIL_FROM ?? "onboarding@resend.dev";

export interface ScoreData {
  overall: number;
  clarity: number;
  completeness: number;
  trust: number;
  tags: number;
  consistency: number;
  policy: number;
}

export interface ScheduledReportPayload {
  storeName: string;
  storeDomain: string;
  recipientEmails: string[];
  currentScores: ScoreData;
  previousScores: ScoreData | null;
  totalProducts: number;
  criticalIssues: number;
  pendingFixes: number;
  snapshotId: string;
  dashboardUrl: string;
}

function scoreDeltaHtml(current: number, previous: number | null): string {
  if (previous === null) return `<span style="color:#6b7280">${Math.round(current)}</span>`;
  const delta = Math.round(current - previous);
  if (delta === 0) return `<span style="color:#374151">${Math.round(current)}</span>`;
  const color = delta > 0 ? "#16a34a" : "#dc2626";
  const arrow = delta > 0 ? "↑" : "↓";
  return `<span style="color:#374151">${Math.round(current)}</span> <span style="color:${color};font-size:12px">${arrow}${Math.abs(delta)}</span>`;
}

function buildEmailHtml(payload: ScheduledReportPayload): string {
  const { storeName, storeDomain, currentScores, previousScores, totalProducts, criticalIssues, pendingFixes, dashboardUrl } = payload;
  const overallDelta = previousScores !== null ? Math.round(currentScores.overall - previousScores.overall) : null;
  const overallDeltaText = overallDelta !== null
    ? (overallDelta >= 0 ? `+${overallDelta}` : `${overallDelta}`)
    : "";
  const overallColor = overallDelta !== null
    ? (overallDelta > 0 ? "#16a34a" : overallDelta < 0 ? "#dc2626" : "#6b7280")
    : "#6b7280";

  const rows = [
    { label: "Clarity", key: "clarity" as keyof ScoreData },
    { label: "Completeness", key: "completeness" as keyof ScoreData },
    { label: "Trust Signals", key: "trust" as keyof ScoreData },
    { label: "Tag Quality", key: "tags" as keyof ScoreData },
    { label: "Consistency", key: "consistency" as keyof ScoreData },
    { label: "Policy Coverage", key: "policy" as keyof ScoreData },
  ];

  const scoreRowsHtml = rows.map(({ label, key }) => `
    <tr>
      <td style="padding:8px 12px;color:#374151;font-size:14px">${label}</td>
      <td style="padding:8px 12px;text-align:right;font-size:14px">${scoreDeltaHtml(currentScores[key], previousScores?.[key] ?? null)}</td>
    </tr>
  `).join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 16px">
    <tr><td>
      <table width="600" cellpadding="0" cellspacing="0" style="margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1)">

        <!-- Header -->
        <tr><td style="background:#1e1b4b;padding:28px 32px">
          <p style="margin:0;color:#a5b4fc;font-size:12px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase">Kasparro · Scheduled Report</p>
          <h1 style="margin:8px 0 0;color:#ffffff;font-size:22px;font-weight:700">${storeName}</h1>
          <p style="margin:4px 0 0;color:#818cf8;font-size:13px">${storeDomain}</p>
        </td></tr>

        <!-- Overall score hero -->
        <tr><td style="padding:28px 32px;border-bottom:1px solid #f3f4f6">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td>
                <p style="margin:0;color:#6b7280;font-size:13px;text-transform:uppercase;letter-spacing:0.06em;font-weight:600">Overall AI Readiness</p>
                <p style="margin:8px 0 0;font-size:48px;font-weight:800;color:#1e1b4b;line-height:1">${Math.round(currentScores.overall)}<span style="font-size:22px;color:#9ca3af">/100</span></p>
                ${overallDeltaText ? `<p style="margin:6px 0 0;font-size:14px;color:${overallColor};font-weight:600">${overallDeltaText} since last run</p>` : ""}
              </td>
              <td style="text-align:right;vertical-align:top">
                <table cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="text-align:center;padding:0 12px">
                      <p style="margin:0;font-size:24px;font-weight:700;color:#dc2626">${criticalIssues}</p>
                      <p style="margin:2px 0 0;color:#6b7280;font-size:11px">Critical Issues</p>
                    </td>
                    <td style="text-align:center;padding:0 12px">
                      <p style="margin:0;font-size:24px;font-weight:700;color:#d97706">${pendingFixes}</p>
                      <p style="margin:2px 0 0;color:#6b7280;font-size:11px">Pending Fixes</p>
                    </td>
                    <td style="text-align:center;padding:0 12px">
                      <p style="margin:0;font-size:24px;font-weight:700;color:#374151">${totalProducts}</p>
                      <p style="margin:2px 0 0;color:#6b7280;font-size:11px">Products</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- Score breakdown -->
        <tr><td style="padding:24px 32px 8px">
          <p style="margin:0 0 12px;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:#6b7280">Score Breakdown</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #f3f4f6;border-radius:8px;overflow:hidden">
            <thead>
              <tr style="background:#f9fafb">
                <th style="padding:8px 12px;text-align:left;font-size:11px;color:#9ca3af;font-weight:600;text-transform:uppercase">Dimension</th>
                <th style="padding:8px 12px;text-align:right;font-size:11px;color:#9ca3af;font-weight:600;text-transform:uppercase">Score</th>
              </tr>
            </thead>
            <tbody>${scoreRowsHtml}</tbody>
          </table>
        </td></tr>

        <!-- CTA -->
        <tr><td style="padding:24px 32px 32px">
          <a href="${dashboardUrl}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600">View Full Dashboard →</a>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#f9fafb;padding:16px 32px;border-top:1px solid #f3f4f6">
          <p style="margin:0;color:#9ca3af;font-size:12px">You're receiving this because scheduled reports are enabled for ${storeName}. Manage in Dashboard → Settings.</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─── Weekly AI Visibility Pulse ───────────────────────────────────────────────

export interface VisibilityPulsePayload {
  storeName: string;
  storeDomain: string;
  recipientEmails: string[];
  weekOf: string;          // ISO date string
  overallScore: number;
  previousOverall: number | null;
  aiReadinessScore: number;
  topIssues: Array<{ title: string; severity: string }>;
  topRecommendations: string[];
  pendingFixes: number;
  criticalIssues: number;
  dashboardUrl: string;
}

function buildPulseEmailHtml(p: VisibilityPulsePayload): string {
  const delta = p.previousOverall !== null ? Math.round(p.overallScore - p.previousOverall) : null;
  const trendColor = delta === null ? "#6b7280" : delta >= 0 ? "#16a34a" : "#dc2626";
  const trendText = delta === null ? "" : delta >= 0 ? `↑ +${delta} vs last week` : `↓ ${delta} vs last week`;

  const issuesHtml = p.topIssues.slice(0, 5).map((issue) => {
    const dot = issue.severity === "high" ? "#dc2626" : issue.severity === "medium" ? "#d97706" : "#6b7280";
    return `<tr><td style="padding:6px 12px;font-size:13px;color:#374151">
      <span style="display:inline-block;width:8px;height:8px;background:${dot};border-radius:50%;margin-right:8px;vertical-align:middle"></span>${issue.title}
    </td></tr>`;
  }).join("");

  const recsHtml = p.topRecommendations.slice(0, 3).map((rec, i) =>
    `<tr><td style="padding:5px 12px;font-size:13px;color:#374151"><span style="color:#4f46e5;font-weight:700;margin-right:6px">${i + 1}.</span>${rec}</td></tr>`
  ).join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0f9ff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f9ff;padding:32px 16px">
    <tr><td>
      <table width="600" cellpadding="0" cellspacing="0" style="margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08)">

        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#065f46 0%,#0d9488 100%);padding:28px 32px">
          <p style="margin:0;color:#a7f3d0;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase">Kasparro · Weekly AI Visibility Pulse</p>
          <h1 style="margin:8px 0 4px;color:#ffffff;font-size:20px;font-weight:800">${p.storeName}</h1>
          <p style="margin:0;color:#6ee7b7;font-size:12px">Week of ${new Date(p.weekOf).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p>
        </td></tr>

        <!-- Score hero -->
        <tr><td style="padding:24px 32px;border-bottom:1px solid #f3f4f6">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="width:50%;padding-right:16px">
                <p style="margin:0;color:#6b7280;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em">AI Readiness Score</p>
                <p style="margin:6px 0 0;font-size:52px;font-weight:900;color:#065f46;line-height:1">${Math.round(p.overallScore)}<span style="font-size:20px;color:#9ca3af">/100</span></p>
                ${trendText ? `<p style="margin:6px 0 0;font-size:13px;font-weight:600;color:${trendColor}">${trendText}</p>` : ""}
              </td>
              <td style="width:50%;padding-left:16px;border-left:1px solid #f3f4f6">
                <table cellpadding="0" cellspacing="0" width="100%">
                  <tr>
                    <td style="padding:4px 12px;text-align:center">
                      <p style="margin:0;font-size:28px;font-weight:800;color:#dc2626">${p.criticalIssues}</p>
                      <p style="margin:2px 0 0;color:#6b7280;font-size:11px">Critical Issues</p>
                    </td>
                    <td style="padding:4px 12px;text-align:center">
                      <p style="margin:0;font-size:28px;font-weight:800;color:#d97706">${p.pendingFixes}</p>
                      <p style="margin:2px 0 0;color:#6b7280;font-size:11px">Quick Fixes</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td></tr>

        ${issuesHtml.length ? `
        <!-- Top issues -->
        <tr><td style="padding:20px 32px 8px">
          <p style="margin:0 0 10px;font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em">Top Issues This Week</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #f3f4f6;border-radius:8px;overflow:hidden">
            <tbody>${issuesHtml}</tbody>
          </table>
        </td></tr>` : ""}

        ${recsHtml.length ? `
        <!-- Recommendations -->
        <tr><td style="padding:20px 32px 8px">
          <p style="margin:0 0 10px;font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em">Priority Actions</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #f3f4f6;border-radius:8px;overflow:hidden">
            <tbody>${recsHtml}</tbody>
          </table>
        </td></tr>` : ""}

        <!-- CTA -->
        <tr><td style="padding:24px 32px 32px">
          <a href="${p.dashboardUrl}" style="display:inline-block;background:#065f46;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:700">View AI Visibility Report →</a>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#f9fafb;padding:14px 32px;border-top:1px solid #f3f4f6">
          <p style="margin:0;color:#9ca3af;font-size:11px">AI Visibility Pulse for ${p.storeDomain}. Manage in Dashboard → Schedule.</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function sendVisibilityPulse(payload: VisibilityPulsePayload): Promise<{ sent: boolean; error?: string }> {
  if (!process.env.RESEND_API_KEY) {
    logger.warn("RESEND_API_KEY not set — skipping visibility pulse email");
    return { sent: false, error: "RESEND_API_KEY not configured" };
  }

  const delta = payload.previousOverall !== null
    ? Math.round(payload.overallScore - payload.previousOverall)
    : null;
  const trendText = delta === null ? "" : delta >= 0 ? ` (+${delta})` : ` (${delta})`;
  const subject = `${payload.storeName} AI Pulse: ${Math.round(payload.overallScore)}/100${trendText} — ${payload.criticalIssues} critical issue${payload.criticalIssues !== 1 ? "s" : ""}`;

  try {
    const result = await resend.emails.send({
      from: FROM_ADDRESS,
      to: payload.recipientEmails,
      subject,
      html: buildPulseEmailHtml(payload),
    });
    if (result.error) {
      logger.warn({ error: result.error }, "Visibility pulse email error");
      return { sent: false, error: result.error.message };
    }
    logger.info({ storeDomain: payload.storeDomain, recipients: payload.recipientEmails.length }, "AI Visibility Pulse email sent");
    return { sent: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown email error";
    logger.error({ err }, "Failed to send visibility pulse email");
    return { sent: false, error: msg };
  }
}

export async function sendScheduledReport(payload: ScheduledReportPayload): Promise<{ sent: boolean; error?: string }> {
  if (!process.env.RESEND_API_KEY) {
    logger.warn("RESEND_API_KEY not set — skipping scheduled report email");
    return { sent: false, error: "RESEND_API_KEY not configured" };
  }

  const overallDelta = payload.previousScores !== null
    ? Math.round(payload.currentScores.overall - payload.previousScores.overall)
    : null;
  const deltaText = overallDelta !== null
    ? (overallDelta >= 0 ? ` (+${overallDelta})` : ` (${overallDelta})`)
    : "";
  const subject = `${payload.storeName} AI Readiness: ${Math.round(payload.currentScores.overall)}/100${deltaText}`;

  try {
    const result = await resend.emails.send({
      from: FROM_ADDRESS,
      to: payload.recipientEmails,
      subject,
      html: buildEmailHtml(payload),
    });
    if (result.error) {
      logger.warn({ error: result.error, storeDomain: payload.storeDomain }, "Resend API returned error");
      return { sent: false, error: result.error.message };
    }
    logger.info({ storeDomain: payload.storeDomain, recipients: payload.recipientEmails.length }, "Scheduled report email sent");
    return { sent: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown email error";
    logger.error({ err, storeDomain: payload.storeDomain }, "Failed to send scheduled report email");
    return { sent: false, error: msg };
  }
}
