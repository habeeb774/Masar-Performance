import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { UserError } from "@/server/action";
import { assertEmployeeAccess, type AuthUser } from "@/server/auth/session";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { formatDateAr, fromDateKey, monthEnd, monthLabel, monthStart, shiftMonth, toDateKey, todayKey } from "@/lib/dates";
import { isOverdue } from "@/lib/goal-status";
import { formatPct, num, round2 } from "@/lib/num";
import type { ProgressBreakdown } from "@/lib/notion/progress";
import { GOAL_STATUS_LABELS, NOTION_STATUS_LABELS, TASK_STATUS_LABELS } from "@/lib/labels";
import { pct, type BatchSummary } from "@/lib/notion/batches";
import { batchesForPeriod } from "@/server/queries/batches";
import type { MonthlyReportContent, ReportBatchLine, ReportGoalLine, ReportTaskLine, ReportTotals, StageSummaryLine, WeeklyReportContent } from "@/lib/report-types";
import { getCompanyFresh } from "./company";
import { managerUserIdsFor, notifyUsers } from "./notifications";
import { recomputePlan } from "./progress";
import { dueMonths, monthsNeedingReport, REPORTABLE_PLAN_STATUSES, weeklyWindow, weeksNeedingReport } from "./reports-schedule";

const asBreakdown = (v: unknown) => (v && typeof v === "object" ? (v as ProgressBreakdown) : null);

function totalsOf(goals: ReportGoalLine[]): ReportTotals {
  const active = goals.filter((g) => g.status !== "CANCELLED");
  const weightSum = active.reduce((a, g) => a + g.weight, 0);
  const weightedProgress =
    active.length === 0
      ? 0
      : weightSum > 0
        ? active.reduce((a, g) => a + Math.min(g.progressPct, 100) * g.weight, 0) / weightSum
        : active.reduce((a, g) => a + Math.min(g.progressPct, 100), 0) / active.length;
  const sum = (k: keyof ProgressBreakdown) => active.reduce((a, g) => a + (g.breakdown ? Number(g.breakdown[k] ?? 0) : 0), 0);
  const approved = sum("completed");
  const needsRevision = sum("needsRevision");
  const worked = sum("worked");
  const reworkCount = sum("reworkCount");
  return {
    goalsCount: active.length,
    completedGoals: active.filter((g) => g.progressPct >= 100).length,
    weightedProgress: round2(weightedProgress),
    approved,
    worked,
    pendingApproval: sum("pendingApproval"),
    needsRevision,
    blocked: sum("blocked"),
    reworkCount,
    approvalRate: approved + needsRevision > 0 ? round2((approved / (approved + needsRevision)) * 100) : null,
    revisionRate: worked > 0 ? round2((Math.max(reworkCount, needsRevision) / worked) * 100) : null,
  };
}

type TaskRow = {
  id: string;
  title: string;
  date?: Date | null;
  assignedDate?: Date;
  deadline?: Date | null;
  dueDate?: Date | null;
  status: string;
  source?: string;
  progress: number;
  target?: Prisma.Decimal | number;
  achieved?: Prisma.Decimal | number;
  delayReason: string | null;
  notes: string | null;
};

function taskLine(t: TaskRow, source = t.source ?? "MANUAL"): ReportTaskLine {
  const date = t.date ?? t.assignedDate ?? null;
  const deadline = t.deadline ?? t.dueDate ?? null;
  return {
    id: t.id,
    title: t.title,
    date: date ? toDateKey(date) : null,
    deadline: deadline ? toDateKey(deadline) : null,
    status: t.status,
    source,
    progress: t.progress,
    target: num(t.target),
    achieved: num(t.achieved),
    delayReason: t.delayReason,
    notes: t.notes,
  };
}

function breakdownText(b: ProgressBreakdown | null) {
  if (!b) return "";
  const parts = [`معتمد/مكتمل ${b.completed}`];
  if (b.pendingApproval) parts.push(`بانتظار الاعتماد ${b.pendingApproval}`);
  if (b.needsRevision) parts.push(`يحتاج تحسين ${b.needsRevision}`);
  if (b.blocked) parts.push(`معلق ${b.blocked}`);
  return ` (${parts.join("، ")})`;
}

function batchLine(b: BatchSummary): ReportBatchLine {
  return {
    label: b.label,
    total: b.total,
    imagesApproved: b.images.approved,
    added: b.store.added,
    needsImprovement: b.images.needsImprovement,
    waiting: b.images.waiting + b.images.edited,
    imagesPct: pct(b.images.approved, b.total),
    addedPct: pct(b.store.added, b.total),
  };
}

async function batchLinesFor(employeeId: string, start: string, end: string): Promise<ReportBatchLine[]> {
  return (await batchesForPeriod(employeeId, start, end)).map(batchLine);
}

