import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { employeeWhere, type AuthUser } from "@/server/auth/session";
import { getCompany } from "@/server/services/company";
import { formatDateAr, fromDateKey, monthEnd as monthEndKey, monthLabel, toDateKey, todayKey } from "@/lib/dates";
import type { ReportStatusKey } from "@/lib/labels";
import type { MonthlyReportContent, WeeklyReportContent } from "@/lib/report-types";

export interface ReportListRow {
  id: string;
  href: string;
  employeeName: string;
  period: string;
  status: ReportStatusKey;
  progress: number | null;
  submittedAt: string | null;
  reviewedAt: string | null;
}

export function contentProgress(content: unknown): number | null {
  const v = (content as { totals?: { weightedProgress?: unknown } } | null)?.totals?.weightedProgress;
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export interface ReportListFilters {
  status?: string;
  employeeId?: string;
  /** YYYY-MM */
  month?: string;
  skip: number;
  take: number;
}

function parseMonth(v?: string) {
  const m = v ? /^(\d{4})-(\d{2})$/.exec(v) : null;
  if (!m) return null;
  const month = +m[2];
  if (month < 1 || month > 12) return null;
  return { year: +m[1], month };
}

export async function listWeeklyReports(user: AuthUser, f: ReportListFilters, own = false) {
  const and: Prisma.WeeklyReportWhereInput[] = [own ? { employeeId: user.employeeId ?? "__none__" } : employeeWhere(user)];
  if (f.status) and.push({ status: f.status as ReportStatusKey });
  if (f.employeeId) and.push({ employeeId: f.employeeId });
  const ym = parseMonth(f.month);
  if (ym)
    and.push({
      weeklyPlan: { monthlyPlan: { year: ym.year, month: ym.month } },
    });
  const where: Prisma.WeeklyReportWhereInput = { AND: and };
  const [rows, total] = await Promise.all([
    db.weeklyReport.findMany({
      where,
      select: {
        id: true,
        status: true,
        content: true,
        weekStart: true,
        weekEnd: true,
        submittedAt: true,
        reviewedAt: true,
        employee: { select: { fullName: true } },
        weeklyPlan: {
          select: {
            weekIndex: true,
            monthlyPlan: { select: { year: true, month: true } },
          },
        },
      },
      orderBy: [{ weekStart: "desc" }, { createdAt: "desc" }],
      skip: f.skip,
      take: f.take,
    }),
    db.weeklyReport.count({ where }),
  ]);
  return {
    total,
    rows: rows.map<ReportListRow>((r) => ({
      id: r.id,
      href: `/reports/weekly/${r.id}`,
      employeeName: r.employee.fullName,
      period: `الأسبوع ${r.weeklyPlan.weekIndex} — ${monthLabel(r.weeklyPlan.monthlyPlan.year, r.weeklyPlan.monthlyPlan.month)} (${formatDateAr(r.weekStart)} – ${formatDateAr(r.weekEnd)})`,
      status: r.status,
      progress: contentProgress(r.content),
      submittedAt: r.submittedAt?.toISOString() ?? null,
      reviewedAt: r.reviewedAt?.toISOString() ?? null,
    })),
  };
}

export async function listMonthlyReports(user: AuthUser, f: ReportListFilters, own = false) {
  const and: Prisma.MonthlyReportWhereInput[] = [own ? { employeeId: user.employeeId ?? "__none__" } : employeeWhere(user)];
  if (f.status) and.push({ status: f.status as ReportStatusKey });
  if (f.employeeId) and.push({ employeeId: f.employeeId });
  const ym = parseMonth(f.month);
  if (ym) and.push({ year: ym.year, month: ym.month });
  const where: Prisma.MonthlyReportWhereInput = { AND: and };
  const [rows, total] = await Promise.all([
    db.monthlyReport.findMany({
      where,
      select: {
        id: true,
        status: true,
        content: true,
        year: true,
        month: true,
        submittedAt: true,
        reviewedAt: true,
        employee: { select: { fullName: true } },
      },
      orderBy: [{ year: "desc" }, { month: "desc" }, { createdAt: "desc" }],
      skip: f.skip,
      take: f.take,
    }),
    db.monthlyReport.count({ where }),
  ]);
  return {
    total,
    rows: rows.map<ReportListRow>((r) => ({
      id: r.id,
      href: `/reports/monthly/${r.id}`,
      employeeName: r.employee.fullName,
      period: monthLabel(r.year, r.month),
      status: r.status,
      progress: contentProgress(r.content),
      submittedAt: r.submittedAt?.toISOString() ?? null,
      reviewedAt: r.reviewedAt?.toISOString() ?? null,
    })),
  };
}

export async function scopeEmployeeOptions(user: AuthUser) {
  const scope = employeeWhere(user);
  const rows = await db.employee.findMany({
    where: scope.employeeId ? { id: scope.employeeId } : {},
    select: { id: true, fullName: true },
    orderBy: { fullName: "asc" },
  });
  return rows.map((r) => ({ value: r.id, label: r.fullName }));
}

/** Last 12 months (newest first) as YYYY-MM options. */
export async function recentMonthOptions(count = 12) {
  const company = await getCompany();
  const today = todayKey(company.timezone);
  let year = +today.slice(0, 4);
  let month = +today.slice(5, 7);
  const out: { value: string; label: string }[] = [];
  for (let i = 0; i < count; i++) {
    out.push({
      value: `${year}-${String(month).padStart(2, "0")}`,
      label: monthLabel(year, month),
    });
    month -= 1;
    if (month === 0) {
      month = 12;
      year -= 1;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
//  Detail
// ---------------------------------------------------------------------------

const EMPTY_TOTALS = {
  goalsCount: 0,
  completedGoals: 0,
  weightedProgress: 0,
  approved: 0,
  worked: 0,
  pendingApproval: 0,
  needsRevision: 0,
  blocked: 0,
  reworkCount: 0,
  approvalRate: null,
  revisionRate: null,
};
const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** Guard against partial / legacy JSON snapshots so the page never crashes. */
function normalizeWeekly(raw: unknown): WeeklyReportContent {
  const c = (raw && typeof raw === "object" ? raw : {}) as Partial<WeeklyReportContent>;
  return {
    version: 1,
    employee: c.employee ?? { id: "", name: "", jobTitle: null },
    week: c.week ?? { index: 0, start: "", end: "", year: 0, month: 0 },
    goals: arr(c.goals),
    totals: { ...EMPTY_TOTALS, ...(c.totals ?? {}) },
    manualTasks: arr(c.manualTasks),
    delayedTasks: arr(c.delayedTasks),
    adHocTasks: arr(c.adHocTasks),
    autoHighlights: arr(c.autoHighlights),
    autoCarryOver: arr(c.autoCarryOver),
  };
}

function normalizeMonthly(raw: unknown): MonthlyReportContent {
  const c = (raw && typeof raw === "object" ? raw : {}) as Partial<MonthlyReportContent>;
  return {
    version: 1,
    employee: c.employee ?? { id: "", name: "", jobTitle: null },
    period: c.period ?? { year: 0, month: 0, start: "", end: "" },
    goals: arr(c.goals),
    totals: { ...EMPTY_TOTALS, ...(c.totals ?? {}) },
    weeks: arr(c.weeks),
    adHocTasks: arr(c.adHocTasks),
    delayedTasks: arr(c.delayedTasks),
    cancelledTasks: arr(c.cancelledTasks),
    stageSummary: arr(c.stageSummary),
    autoHighlights: arr(c.autoHighlights),
    weeklyNotes: arr(c.weeklyNotes),
  };
}

async function reviewerName(userId: string | null) {
  if (!userId) return null;
  const u = await db.user.findUnique({
    where: { id: userId },
    select: { name: true, employee: { select: { fullName: true } } },
  });
  return u ? (u.employee?.fullName ?? u.name) : null;
}

export async function getWeeklyReport(id: string) {
  const r = await db.weeklyReport.findUnique({
    where: { id },
    include: {
      employee: {
        select: { fullName: true, jobTitle: { select: { name: true } } },
      },
    },
  });
  if (!r) return null;
  return {
    id: r.id,
    employeeId: r.employeeId,
    employeeName: r.employee.fullName,
    jobTitle: r.employee.jobTitle?.name ?? null,
    status: r.status,
    content: normalizeWeekly(r.content),
    generatedText: r.generatedText,
    employeeNotes: r.employeeNotes,
    highlights: r.highlights,
    blockers: r.blockers,
    carryOver: r.carryOver,
    managerComment: r.managerComment,
    weekStart: toDateKey(r.weekStart),
    weekEnd: toDateKey(r.weekEnd),
    generatedAt: r.generatedAt,
    submittedAt: r.submittedAt,
    reviewedAt: r.reviewedAt,
    approvedAt: r.approvedAt,
    reviewerName: await reviewerName(r.reviewedById),
  };
}

export async function getMonthlyReport(id: string) {
  const r = await db.monthlyReport.findUnique({
    where: { id },
    include: {
      employee: {
        select: { fullName: true, jobTitle: { select: { name: true } } },
      },
    },
  });
  if (!r) return null;
  return {
    id: r.id,
    employeeId: r.employeeId,
    employeeName: r.employee.fullName,
    jobTitle: r.employee.jobTitle?.name ?? null,
    status: r.status,
    content: normalizeMonthly(r.content),
    generatedText: r.generatedText,
    employeeNotes: r.employeeNotes,
    highlights: r.highlights,
    managerNotes: r.managerNotes,
    year: r.year,
    month: r.month,
    generatedAt: r.generatedAt,
    submittedAt: r.submittedAt,
    reviewedAt: r.reviewedAt,
    approvedAt: r.approvedAt,
    reviewerName: await reviewerName(r.reviewedById),
  };
}

export type WeeklyReportDetail = NonNullable<Awaited<ReturnType<typeof getWeeklyReport>>>;
export type MonthlyReportDetail = NonNullable<Awaited<ReturnType<typeof getMonthlyReport>>>;

// ---------------------------------------------------------------------------
//  /my-reports
// ---------------------------------------------------------------------------

export interface MyPendingReport {
  kind: "weekly" | "monthly";
  id: string;
  href: string;
  title: string;
  period: string;
  status: ReportStatusKey;
  progress: number | null;
  managerComment: string | null;
}

/** Own reports waiting for the employee (auto-generated drafts and returned ones), returned first, then newest. */
export async function getMyPendingReports(employeeId: string): Promise<MyPendingReport[]> {
  const status = { in: ["DRAFT", "RETURNED"] as ReportStatusKey[] };
  const [weekly, monthly] = await Promise.all([
    db.weeklyReport.findMany({
      where: { employeeId, status },
      select: {
        id: true,
        status: true,
        content: true,
        weekStart: true,
        weekEnd: true,
        managerComment: true,
        weeklyPlan: {
          select: {
            weekIndex: true,
            monthlyPlan: { select: { year: true, month: true } },
          },
        },
      },
      orderBy: { weekStart: "desc" },
      take: 12,
    }),
    db.monthlyReport.findMany({
      where: { employeeId, status },
      select: {
        id: true,
        status: true,
        content: true,
        year: true,
        month: true,
        managerNotes: true,
      },
      orderBy: [{ year: "desc" }, { month: "desc" }],
      take: 6,
    }),
  ]);
  const items = [
    ...weekly.map((r) => ({
      sort: toDateKey(r.weekEnd),
      item: {
        kind: "weekly" as const,
        id: r.id,
        href: `/reports/weekly/${r.id}`,
        title: `تقرير الأسبوع ${r.weeklyPlan.weekIndex} — ${monthLabel(r.weeklyPlan.monthlyPlan.year, r.weeklyPlan.monthlyPlan.month)}`,
        period: `${formatDateAr(r.weekStart)} – ${formatDateAr(r.weekEnd)}`,
        status: r.status,
        progress: contentProgress(r.content),
        managerComment: r.status === "RETURNED" ? r.managerComment : null,
      },
    })),
    ...monthly.map((r) => ({
      sort: monthEndKey(r.year, r.month),
      item: {
        kind: "monthly" as const,
        id: r.id,
        href: `/reports/monthly/${r.id}`,
        title: `التقرير الشهري — ${monthLabel(r.year, r.month)}`,
        period: monthLabel(r.year, r.month),
        status: r.status,
        progress: contentProgress(r.content),
        managerComment: r.status === "RETURNED" ? r.managerNotes : null,
      },
    })),
  ];
  items.sort((a, b) => {
    const ra = a.item.status === "RETURNED" ? 1 : 0;
    const rb = b.item.status === "RETURNED" ? 1 : 0;
    if (ra !== rb) return rb - ra;
    if (a.sort !== b.sort) return a.sort < b.sort ? 1 : -1;
    return a.item.kind === "monthly" ? -1 : 1;
  });
  return items.map((i) => i.item);
}

export async function getMyReportContext(user: AuthUser, year: number, month: number) {
  const employeeId = user.employeeId!;
  const company = await getCompany();
  const today = todayKey(company.timezone);
  const todayDate = fromDateKey(today);
  const [currentWeek, plan] = await Promise.all([
    db.weeklyPlan.findFirst({
      where: {
        employeeId,
        startDate: { lte: todayDate },
        endDate: { gte: todayDate },
      },
      select: {
        id: true,
        weekIndex: true,
        startDate: true,
        endDate: true,
        report: { select: { id: true, status: true } },
      },
    }),
    db.monthlyPlan.findUnique({
      where: { employeeId_year_month: { employeeId, year, month } },
      select: {
        id: true,
        status: true,
        report: { select: { id: true, status: true } },
        weeklyPlans: {
          select: {
            id: true,
            weekIndex: true,
            startDate: true,
            endDate: true,
            report: { select: { id: true, status: true } },
          },
          orderBy: { weekIndex: "asc" },
        },
      },
    }),
  ]);
  return {
    today,
    currentWeek: currentWeek
      ? {
          id: currentWeek.id,
          weekIndex: currentWeek.weekIndex,
          start: toDateKey(currentWeek.startDate),
          end: toDateKey(currentWeek.endDate),
          report: currentWeek.report,
        }
      : null,
    plan: plan
      ? {
          id: plan.id,
          status: plan.status,
          report: plan.report,
          weeks: plan.weeklyPlans.map((w) => ({
            id: w.id,
            weekIndex: w.weekIndex,
            start: toDateKey(w.startDate),
            end: toDateKey(w.endDate),
            report: w.report,
          })),
        }
      : null,
  };
}
