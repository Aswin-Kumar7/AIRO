import { useState, useEffect, useRef } from "react";
import { useStore } from "@/context/store-context";
import { AppLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import {
  Clock, Mail, Calendar, Download, Play, Pause,
  ChevronDown, ChevronRight, Check, Search, AlertTriangle,
  CheckCircle2, XCircle, Loader2, TrendingDown, TrendingUp, Minus,
} from "lucide-react";
import {
  getSchedule, saveSchedule, toggleSchedule, pauseSchedule,
  sendTestEmail, getSnapshotExportUrl, getSnapshots,
  type ScheduleConfig, type ScoreSnapshot,
} from "@/lib/schedule-api";
import { useToast } from "@/hooks/use-toast";

// ── Common timezones ──────────────────────────────────────────────────────────
const TIMEZONES = [
  "UTC",
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "America/Vancouver", "America/Toronto", "America/Sao_Paulo", "America/Mexico_City",
  "Europe/London", "Europe/Paris", "Europe/Berlin", "Europe/Rome", "Europe/Madrid",
  "Europe/Amsterdam", "Europe/Stockholm", "Europe/Warsaw", "Europe/Istanbul",
  "Asia/Dubai", "Asia/Kolkata", "Asia/Colombo", "Asia/Dhaka",
  "Asia/Bangkok", "Asia/Singapore", "Asia/Hong_Kong", "Asia/Shanghai",
  "Asia/Tokyo", "Asia/Seoul",
  "Australia/Sydney", "Australia/Melbourne", "Australia/Perth",
  "Pacific/Auckland", "Pacific/Honolulu",
  "Africa/Cairo", "Africa/Nairobi", "Africa/Johannesburg",
];

function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function tzAbbr(tz: string): string {
  try {
    return (
      new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" })
        .formatToParts(new Date())
        .find((p) => p.type === "timeZoneName")?.value ?? tz
    );
  } catch {
    return tz;
  }
}

// ── Timezone combobox ─────────────────────────────────────────────────────────
function TimezoneSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (tz: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const filtered = TIMEZONES.filter((tz) =>
    tz.toLowerCase().replace(/_/g, " ").includes(query.toLowerCase()),
  );

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full h-9 px-3 flex items-center justify-between rounded-[8px] border border-slate-200 dark:border-white/10 bg-white dark:bg-[#111214] text-[13px] text-slate-900 dark:text-white hover:border-slate-300 dark:hover:border-white/20 transition-colors"
      >
        <span className="truncate">{value || "Select timezone"}</span>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400 flex-shrink-0 ml-2" />
      </button>

      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white dark:bg-[#111214] border border-slate-200 dark:border-white/10 rounded-[10px] shadow-xl overflow-hidden">
          <div className="p-2 border-b border-slate-100 dark:border-white/5 flex items-center gap-2">
            <Search className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search timezone…"
              className="flex-1 text-[13px] bg-transparent text-slate-900 dark:text-white placeholder:text-slate-400 outline-none"
            />
          </div>
          <div className="max-h-[200px] overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-[13px] text-slate-400">No results</p>
            ) : (
              filtered.map((tz) => (
                <button
                  key={tz}
                  type="button"
                  onClick={() => { onChange(tz); setOpen(false); setQuery(""); }}
                  className={`w-full text-left px-3 py-1.5 text-[13px] flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors ${tz === value ? "text-violet-600 dark:text-violet-400 font-semibold" : "text-slate-700 dark:text-zinc-200"}`}
                >
                  {tz === value && <Check className="w-3 h-3 flex-shrink-0" />}
                  <span className={tz === value ? "" : "pl-5"}>{tz.replace(/_/g, " ")}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Styled select ─────────────────────────────────────────────────────────────
function StyledSelect({
  value,
  onChange,
  children,
  className = "",
}: React.SelectHTMLAttributes<HTMLSelectElement> & { children: React.ReactNode; className?: string }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={onChange}
        className={`w-full h-9 pl-3 pr-8 rounded-[8px] border border-slate-200 dark:border-white/10 bg-white dark:bg-[#111214] text-[13px] text-slate-900 dark:text-white appearance-none focus:outline-none focus:ring-2 focus:ring-violet-500/30 transition-colors ${className}`}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
    </div>
  );
}

// ── Snapshot row ──────────────────────────────────────────────────────────────
function SnapshotRow({ snap, prev }: { snap: ScoreSnapshot; prev: ScoreSnapshot | null }) {
  const [open, setOpen] = useState(false);
  const delta = prev?.overallScore != null && snap.overallScore != null
    ? Math.round(snap.overallScore - prev.overallScore)
    : null;

  const date = new Date(snap.createdAt);
  const dateStr = date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const timeStr = date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="border-b border-slate-100 dark:border-white/5 last:border-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50/60 dark:hover:bg-white/[0.03] transition-colors text-left"
      >
        {/* Expand chevron */}
        <span className="flex-shrink-0 text-slate-300 dark:text-zinc-600">
          {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </span>

        {/* Date/time */}
        <div className="w-36 flex-shrink-0">
          <p className="text-[13px] font-semibold text-slate-900 dark:text-white">{dateStr}</p>
          <p className="text-[11px] text-slate-400 dark:text-zinc-500">{timeStr}</p>
        </div>

        {/* Trigger badge */}
        <span className={`flex-shrink-0 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-[4px] ${snap.triggeredBy === "scheduled" ? "bg-violet-100 dark:bg-violet-500/15 text-violet-600 dark:text-violet-400" : "bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-zinc-300"}`}>
          {snap.triggeredBy}
        </span>

        {/* Score */}
        <div className="flex-1 flex items-center gap-2">
          {snap.error ? (
            <span className="flex items-center gap-1.5 text-[13px] text-red-500 font-medium">
              <XCircle className="w-3.5 h-3.5" />Failed
            </span>
          ) : (
            <>
              <span className="text-[20px] font-bold tabular-nums text-slate-900 dark:text-white leading-none">
                {Math.round(snap.overallScore ?? 0)}
              </span>
              <span className="text-[12px] text-slate-400">/100</span>
              {delta !== null && (
                <span className={`flex items-center gap-0.5 text-[12px] font-bold ml-1 ${delta > 0 ? "text-emerald-600" : delta < 0 ? "text-red-500" : "text-slate-400"}`}>
                  {delta > 0 ? <TrendingUp className="w-3 h-3" /> : delta < 0 ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                  {delta > 0 ? `+${delta}` : delta}
                </span>
              )}
            </>
          )}
        </div>

        {/* Email status */}
        <div className="flex-shrink-0 w-24 flex items-center gap-1.5 justify-end">
          {snap.emailSent ? (
            <span className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
              <CheckCircle2 className="w-3 h-3" />Sent
            </span>
          ) : snap.emailSkippedReason ? (
            <span className="text-[11px] text-slate-400 dark:text-zinc-500 font-medium capitalize">
              {snap.emailSkippedReason.replace(/_/g, " ")}
            </span>
          ) : null}
        </div>
      </button>

      {open && (
        <div className="px-12 pb-4 pt-1">
          {snap.error ? (
            <div className="flex items-start gap-2 p-3 rounded-[8px] bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20">
              <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-[12px] text-red-700 dark:text-red-400">{snap.error}</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {([
                ["Clarity", snap.clarityScore],
                ["Completeness", snap.completenessScore],
                ["Trust", snap.trustScore],
                ["Tags", snap.tagScore],
                ["Consistency", snap.consistencyScore],
                ["Policy", snap.policyScore],
              ] as [string, number | null][]).map(([label, score]) => (
                <div key={label} className="flex items-center justify-between px-3 py-2 rounded-[8px] bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5">
                  <span className="text-[12px] text-slate-500 dark:text-zinc-400">{label}</span>
                  <span className="text-[13px] font-bold text-slate-900 dark:text-white tabular-nums">
                    {score != null ? Math.round(score) : "—"}
                  </span>
                </div>
              ))}
            </div>
          )}
          {snap.totalProducts != null && (
            <div className="flex items-center gap-4 mt-2 text-[12px] text-slate-400 dark:text-zinc-500">
              <span>{snap.totalProducts} products</span>
              {snap.criticalIssues != null && <span>{snap.criticalIssues} critical issues</span>}
              {snap.mediumIssues != null && <span>{snap.mediumIssues} medium</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Label ─────────────────────────────────────────────────────────────────────
function Label({ children, icon: Icon }: { children: React.ReactNode; icon?: React.FC<{ className?: string }> }) {
  return (
    <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 dark:text-zinc-400 uppercase tracking-wider mb-1.5">
      {Icon && <Icon className="w-3 h-3" />}
      {children}
    </label>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function SchedulePage() {
  const { activeStoreId } = useStore();
  const { toast } = useToast();

  const [schedule, setSchedule] = useState<ScheduleConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);
  const [snapshots, setSnapshots] = useState<ScoreSnapshot[]>([]);
  const [snapsLoading, setSnapsLoading] = useState(true);

  const [form, setForm] = useState<Partial<ScheduleConfig>>({
    frequency: "weekly",
    dayOfWeek: 1,
    dayOfMonth: 1,
    hourUtc: 9,
    timezone: detectTimezone(),
    emailRecipients: "",
    emailOnlyOnChange: false,
    emailOnlyOnRegression: false,
    minDeltaToNotify: 0,
  });

  function patch(updates: Partial<ScheduleConfig>) {
    setForm((f) => ({ ...f, ...updates }));
  }

  useEffect(() => {
    if (!activeStoreId) return;
    setLoading(true);
    getSchedule(activeStoreId)
      .then((s) => { setSchedule(s); setForm(s); })
      .catch(() => {})
      .finally(() => setLoading(false));
    setSnapsLoading(true);
    getSnapshots(activeStoreId, 50)
      .then(setSnapshots)
      .catch(() => {})
      .finally(() => setSnapsLoading(false));
  }, [activeStoreId]);

  async function handleSave() {
    if (!activeStoreId) return;
    setSaving(true);
    try {
      const updated = await saveSchedule(activeStoreId, form);
      setSchedule(updated);
      setForm(updated);
      toast({ title: "Schedule saved" });
    } catch (err) {
      toast({ title: "Failed to save", description: err instanceof Error ? err.message : "Error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(enabled: boolean) {
    if (!activeStoreId) return;
    try {
      const updated = await toggleSchedule(activeStoreId, enabled);
      setSchedule(updated); setForm(updated);
      toast({ title: enabled ? "Schedule enabled" : "Schedule disabled" });
    } catch (err) {
      toast({ title: "Failed", description: err instanceof Error ? err.message : "Error", variant: "destructive" });
    }
  }

  async function handlePause(paused: boolean) {
    if (!activeStoreId) return;
    try {
      const updated = await pauseSchedule(activeStoreId, paused);
      setSchedule(updated); setForm(updated);
      toast({ title: paused ? "Paused" : "Resumed" });
    } catch (err) {
      toast({ title: "Failed", description: err instanceof Error ? err.message : "Error", variant: "destructive" });
    }
  }

  async function handleTestEmail() {
    if (!activeStoreId) return;
    setTestingEmail(true);
    try {
      const result = await sendTestEmail(activeStoreId);
      if (result.sent) {
        toast({ title: "Test email sent", description: `Sent to ${result.recipients.join(", ")}` });
      } else {
        toast({ title: "Email failed", description: result.error ?? "Unknown", variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "Failed", description: err instanceof Error ? err.message : "Error", variant: "destructive" });
    } finally {
      setTestingEmail(false);
    }
  }

  const isActive = schedule?.enabled && !schedule?.paused;

  return (
    <AppLayout>
      <div className="p-8 max-w-[900px] mx-auto space-y-8 pb-20">

        {/* ── Header ── */}
        <div className="flex items-start justify-between border-b border-slate-100 dark:border-white/5 pb-7">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Scheduled Analysis</h1>
              {isActive && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold border border-emerald-100 dark:border-emerald-500/20 uppercase tracking-wider">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Active
                </span>
              )}
              {schedule?.paused && (
                <span className="px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 text-[10px] font-bold border border-amber-100 dark:border-amber-500/20 uppercase tracking-wider">
                  Paused
                </span>
              )}
            </div>
            <p className="text-[13px] text-slate-500 dark:text-zinc-400">
              Automatically analyze your store on a schedule and receive email reports.
              {schedule?.nextRunAt && isActive && (
                <span className="ml-2 text-violet-600 dark:text-violet-400 font-medium">
                  Next run: {new Date(schedule.nextRunAt).toLocaleString()}
                </span>
              )}
            </p>
          </div>

          {/* Enable toggle + pause */}
          <div className="flex items-center gap-2 flex-shrink-0 ml-4">
            {schedule?.enabled && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePause(!schedule.paused)}
                className="h-8 rounded-[8px] border-slate-200 dark:border-white/10 text-[12px] font-bold gap-1.5 dark:text-zinc-200 dark:hover:bg-white/10"
              >
                {schedule.paused ? <><Play className="w-3 h-3" />Resume</> : <><Pause className="w-3 h-3" />Pause</>}
              </Button>
            )}
            {schedule && (
              <button
                onClick={() => handleToggle(!schedule.enabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${schedule.enabled ? "bg-violet-600" : "bg-slate-200 dark:bg-white/15"}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${schedule.enabled ? "translate-x-6" : "translate-x-1"}`} />
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
          </div>
        ) : (
          <>
            {/* ── Schedule Config ── */}
            <div className="bg-white dark:bg-[#080808] rounded-[16px] border border-slate-200 dark:border-white/10 overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
              <div className="px-6 pt-6 pb-2">
                <p className="text-[12px] font-bold text-slate-400 dark:text-zinc-400 uppercase tracking-widest mb-5">Schedule</p>

                <div className="grid grid-cols-2 gap-5">
                  {/* Frequency */}
                  <div>
                    <Label icon={Calendar}>Frequency</Label>
                    <StyledSelect
                      value={form.frequency ?? "weekly"}
                      onChange={(e) => patch({ frequency: e.target.value as ScheduleConfig["frequency"] })}
                    >
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                    </StyledSelect>
                  </div>

                  {/* Day picker — contextual */}
                  {form.frequency === "weekly" && (
                    <div>
                      <Label>Day of Week</Label>
                      <StyledSelect
                        value={form.dayOfWeek ?? 1}
                        onChange={(e) => patch({ dayOfWeek: Number(e.target.value) })}
                      >
                        {["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"].map((d, i) => (
                          <option key={d} value={i}>{d}</option>
                        ))}
                      </StyledSelect>
                    </div>
                  )}
                  {form.frequency === "monthly" && (
                    <div>
                      <Label>Day of Month</Label>
                      <StyledSelect
                        value={form.dayOfMonth ?? 1}
                        onChange={(e) => patch({ dayOfMonth: Number(e.target.value) })}
                      >
                        {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </StyledSelect>
                    </div>
                  )}
                  {form.frequency === "daily" && <div />}

                  {/* Hour — typeable */}
                  <div>
                    <Label icon={Clock}>Time</Label>
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <input
                          type="number"
                          min={0}
                          max={23}
                          value={form.hourUtc ?? 9}
                          onChange={(e) => {
                            const v = Math.max(0, Math.min(23, Number(e.target.value)));
                            patch({ hourUtc: isNaN(v) ? 0 : v });
                          }}
                          className="w-full h-9 pl-3 pr-10 rounded-[8px] border border-slate-200 dark:border-white/10 bg-white dark:bg-[#111214] text-[13px] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500/30 transition-colors appearance-none [&::-webkit-inner-spin-button]:opacity-100 [&::-webkit-outer-spin-button]:opacity-100"
                        />
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-400 font-medium">:00</span>
                      </div>
                      <span className="text-[12px] text-slate-400 dark:text-zinc-500 flex-shrink-0">
                        {((form.hourUtc ?? 9)) < 12
                          ? `${(form.hourUtc ?? 9) || 12} AM`
                          : `${((form.hourUtc ?? 9) - 12) || 12} PM`} {tzAbbr(form.timezone ?? "UTC")}
                      </span>
                    </div>
                  </div>

                  {/* Timezone — searchable + auto-detect */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 dark:text-zinc-400 uppercase tracking-wider">Timezone</label>
                      <button
                        type="button"
                        onClick={() => patch({ timezone: detectTimezone() })}
                        className="text-[11px] text-violet-600 dark:text-violet-400 hover:text-violet-700 font-semibold flex items-center gap-1"
                      >
                        <Search className="w-2.5 h-2.5" />
                        Auto-detect
                      </button>
                    </div>
                    <TimezoneSelect
                      value={form.timezone ?? "UTC"}
                      onChange={(tz) => patch({ timezone: tz })}
                    />
                  </div>
                </div>
              </div>

              {/* Divider */}
              <div className="mx-6 my-5 border-t border-slate-100 dark:border-white/5" />

              {/* Email section */}
              <div className="px-6 pb-2">
                <p className="text-[12px] font-bold text-slate-400 dark:text-zinc-400 uppercase tracking-widest mb-5">Email Reports</p>

                <div className="space-y-5">
                  {/* Recipients */}
                  <div>
                    <Label icon={Mail}>Recipients</Label>
                    <input
                      type="text"
                      placeholder="email@example.com, another@example.com"
                      value={form.emailRecipients ?? ""}
                      onChange={(e) => patch({ emailRecipients: e.target.value })}
                      className="w-full h-9 px-3 rounded-[8px] border border-slate-200 dark:border-white/10 bg-white dark:bg-[#111214] text-[13px] text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500/30 transition-colors"
                    />
                    <p className="text-[11px] text-slate-400 dark:text-zinc-600 mt-1">Separate multiple addresses with commas</p>
                  </div>

                  {/* Notification toggles */}
                  <div className="space-y-3">
                    <label className="flex items-start gap-3 cursor-pointer group">
                      <div
                        onClick={() => patch({ emailOnlyOnChange: !form.emailOnlyOnChange })}
                        className={`mt-0.5 flex-shrink-0 w-4 h-4 rounded-[4px] border-2 flex items-center justify-center transition-colors cursor-pointer ${form.emailOnlyOnChange ? "bg-violet-600 border-violet-600" : "border-slate-300 dark:border-white/20 bg-white dark:bg-transparent"}`}
                      >
                        {form.emailOnlyOnChange && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                      </div>
                      <div>
                        <p className="text-[13px] font-medium text-slate-800 dark:text-zinc-200">Only email when score changes</p>
                        {form.emailOnlyOnChange && (
                          <div className="flex items-center gap-2 mt-2">
                            <span className="text-[12px] text-slate-500 dark:text-zinc-400">Minimum change:</span>
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={form.minDeltaToNotify ?? 0}
                              onChange={(e) => patch({ minDeltaToNotify: Number(e.target.value) })}
                              className="w-16 h-7 px-2 rounded-[6px] border border-slate-200 dark:border-white/10 bg-white dark:bg-[#111214] text-[13px] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                            />
                            <span className="text-[12px] text-slate-500 dark:text-zinc-400">points</span>
                          </div>
                        )}
                      </div>
                    </label>

                    <label className="flex items-start gap-3 cursor-pointer">
                      <div
                        onClick={() => patch({ emailOnlyOnRegression: !form.emailOnlyOnRegression })}
                        className={`mt-0.5 flex-shrink-0 w-4 h-4 rounded-[4px] border-2 flex items-center justify-center transition-colors cursor-pointer ${form.emailOnlyOnRegression ? "bg-violet-600 border-violet-600" : "border-slate-300 dark:border-white/20 bg-white dark:bg-transparent"}`}
                      >
                        {form.emailOnlyOnRegression && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                      </div>
                      <div>
                        <p className="text-[13px] font-medium text-slate-800 dark:text-zinc-200">Only email on score regression (alerts only)</p>
                        <p className="text-[12px] text-slate-400 dark:text-zinc-500 mt-0.5">Sends email only when your score drops</p>
                      </div>
                    </label>
                  </div>
                </div>
              </div>

              {/* Footer actions */}
              <div className="mx-6 mb-0 mt-5 border-t border-slate-100 dark:border-white/5" />
              <div className="px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleTestEmail}
                    disabled={testingEmail || !form.emailRecipients?.trim()}
                    className="h-8 rounded-[8px] border-slate-200 dark:border-white/10 text-[12px] font-bold gap-1.5 dark:text-zinc-200 dark:hover:bg-white/10"
                  >
                    <Mail className="w-3 h-3" />
                    {testingEmail ? "Sending…" : "Send Test Email"}
                  </Button>
                  {activeStoreId && (
                    <a
                      href={getSnapshotExportUrl(activeStoreId)}
                      download
                      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[8px] border border-slate-200 dark:border-white/10 bg-white dark:bg-transparent text-[12px] font-bold text-slate-700 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-white/10 transition-colors"
                    >
                      <Download className="w-3 h-3" />
                      Export CSV
                    </a>
                  )}
                </div>
                <Button
                  onClick={handleSave}
                  disabled={saving}
                  className="h-8 px-5 rounded-[8px] bg-violet-600 hover:bg-violet-700 text-white text-[12px] font-bold shadow-sm"
                >
                  {saving ? <><Loader2 className="w-3 h-3 animate-spin mr-1.5" />Saving…</> : "Save Schedule"}
                </Button>
              </div>
            </div>

            {/* ── Snapshot History ── */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-[15px] font-bold text-slate-900 dark:text-white tracking-tight">Run History</h2>
                <p className="text-[12px] text-slate-400 dark:text-zinc-500">
                  {snapshots.length} snapshot{snapshots.length !== 1 ? "s" : ""}
                </p>
              </div>

              <div className="bg-white dark:bg-[#080808] rounded-[16px] border border-slate-200 dark:border-white/10 overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
                {snapsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
                  </div>
                ) : snapshots.length === 0 ? (
                  <div className="py-14 text-center">
                    <div className="w-10 h-10 rounded-full bg-slate-50 dark:bg-white/5 flex items-center justify-center mx-auto mb-3 border border-slate-100 dark:border-white/10">
                      <Clock className="w-5 h-5 text-slate-300 dark:text-zinc-600" />
                    </div>
                    <p className="text-[14px] font-semibold text-slate-600 dark:text-zinc-300 mb-1">No runs yet</p>
                    <p className="text-[13px] text-slate-400 dark:text-zinc-500">
                      Run an analysis or enable a schedule to start building history.
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Table header */}
                    <div className="flex items-center gap-4 px-5 py-2.5 border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.02]">
                      <div className="w-3.5" />
                      <div className="w-36 flex-shrink-0 text-[11px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">Date</div>
                      <div className="w-20 flex-shrink-0 text-[11px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">Trigger</div>
                      <div className="flex-1 text-[11px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">Score</div>
                      <div className="w-24 text-right text-[11px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">Email</div>
                    </div>
                    {snapshots.map((snap, i) => (
                      <SnapshotRow
                        key={snap.id}
                        snap={snap}
                        prev={snapshots[i + 1] ?? null}
                      />
                    ))}
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