export function batchText(b: ReportBatchLine) {
  return `• ${b.label} — المستهدف ${b.total} منتج: الصور المعتمدة ${b.imagesApproved}، تمت الإضافة للمتجر ${b.added}، تحتاج تحسين ${b.needsImprovement}، بانتظار الاعتماد ${b.waiting} — إنجاز الصور ${formatPct(b.imagesPct)}، إضافة المنتجات ${formatPct(b.addedPct)}`;
}

// ---------------------------------------------------------------------------
//  Weekly
// ---------------------------------------------------------------------------

export async function buildWeeklyContent(weeklyPlanId: string): Promise<WeeklyReportContent> {
  const company = await getCompanyFresh();
  const today = todayKey(company.timezone);
  const week = await db.weeklyPlan.findUniqueOrThrow({
    where: { id: weeklyPlanId },
    include: {
      monthlyPlan: true,
      employee: { include: { jobTitle: true } },
      goals: {
        include: { monthlyGoal: true },
        orderBy: { monthlyGoal: { sortOrder: "asc" } },
      },
    },
  });
  const start = week.startDate;
  const end = week.endDate;
  const [tasks, adHoc] = await Promise.all([
    db.dailyTask.findMany({
      where: { employeeId: week.employeeId, date: { gte: start, lte: end } },
      orderBy: { date: "asc" },
    }),
    db.adHocTask.findMany({
      where: {
        employeeId: week.employeeId,
        OR: [{ assignedDate: { gte: start, lte: end } }, { dueDate: { gte: start, lte: end } }],
      },
      orderBy: { assignedDate: "asc" },
    }),
  ]);

  const goals: ReportGoalLine[] = week.goals.map((wg) => ({
    goalId: wg.monthlyGoalId,
    name: wg.monthlyGoal.name,
    dutyName: wg.monthlyGoal.dutyName,
    unit: wg.monthlyGoal.unit,
    category: wg.monthlyGoal.category,
    source: wg.monthlyGoal.source,
    goalType: wg.monthlyGoal.goalType,
    weight: num(wg.monthlyGoal.weight),
    status: wg.monthlyGoal.status,
    target: num(wg.targetValue),
    achieved: num(wg.achievedValue),
    progressPct: num(wg.progressPct),
    breakdown: asBreakdown(wg.breakdown),
  }));

  const manualTasks = tasks.filter((t) => t.source === "MANUAL").map((t) => taskLine(t));
  const delayedTasks = [
    ...tasks
      .filter((t) => t.status === "DELAYED" || t.status === "BLOCKED" || isOverdue(t.status, t.deadline ? toDateKey(t.deadline) : null, today))
      .map((t) => taskLine(t)),
    ...adHoc
      .filter((t) => t.status === "BLOCKED" || isOverdue(t.status, t.dueDate ? toDateKey(t.dueDate) : null, today))
      .map((t) => taskLine(t, "AD_HOC_TASK")),
  ];
  const adHocTasks = adHoc.map((t) => taskLine(t, "AD_HOC_TASK"));

  const autoHighlights = goals
    .filter((g) => g.progressPct >= 100 && g.target > 0)
    .map((g) => `تحقيق هدف "${g.name}" بنسبة ${formatPct(g.progressPct)} (${g.achieved} من ${g.target} ${g.unit})`);
  adHocTasks.filter((t) => t.status === "COMPLETED").forEach((t) => autoHighlights.push(`إنجاز التكليف: ${t.title}`));

  const autoCarryOver = [
    ...goals
      .filter((g) => g.target > g.achieved && g.goalType !== "PERCENTAGE")
      .map((g) => `${g.name}: متبقي ${round2(g.target - g.achieved)} ${g.unit}`),
    ...tasks.filter((t) => t.source === "MANUAL" && !["COMPLETED", "CANCELLED"].includes(t.status)).map((t) => `مهمة: ${t.title}`),
  ];

  return {
    version: 1,
    employee: {
      id: week.employeeId,
      name: week.employee.fullName,
      jobTitle: week.employee.jobTitle?.name ?? null,
    },
    week: {
      index: week.weekIndex,
      start: toDateKey(start),
      end: toDateKey(end),
      year: week.monthlyPlan.year,
      month: week.monthlyPlan.month,
    },
    goals,
    totals: totalsOf(goals),
    manualTasks,
    delayedTasks,
    adHocTasks,
    autoHighlights,
    autoCarryOver,
    batches: await batchLinesFor(week.employeeId, toDateKey(start), toDateKey(end)),
  };
}

export function weeklyText(c: WeeklyReportContent): string {
  const lines: string[] = [];
  lines.push(`التقرير الأسبوعي — ${c.employee.name}${c.employee.jobTitle ? ` (${c.employee.jobTitle})` : ""}`);
  lines.push(`الأسبوع ${c.week.index} من ${monthLabel(c.week.year, c.week.month)}: ${formatDateAr(c.week.start)} – ${formatDateAr(c.week.end)}`);
  lines.push("");
  lines.push(`نسبة الإنجاز الموزونة: ${formatPct(c.totals.weightedProgress)} — أهداف مكتملة ${c.totals.completedGoals} من ${c.totals.goalsCount}`);
  if (c.totals.worked > 0) {
    lines.push(
      `عناصر Notion: عمل على ${c.totals.worked}، معتمد ${c.totals.approved}، بانتظار الاعتماد ${c.totals.pendingApproval}، يحتاج تحسين ${c.totals.needsRevision}` +
        (c.totals.approvalRate !== null ? ` — نسبة الاعتماد ${formatPct(c.totals.approvalRate)}` : ""),
    );
  }
  lines.push("");
  lines.push("أولًا: أهداف الأسبوع");
  c.goals.forEach((g, i) => {
    lines.push(
      `${i + 1}. ${g.name}: المستهدف ${g.target} ${g.unit}، المنجز ${g.achieved} (${formatPct(g.progressPct)})${breakdownText(g.breakdown)}`,
    );
  });
  if (c.manualTasks.length) {
    lines.push("");
    lines.push("ثانيًا: المهام اليدوية");
    c.manualTasks.forEach((t) => lines.push(`• ${t.title} — ${TASK_STATUS_LABELS[t.status as keyof typeof TASK_STATUS_LABELS]?.label ?? t.status}`));
  }
  if (c.adHocTasks.length) {
    lines.push("");
    lines.push("ثالثًا: التكليفات المستجدة");
    c.adHocTasks.forEach((t) => lines.push(`• ${t.title} — ${TASK_STATUS_LABELS[t.status as keyof typeof TASK_STATUS_LABELS]?.label ?? t.status}`));
  }
  if (c.delayedTasks.length) {
    lines.push("");
    lines.push("المعوقات والتأخير");
    c.delayedTasks.forEach((t) => lines.push(`• ${t.title}${t.delayReason ? ` — السبب: ${t.delayReason}` : ""}`));
  }
  if (c.batches?.length) {
    lines.push("");
    lines.push("الدفعات");
    c.batches.forEach((b) => lines.push(batchText(b)));
  }
  if (c.autoHighlights.length) {
    lines.push("");
    lines.push("ما أُنجز");
    c.autoHighlights.forEach((h) => lines.push(`• ${h}`));
  }
  if (c.autoCarryOver.length) {
    lines.push("");
    lines.push("لم يكتمل — أولويات الأسبوع القادم");
    c.autoCarryOver.forEach((h) => lines.push(`• ${h}`));
  }
  return lines.join("\n");
}

/** Create or refresh the weekly report draft (employee notes are preserved). */
export async function generateWeeklyReport(weeklyPlanId: string, opts: { notify?: boolean } = {}) {
  const week = await db.weeklyPlan.findUniqueOrThrow({
    where: { id: weeklyPlanId },
    include: { report: true, employee: true },
  });
  if (week.report && !["DRAFT", "RETURNED"].includes(week.report.status)) return week.report;
  await recomputePlan(week.monthlyPlanId);
  const content = await buildWeeklyContent(weeklyPlanId);
  const text = weeklyText(content);
  const report = await db.weeklyReport.upsert({
    where: { weeklyPlanId },
    create: {
      weeklyPlanId,
      employeeId: week.employeeId,
      weekStart: week.startDate,
      weekEnd: week.endDate,
      content: content as unknown as Prisma.InputJsonValue,
      generatedText: text,
    },
    update: {
      content: content as unknown as Prisma.InputJsonValue,
      generatedText: text,
      generatedAt: new Date(),
    },
  });
  if (opts.notify && !week.report) {
    await notifyUsers([week.employee.userId], {
      type: "WEEKLY_REPORT_READY",
      title: `التقرير الأسبوعي للأسبوع ${week.weekIndex} جاهز`,
      body: "راجع التقرير وأضف ملاحظاتك ثم أرسله للمدير",
      link: `/reports/weekly/${report.id}`,
      dedupeKey: `weekly-ready:${report.id}`,
    });
  }
  return report;
}

function assertOwnerOrReviewer(user: AuthUser, employeeId: string) {
  assertEmployeeAccess(user, employeeId);
}

export async function updateWeeklyNotes(
  user: AuthUser,
  reportId: string,
  notes: {
    employeeNotes: string | null;
    highlights: string | null;
    blockers: string | null;
    carryOver: string | null;
  },
) {
  const report = await db.weeklyReport.findUniqueOrThrow({
    where: { id: reportId },
  });
  assertOwnerOrReviewer(user, report.employeeId);
  if (report.employeeId !== user.employeeId) throw new UserError("الملاحظات يحررها صاحب التقرير فقط");
  if (!["DRAFT", "RETURNED"].includes(report.status)) throw new UserError("لا يمكن تعديل تقرير مرسل");
  const updated = await db.weeklyReport.update({
    where: { id: reportId },
    data: notes,
  });
  await audit({
    user,
    action: "report.weekly.update",
    entityType: "WeeklyReport",
    entityId: reportId,
    before: report,
    after: updated,
    diff: true,
  });
}

export async function submitWeeklyReport(user: AuthUser, reportId: string) {
  const report = await db.weeklyReport.findUniqueOrThrow({
    where: { id: reportId },
    include: { employee: true },
  });
  if (report.employeeId !== user.employeeId) throw new UserError("يرسل التقرير صاحبه فقط");
  if (!["DRAFT", "RETURNED"].includes(report.status)) throw new UserError("التقرير مرسل مسبقًا");
  // refresh numbers right before submission
  await generateWeeklyReport(report.weeklyPlanId);
  await db.weeklyReport.update({
    where: { id: reportId },
    data: { status: "SUBMITTED", submittedAt: new Date() },
  });
  await audit({
    user,
    action: "report.weekly.status",
    entityType: "WeeklyReport",
    entityId: reportId,
    before: { status: report.status },
    after: { status: "SUBMITTED" },
  });
  const managers = await managerUserIdsFor(report.employeeId);
  await notifyUsers(
    managers.filter((id) => id !== user.id),
    {
      type: "REPORT_SUBMITTED",
      title: `تقرير أسبوعي من ${report.employee.fullName}`,
      body: `أسبوع ${formatDateAr(report.weekStart)} بانتظار مراجعتك`,
      link: `/reports/weekly/${reportId}`,
    },
  );
}

export async function reviewWeeklyReport(user: AuthUser, reportId: string, decision: "APPROVE" | "RETURN" | "REVIEWED", comment: string | null) {
  if (!hasPermission(user, PERMISSIONS.REPORTS_REVIEW)) throw new UserError("ليس لديك صلاحية مراجعة التقارير");
  const report = await db.weeklyReport.findUniqueOrThrow({
    where: { id: reportId },
    include: { employee: true },
  });
  assertEmployeeAccess(user, report.employeeId);
  if (!["SUBMITTED", "REVIEWED"].includes(report.status)) throw new UserError("التقرير ليس بانتظار المراجعة");
  if (decision === "RETURN" && !comment) throw new UserError("اكتب سبب الإعادة");
  const status = decision === "APPROVE" ? "APPROVED" : decision === "RETURN" ? "RETURNED" : "REVIEWED";
  await db.weeklyReport.update({
    where: { id: reportId },
    data: {
      status,
      managerComment: comment ?? report.managerComment,
      reviewedAt: new Date(),
      reviewedById: user.id,
      approvedAt: status === "APPROVED" ? new Date() : null,
    },
  });
  await audit({
    user,
    action: "report.weekly.status",
    entityType: "WeeklyReport",
    entityId: reportId,
    before: { status: report.status },
    after: { status },
    reason: comment,
  });
  await notifyUsers([report.employee.userId], {
    type: status === "RETURNED" ? "REPORT_RETURNED" : "REPORT_APPROVED",
    title:
      status === "RETURNED"
        ? "أعاد المدير تقريرك الأسبوعي للمراجعة"
        : status === "APPROVED"
          ? "تم اعتماد تقريرك الأسبوعي"
          : comment
            ? "أضاف المدير ملاحظة على تقريرك الأسبوعي"
            : "تمت مراجعة تقريرك الأسبوعي",
    body: comment,
    link: `/reports/weekly/${reportId}`,
  });
}

// ---------------------------------------------------------------------------
//  Monthly
// ---------------------------------------------------------------------------

async function stageSummaryFor(employeeId: string, goals: { notionDataSourceId: string | null; notionFilter: unknown }[], from: Date, to: Date) {
  // stages referenced by the employee's goals + stages the employee owns
  const pairs = new Map<string, { dataSourceId: string; stageKey: string }>();
  for (const g of goals) {
    const stageKey = g.notionFilter && typeof g.notionFilter === "object" ? (g.notionFilter as { stageKey?: string }).stageKey : undefined;
    if (g.notionDataSourceId && stageKey)
      pairs.set(`${g.notionDataSourceId}:${stageKey}`, {
        dataSourceId: g.notionDataSourceId,
        stageKey,
      });
  }
  const owned = await db.notionFieldMapping.findMany({
    where: { ownerEmployeeId: employeeId, role: "STATUS", isActive: true },
    select: { dataSourceId: true, stageKey: true },
  });
  for (const o of owned)
    if (o.stageKey)
      pairs.set(`${o.dataSourceId}:${o.stageKey}`, {
        dataSourceId: o.dataSourceId,
        stageKey: o.stageKey,
      });
  if (pairs.size === 0) return [];

  const mappings = await db.notionFieldMapping.findMany({
    where: {
      OR: [...pairs.values()].map((p) => ({
        dataSourceId: p.dataSourceId,
        stageKey: p.stageKey,
      })),
    },
    include: { dataSource: { select: { name: true } } },
  });
  const lines: StageSummaryLine[] = [];
  for (const m of mappings) {
    if (!m.stageKey) continue;
    const [grouped, revisions] = await Promise.all([
      db.notionItemStage.groupBy({
        by: ["systemStatus"],
        where: {
          stageKey: m.stageKey,
          statusChangedAt: { gte: from, lte: to },
          item: { dataSourceId: m.dataSourceId, isArchived: false },
        },
        _count: { _all: true },
      }),
      db.notionItemEvent.count({
        where: {
          stageKey: m.stageKey,
          toStatus: "NEEDS_REVISION",
          occurredAt: { gte: from, lte: to },
          item: { dataSourceId: m.dataSourceId },
        },
      }),
    ]);
    lines.push({
      dataSourceName: m.dataSource.name,
      stageKey: m.stageKey,
      label: m.label,
      counts: Object.fromEntries(grouped.map((g) => [g.systemStatus, g._count._all])),
      revisionEvents: revisions,
    });
  }
  return lines;
}

export async function buildMonthlyContent(planId: string): Promise<MonthlyReportContent> {
  const plan = await db.monthlyPlan.findUniqueOrThrow({
    where: { id: planId },
    include: {
      employee: { include: { jobTitle: true } },
      goals: { orderBy: { sortOrder: "asc" } },
      weeklyPlans: {
        include: { goals: true, report: true },
        orderBy: { weekIndex: "asc" },
      },
    },
  });
  const company = await getCompanyFresh();
  const today = todayKey(company.timezone);
  const startKey = monthStart(plan.year, plan.month);
  const endKey = monthEnd(plan.year, plan.month);
  const from = fromDateKey(startKey);
  const to = new Date(fromDateKey(endKey).getTime() + 86_399_999);

  const [tasks, adHoc] = await Promise.all([
    db.dailyTask.findMany({
      where: {
        employeeId: plan.employeeId,
        date: { gte: from, lte: fromDateKey(endKey) },
      },
    }),
    db.adHocTask.findMany({
      where: {
        employeeId: plan.employeeId,
        assignedDate: { gte: from, lte: fromDateKey(endKey) },
      },
    }),
  ]);

  const goals: ReportGoalLine[] = plan.goals.map((g) => ({
    goalId: g.id,
    name: g.name,
    dutyName: g.dutyName,
    unit: g.unit,
    category: g.category,
    source: g.source,
    goalType: g.goalType,
    weight: num(g.weight),
    status: g.status,
    target: num(g.targetValue),
    achieved: num(g.achievedValue),
    progressPct: num(g.progressPct),
    breakdown: asBreakdown(g.breakdown),
  }));

  const weeks = plan.weeklyPlans.map((w) => {
    const lines = w.goals.map((wg) => ({
      weight: num(plan.goals.find((g) => g.id === wg.monthlyGoalId)?.weight),
      p: Math.min(num(wg.progressPct), 100),
    }));
    const ws = lines.reduce((a, l) => a + l.weight, 0);
    const progress =
      lines.length === 0 ? 0 : ws > 0 ? lines.reduce((a, l) => a + l.p * l.weight, 0) / ws : lines.reduce((a, l) => a + l.p, 0) / lines.length;
    return {
      index: w.weekIndex,
      start: toDateKey(w.startDate),
      end: toDateKey(w.endDate),
      progressPct: round2(progress),
      reportStatus: w.report?.status ?? null,
    };
  });

  const autoHighlights = goals.filter((g) => g.progressPct >= 100 && g.target > 0).map((g) => `تحقيق "${g.name}" بنسبة ${formatPct(g.progressPct)}`);
  adHoc.filter((t) => t.status === "COMPLETED").forEach((t) => autoHighlights.push(`إنجاز التكليف: ${t.title}`));

  return {
    version: 1,
    employee: {
      id: plan.employeeId,
      name: plan.employee.fullName,
      jobTitle: plan.employee.jobTitle?.name ?? null,
    },
    period: {
      year: plan.year,
      month: plan.month,
      start: startKey,
      end: endKey,
    },
    goals,
    totals: totalsOf(goals),
    weeks,
    adHocTasks: adHoc.map((t) => taskLine(t, "AD_HOC_TASK")),
    delayedTasks: [
      ...tasks.filter((t) => t.status === "DELAYED" || isOverdue(t.status, t.deadline ? toDateKey(t.deadline) : null, today)).map((t) => taskLine(t)),
      ...adHoc.filter((t) => isOverdue(t.status, t.dueDate ? toDateKey(t.dueDate) : null, today)).map((t) => taskLine(t, "AD_HOC_TASK")),
    ],
    cancelledTasks: [
      ...tasks.filter((t) => t.status === "CANCELLED").map((t) => taskLine(t)),
      ...adHoc.filter((t) => t.status === "CANCELLED").map((t) => taskLine(t, "AD_HOC_TASK")),
    ],
    stageSummary: await stageSummaryFor(plan.employeeId, plan.goals, from, to),
    autoHighlights,
    weeklyNotes: plan.weeklyPlans
      .filter((w) => w.report)
      .map((w) => ({
        week: w.weekIndex,
        highlights: w.report!.highlights,
        blockers: w.report!.blockers,
      })),
    batches: await batchLinesFor(plan.employeeId, startKey, endKey),
  };
}

export function monthlyText(c: MonthlyReportContent): string {
  const l: string[] = [];
  l.push(`التقرير الشهري — ${c.employee.name}${c.employee.jobTitle ? ` (${c.employee.jobTitle})` : ""}`);
  l.push(`الفترة: ${monthLabel(c.period.year, c.period.month)}`);
  l.push("");
  l.push(`نسبة الإنجاز الموزونة: ${formatPct(c.totals.weightedProgress)} — أهداف مكتملة ${c.totals.completedGoals} من ${c.totals.goalsCount}`);
  if (c.totals.worked > 0) {
    l.push(
      `الجودة: معتمد ${c.totals.approved} من ${c.totals.worked} عنصر، يحتاج تحسين ${c.totals.needsRevision}، إعادة عمل ${c.totals.reworkCount}` +
        (c.totals.approvalRate !== null ? ` — نسبة الاعتماد ${formatPct(c.totals.approvalRate)}` : ""),
    );
  }
  l.push("");
  l.push("الأهداف");
  c.goals.forEach((g, i) =>
    l.push(
      `${i + 1}. ${g.name}: ${g.achieved} من ${g.target} ${g.unit} (${formatPct(g.progressPct)}) — ${GOAL_STATUS_LABELS[g.status as keyof typeof GOAL_STATUS_LABELS]?.label ?? g.status}${breakdownText(g.breakdown)}`,
    ),
  );
  if (c.weeks.length) {
    l.push("");
    l.push("الأسابيع");
    c.weeks.forEach((w) => l.push(`• الأسبوع ${w.index}: ${formatPct(w.progressPct)}`));
  }
  if (c.stageSummary.length) {
    l.push("");
    l.push("حالات Notion خلال الشهر");
    c.stageSummary.forEach((s) => {
      const parts = Object.entries(s.counts).map(([k, v]) => `${NOTION_STATUS_LABELS[k as keyof typeof NOTION_STATUS_LABELS]?.label ?? k} ${v}`);
      l.push(`• ${s.label} (${s.dataSourceName}): ${parts.join("، ")}${s.revisionEvents ? ` — أعيد للتحسين ${s.revisionEvents} مرة` : ""}`);
    });
  }
  if (c.batches?.length) {
    l.push("");
    l.push("الدفعات");
    c.batches.forEach((b) => l.push(batchText(b)));
  }
  if (c.adHocTasks.length) {
    l.push("");
    l.push("المهام الإضافية");
    c.adHocTasks.forEach((t) => l.push(`• ${t.title} — ${TASK_STATUS_LABELS[t.status as keyof typeof TASK_STATUS_LABELS]?.label ?? t.status}`));
  }
  if (c.delayedTasks.length) {
    l.push("");
    l.push("المهام المتأخرة");
    c.delayedTasks.forEach((t) => l.push(`• ${t.title}${t.delayReason ? ` — ${t.delayReason}` : ""}`));
  }
  if (c.autoHighlights.length) {
    l.push("");
    l.push("الإنجازات المهمة");
    c.autoHighlights.forEach((h) => l.push(`• ${h}`));
  }
  return l.join("\n");
}

export async function generateMonthlyReport(planId: string, opts: { force?: boolean; notify?: boolean } = {}) {
  const plan = await db.monthlyPlan.findUniqueOrThrow({
    where: { id: planId },
    include: { report: true, employee: true },
  });
  if (plan.report && !opts.force && !["DRAFT", "RETURNED"].includes(plan.report.status)) return plan.report;
  await recomputePlan(planId);
  const content = await buildMonthlyContent(planId);
  const text = monthlyText(content);
  const report = await db.monthlyReport.upsert({
    where: { monthlyPlanId: planId },
    create: {
      monthlyPlanId: planId,
      employeeId: plan.employeeId,
      year: plan.year,
      month: plan.month,
      content: content as unknown as Prisma.InputJsonValue,
      generatedText: text,
    },
    update: {
      content: content as unknown as Prisma.InputJsonValue,
      generatedText: text,
      generatedAt: new Date(),
    },
  });
  if (opts.notify && !plan.report) {
    await notifyUsers([plan.employee.userId], {
      type: "WEEKLY_REPORT_READY",
      title: `التقرير الشهري لشهر ${monthLabel(plan.year, plan.month)} جاهز للمراجعة`,
      body: "راجع التقرير وأضف ملاحظتك ثم أرسله للمدير",
      link: `/reports/monthly/${report.id}`,
      dedupeKey: `monthly-ready:${report.id}`,
    });
  }
  return report;
}

const DRAFT_STATUSES = ["DRAFT", "RETURNED"] as const;

async function recentMonths() {
  const company = await getCompanyFresh();
  const today = todayKey(company.timezone);
  const current = { year: +today.slice(0, 4), month: +today.slice(5, 7) };
  return [current, shiftMonth(current.year, current.month, -1)];
}

/**
 * Regenerate the draft/returned reports (current and previous month) of the given
 * employees so they reflect freshly synced data. Submitted, reviewed and approved
 * reports are never touched; the generators keep the employee's notes.
 */
export async function refreshDraftReports(employeeIds: string[]) {
  const result = { weekly: 0, monthly: 0, failed: 0 };
  if (employeeIds.length === 0) return result;
  const months = await recentMonths();
  const monthFilter = months.map((m) => ({ year: m.year, month: m.month }));
  const [weekly, monthly] = await Promise.all([
    db.weeklyReport.findMany({
      where: { employeeId: { in: employeeIds }, status: { in: [...DRAFT_STATUSES] }, weeklyPlan: { monthlyPlan: { OR: monthFilter } } },
      select: { weeklyPlanId: true },
    }),
    db.monthlyReport.findMany({
      where: { employeeId: { in: employeeIds }, status: { in: [...DRAFT_STATUSES] }, OR: monthFilter },
      select: { monthlyPlanId: true },
    }),
  ]);
  for (const r of weekly) {
    try {
      await generateWeeklyReport(r.weeklyPlanId);
      result.weekly++;
    } catch (e) {
      result.failed++;
      console.error("refreshDraftReports weekly", r.weeklyPlanId, e);
    }
  }
  for (const r of monthly) {
    try {
      await generateMonthlyReport(r.monthlyPlanId);
      result.monthly++;
    } catch (e) {
      result.failed++;
      console.error("refreshDraftReports monthly", r.monthlyPlanId, e);
    }
  }
  return result;
}

/** After a sync: refresh the drafts of employees whose recent plans use this data source. Never throws. */
export async function refreshDraftsForDataSource(dataSourceId: string) {
  try {
    const months = await recentMonths();
    const plans = await db.monthlyPlan.findMany({
      where: { OR: months.map((m) => ({ year: m.year, month: m.month })), goals: { some: { notionDataSourceId: dataSourceId } } },
      select: { employeeId: true },
      distinct: ["employeeId"],
    });
    return await refreshDraftReports(plans.map((p) => p.employeeId));
  } catch (e) {
    console.error("refreshDraftsForDataSource", dataSourceId, e);
    return null;
  }
}

const isUniqueViolation = (e: unknown) => typeof e === "object" && e !== null && (e as { code?: unknown }).code === "P2002";

/**
 * Create the missing report drafts for every ended week / due month of the
 * given employees. Idempotent: only periods without any report are touched,
 * so drafts the employee edited and submitted/approved reports are never
 * overwritten. `limit` caps the work done in one call (lazy generation on read).
 */
export async function ensureDueReports(opts: { employeeIds: "ALL" | string[]; notify?: boolean; limit?: number }) {
  const result = { weekly: 0, monthly: 0, failed: 0 };
  if (opts.employeeIds !== "ALL" && opts.employeeIds.length === 0) return result;
  const company = await getCompanyFresh();
  const today = todayKey(company.timezone);
  const employee: Prisma.EmployeeWhereInput = {
    status: { not: "TERMINATED" },
    ...(opts.employeeIds === "ALL" ? {} : { id: { in: opts.employeeIds } }),
  };
  const statuses = [...REPORTABLE_PLAN_STATUSES];
  const window = weeklyWindow(today);
  const months = dueMonths(today);
  const [weeks, plans] = await Promise.all([
    db.weeklyPlan.findMany({
      where: {
        endDate: {
          gte: fromDateKey(window.from),
          lt: fromDateKey(window.before),
        },
        report: null,
        employee,
        monthlyPlan: { status: { in: statuses } },
      },
      select: {
        id: true,
        endDate: true,
        monthlyPlan: { select: { status: true } },
      },
      orderBy: { endDate: "asc" },
    }),
    months.length === 0
      ? Promise.resolve([])
      : db.monthlyPlan.findMany({
          where: {
            report: null,
            employee,
            status: { in: statuses },
            OR: months,
          },
          select: { id: true, year: true, month: true, status: true },
        }),
  ]);
  const dueWeeks = weeksNeedingReport(
    weeks.map((w) => ({
      id: w.id,
      endDate: toDateKey(w.endDate),
      planStatus: w.monthlyPlan.status,
      hasReport: false,
    })),
    today,
  );
  const duePlans = monthsNeedingReport(
    plans.map((p) => ({
      id: p.id,
      year: p.year,
      month: p.month,
      planStatus: p.status,
      hasReport: false,
    })),
    today,
  );

  let budget = opts.limit ?? Number.POSITIVE_INFINITY;
  const run = async (fn: () => Promise<unknown>, key: "weekly" | "monthly") => {
    if (budget <= 0) return;
    budget -= 1;
    try {
      await fn();
      result[key] += 1;
    } catch (e) {
      if (isUniqueViolation(e)) return;
      result.failed += 1;
      console.error(`[reports] auto ${key} generation failed`, e);
    }
  };
  for (const w of dueWeeks) await run(() => generateWeeklyReport(w.id, { notify: opts.notify }), "weekly");
  for (const p of duePlans) await run(() => generateMonthlyReport(p.id, { notify: opts.notify }), "monthly");
  return result;
}

export async function updateMonthlyNotes(
  user: AuthUser,
  reportId: string,
  data: {
    employeeNotes?: string | null;
    highlights?: string | null;
    managerNotes?: string | null;
  },
) {
  const report = await db.monthlyReport.findUniqueOrThrow({
    where: { id: reportId },
  });
  assertEmployeeAccess(user, report.employeeId);
  const isOwner = report.employeeId === user.employeeId;
  const isReviewer = hasPermission(user, PERMISSIONS.REPORTS_REVIEW);
  const patch: Prisma.MonthlyReportUpdateInput = {};
  if (isOwner && ["DRAFT", "RETURNED"].includes(report.status)) {
    if (data.employeeNotes !== undefined) patch.employeeNotes = data.employeeNotes;
    if (data.highlights !== undefined) patch.highlights = data.highlights;
  }
  if (isReviewer && data.managerNotes !== undefined) patch.managerNotes = data.managerNotes;
  if (Object.keys(patch).length === 0) throw new UserError("لا توجد حقول يمكنك تعديلها");
  const updated = await db.monthlyReport.update({
    where: { id: reportId },
    data: patch,
  });
  await audit({
    user,
    action: "report.monthly.update",
    entityType: "MonthlyReport",
    entityId: reportId,
    before: report,
    after: updated,
    diff: true,
  });
}

export async function submitMonthlyReport(user: AuthUser, reportId: string) {
  const report = await db.monthlyReport.findUniqueOrThrow({
    where: { id: reportId },
    include: { employee: true },
  });
  if (report.employeeId !== user.employeeId) throw new UserError("يرسل التقرير صاحبه فقط");
  if (!["DRAFT", "RETURNED"].includes(report.status)) throw new UserError("التقرير مرسل مسبقًا");
  await generateMonthlyReport(report.monthlyPlanId);
  await db.monthlyReport.update({
    where: { id: reportId },
    data: { status: "SUBMITTED", submittedAt: new Date() },
  });
  await audit({
    user,
    action: "report.monthly.status",
    entityType: "MonthlyReport",
    entityId: reportId,
    before: { status: report.status },
    after: { status: "SUBMITTED" },
  });
  const managers = await managerUserIdsFor(report.employeeId);
  await notifyUsers(
    managers.filter((id) => id !== user.id),
    {
      type: "REPORT_SUBMITTED",
      title: `تقرير شهري من ${report.employee.fullName}`,
      body: monthLabel(report.year, report.month),
      link: `/reports/monthly/${reportId}`,
    },
  );
}

export async function reviewMonthlyReport(user: AuthUser, reportId: string, decision: "APPROVE" | "RETURN" | "REVIEWED", comment: string | null) {
  if (!hasPermission(user, PERMISSIONS.REPORTS_REVIEW)) throw new UserError("ليس لديك صلاحية مراجعة التقارير");
  const report = await db.monthlyReport.findUniqueOrThrow({
    where: { id: reportId },
    include: { employee: true },
  });
  assertEmployeeAccess(user, report.employeeId);
  if (!["SUBMITTED", "REVIEWED"].includes(report.status)) throw new UserError("التقرير ليس بانتظار المراجعة");
  if (decision === "RETURN" && !comment) throw new UserError("اكتب سبب الإعادة");
  const status = decision === "APPROVE" ? "APPROVED" : decision === "RETURN" ? "RETURNED" : "REVIEWED";
  await db.monthlyReport.update({
    where: { id: reportId },
    data: {
      status,
      managerNotes: comment ?? report.managerNotes,
      reviewedAt: new Date(),
      reviewedById: user.id,
      approvedAt: status === "APPROVED" ? new Date() : null,
    },
  });
  await audit({
    user,
    action: "report.monthly.status",
    entityType: "MonthlyReport",
    entityId: reportId,
    before: { status: report.status },
    after: { status },
    reason: comment,
  });
  await notifyUsers([report.employee.userId], {
    type: status === "RETURNED" ? "REPORT_RETURNED" : "REPORT_APPROVED",
    title:
      status === "RETURNED"
        ? "أعاد المدير تقريرك الشهري للمراجعة"
        : status === "APPROVED"
          ? "تم اعتماد تقريرك الشهري"
          : comment
            ? "أضاف المدير ملاحظة على تقريرك الشهري"
            : "تمت مراجعة تقريرك الشهري",
    body: comment,
    link: `/reports/monthly/${reportId}`,
  });
}
