import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { employeeWhere, type AuthUser } from "@/server/auth/session";
import { getCompany } from "@/server/services/company";
import { addDays, fromDateKey, startOfWeek, toDateKey, todayKey } from "@/lib/dates";
import { num } from "@/lib/num";
import { isOverdue } from "@/lib/goal-status";
import type { PriorityKey, TaskStatusKey } from "@/lib/labels";
import { ensureThursdayRecurringTasks } from "@/server/services/recurring-tasks";

// ---------------------------------------------------------------------------
//  Serializable row shapes shared with client components
// ---------------------------------------------------------------------------

export interface DailyTaskRow {
  id: string;
  kind: "daily";
  employeeId: string;
  employeeName: string;
  title: string;
  description: string | null;
  date: string;
  deadline: string | null;
  target: number;
  achieved: number;
  progress: number;
  status: TaskStatusKey;
  source: "DISTRIBUTED" | "MANUAL" | "NOTION" | "AD_HOC_TASK";
  priority: PriorityKey;
  notes: string | null;
  delayReason: string | null;
  monthlyGoalId: string | null;
  goalName: string | null;
  unit: string | null;
  notionDriven: boolean;
  overdue: boolean;
}

export interface AdHocTaskRow {
  id: string;
  kind: "adhoc";
  employeeId: string;
  employeeName: string;
  assignedByName: string | null;
  title: string;
  description: string | null;
  assignedDate: string;
  dueDate: string | null;
  priority: PriorityKey;
  status: TaskStatusKey;
  progress: number;
  includeInEvaluation: boolean;
  weight: number;
  isOutOfPlan: boolean;
  compensatesGoalId: string | null;
  compensatesGoalName: string | null;
  notes: string | null;
  delayReason: string | null;
  overdue: boolean;
}

export interface GoalOption {
  id: string;
  name: string;
  unit: string;
}

export interface EmployeeOption {
  id: string;
  name: string;
  goals: GoalOption[];
}

export const dailyInclude = {
  employee: { select: { fullName: true } },
  monthlyGoal: { select: { name: true, unit: true, source: true } },
} satisfies Prisma.DailyTaskInclude;

type DailyWithRel = Prisma.DailyTaskGetPayload<{ include: typeof dailyInclude }>;

export function toDailyRow(t: DailyWithRel, today: string): DailyTaskRow {
  const deadline = t.deadline ? toDateKey(t.deadline) : null;
  const date = toDateKey(t.date);
  return {
    id: t.id,
    kind: "daily",
    employeeId: t.employeeId,
    employeeName: t.employee.fullName,
    title: t.title,
    description: t.description,
    date,
    deadline,
    target: num(t.target),
    achieved: num(t.achieved),
    progress: t.progress,
    status: t.status,
    source: t.source,
    priority: t.priority,
    notes: t.notes,
    delayReason: t.delayReason,
    monthlyGoalId: t.monthlyGoalId,
    goalName: t.monthlyGoal?.name ?? null,
    unit: t.monthlyGoal?.unit ?? null,
    notionDriven: t.monthlyGoal?.source === "NOTION" && t.source !== "MANUAL",
    overdue:
      t.status === "DELAYED" ||
      isOverdue(t.status, deadline, today) ||
      (t.source === "MANUAL" && date < today && (t.status === "NOT_STARTED" || t.status === "IN_PROGRESS")),
  };
}

export const adHocInclude = {
  employee: { select: { fullName: true } },
  compensatesGoal: { select: { name: true } },
} satisfies Prisma.AdHocTaskInclude;

type AdHocWithRel = Prisma.AdHocTaskGetPayload<{ include: typeof adHocInclude }>;

export function toAdHocRow(t: AdHocWithRel, today: string, assigners: Map<string, string>): AdHocTaskRow {
  const due = t.dueDate ? toDateKey(t.dueDate) : null;
  return {
    id: t.id,
    kind: "adhoc",
    employeeId: t.employeeId,
    employeeName: t.employee.fullName,
    assignedByName: t.assignedById ? (assigners.get(t.assignedById) ?? null) : null,
    title: t.title,
    description: t.description,
    assignedDate: toDateKey(t.assignedDate),
    dueDate: due,
    priority: t.priority,
    status: t.status,
    progress: t.progress,
    includeInEvaluation: t.includeInEvaluation,
    weight: num(t.weight),
    isOutOfPlan: t.isOutOfPlan,
    compensatesGoalId: t.compensatesGoalId,
    compensatesGoalName: t.compensatesGoal?.name ?? null,
    notes: t.notes,
    delayReason: t.delayReason,
    overdue: t.status === "DELAYED" || isOverdue(t.status, due, today),
  };
}

export async function assignerNames(rows: { assignedById: string | null }[]) {
  const ids = [...new Set(rows.map((r) => r.assignedById).filter((v): v is string => !!v))];
  if (ids.length === 0) return new Map<string, string>();
  const users = await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, employee: { select: { fullName: true } } } });
  return new Map(users.map((u) => [u.id, u.employee?.fullName ?? u.name]));
}

/** "Delayed" = explicit DELAYED status, or a passed deadline / day while still open. */
function dailyDelayedWhere(todayDate: Date): Prisma.DailyTaskWhereInput {
  return {
    OR: [
      { status: "DELAYED" },
      { deadline: { lt: todayDate }, status: { notIn: ["COMPLETED", "CANCELLED"] } },
      { source: "MANUAL", date: { lt: todayDate }, status: { in: ["NOT_STARTED", "IN_PROGRESS"] } },
    ],
  };
}

function adHocDelayedWhere(todayDate: Date): Prisma.AdHocTaskWhereInput {
  return {
    OR: [{ status: "DELAYED" }, { dueDate: { lt: todayDate }, status: { notIn: ["COMPLETED", "CANCELLED"] } }],
  };
}

const OPEN_STATUSES: TaskStatusKey[] = ["NOT_STARTED", "IN_PROGRESS", "PARTIAL", "DELAYED", "BLOCKED"];

async function currentMonthGoals(employeeIds: string[], year: number, month: number) {
  if (employeeIds.length === 0) return new Map<string, GoalOption[]>();
  const goals = await db.monthlyGoal.findMany({
    where: { employeeId: { in: employeeIds }, status: { not: "CANCELLED" }, plan: { year, month } },
    select: { id: true, name: true, unit: true, employeeId: true },
    orderBy: { sortOrder: "asc" },
  });
  const map = new Map<string, GoalOption[]>();
  for (const g of goals) {
    const list = map.get(g.employeeId) ?? [];
    list.push({ id: g.id, name: g.name, unit: g.unit });
    map.set(g.employeeId, list);
  }
  return map;
}

// ---------------------------------------------------------------------------
//  /my-tasks
// ---------------------------------------------------------------------------

export type MyTasksView = "today" | "week" | "overdue" | "all";

export async function getMyTasks(
  user: AuthUser,
  opts: { view: MyTasksView; status?: string; q?: string; skip: number; take: number },
) {
  const employeeId = user.employeeId!;
  const company = await getCompany();
  const today = todayKey(company.timezone);
  await ensureThursdayRecurringTasks(today, employeeId);
  const todayDate = fromDateKey(today);
  const weekStart = startOfWeek(today, company.weekStartDay);
  const weekEnd = addDays(weekStart, 6);
  const year = +today.slice(0, 4);
  const month = +today.slice(5, 7);

  const dailyAnd: Prisma.DailyTaskWhereInput[] = [{ employeeId }];
  const adHocAnd: Prisma.AdHocTaskWhereInput[] = [{ employeeId }];

  if (opts.view === "today") {
    dailyAnd.push({ date: todayDate });
    adHocAnd.push({ status: { in: OPEN_STATUSES } });
  } else if (opts.view === "week") {
    dailyAnd.push({ date: { gte: fromDateKey(weekStart), lte: fromDateKey(weekEnd) } });
    adHocAnd.push({ status: { in: OPEN_STATUSES } });
  } else if (opts.view === "overdue") {
    dailyAnd.push(dailyDelayedWhere(todayDate));
    adHocAnd.push(adHocDelayedWhere(todayDate));
  }

  if (opts.status === "DELAYED") {
    if (opts.view !== "overdue") {
      dailyAnd.push(dailyDelayedWhere(todayDate));
      adHocAnd.push(adHocDelayedWhere(todayDate));
    }
  } else if (opts.status) {
    dailyAnd.push({ status: opts.status as TaskStatusKey });
    adHocAnd.push({ status: opts.status as TaskStatusKey });
  }
  if (opts.q) {
    dailyAnd.push({ OR: [{ title: { contains: opts.q, mode: "insensitive" } }, { notes: { contains: opts.q, mode: "insensitive" } }] });
    adHocAnd.push({ OR: [{ title: { contains: opts.q, mode: "insensitive" } }, { description: { contains: opts.q, mode: "insensitive" } }] });
  }

  const dailyWhere: Prisma.DailyTaskWhereInput = { AND: dailyAnd };
  const adHocWhere: Prisma.AdHocTaskWhereInput = { AND: adHocAnd };
  const paginate = opts.view === "all";

  const [daily, dailyTotal, adHoc, goalsMap, counts] = await Promise.all([
    db.dailyTask.findMany({
      where: dailyWhere,
      include: dailyInclude,
      orderBy: (opts.view === "all"
        ? [{ date: "desc" }, { createdAt: "asc" }]
        : [{ date: "asc" }, { priority: "desc" }, { createdAt: "asc" }]) as Prisma.DailyTaskOrderByWithRelationInput[],
      skip: paginate ? opts.skip : 0,
      take: paginate ? opts.take : 300,
    }),
    db.dailyTask.count({ where: dailyWhere }),
    db.adHocTask.findMany({ where: adHocWhere, include: adHocInclude, orderBy: [{ dueDate: "asc" }, { assignedDate: "desc" }], take: 100 }),
    currentMonthGoals([employeeId], year, month),
    Promise.all([
      db.dailyTask.count({ where: { employeeId, date: todayDate } }),
      db.dailyTask.count({ where: { employeeId, date: { gte: fromDateKey(weekStart), lte: fromDateKey(weekEnd) } } }),
      db.dailyTask.count({ where: { AND: [{ employeeId }, dailyDelayedWhere(todayDate)] } }),
      db.adHocTask.count({ where: { AND: [{ employeeId }, adHocDelayedWhere(todayDate)] } }),
      db.adHocTask.count({ where: { employeeId, status: { in: OPEN_STATUSES } } }),
    ]),
  ]);
  const assigners = await assignerNames(adHoc);

  return {
    today,
    weekStart,
    weekEnd,
    daily: daily.map((t) => toDailyRow(t, today)),
    dailyTotal,
    adHoc: adHoc.map((t) => toAdHocRow(t, today, assigners)),
    goals: goalsMap.get(employeeId) ?? [],
    counts: { today: counts[0], week: counts[1], overdue: counts[2] + counts[3], openAdHoc: counts[4] },
  };
}

// ---------------------------------------------------------------------------
//  /tasks (manager)
// ---------------------------------------------------------------------------

export async function getScopeEmployees(user: AuthUser): Promise<EmployeeOption[]> {
  const company = await getCompany();
  const today = todayKey(company.timezone);
  const scope = employeeWhere(user);
  const employees = await db.employee.findMany({
    where: { status: { not: "TERMINATED" }, ...(scope.employeeId ? { id: scope.employeeId } : {}) },
    select: { id: true, fullName: true },
    orderBy: { fullName: "asc" },
  });
  const goals = await currentMonthGoals(
    employees.map((e) => e.id),
    +today.slice(0, 4),
    +today.slice(5, 7),
  );
  return employees.map((e) => ({ id: e.id, name: e.fullName, goals: goals.get(e.id) ?? [] }));
}

export async function getAdHocTasks(
  user: AuthUser,
  opts: { employeeId?: string; status?: string; from?: string; to?: string; q?: string; skip: number; take: number },
) {
  const company = await getCompany();
  const today = todayKey(company.timezone);
  const todayDate = fromDateKey(today);
  const and: Prisma.AdHocTaskWhereInput[] = [employeeWhere(user)];
  if (opts.employeeId) and.push({ employeeId: opts.employeeId });
  if (opts.status === "DELAYED") and.push(adHocDelayedWhere(todayDate));
  else if (opts.status) and.push({ status: opts.status as TaskStatusKey });
  if (opts.from) and.push({ assignedDate: { gte: fromDateKey(opts.from) } });
  if (opts.to) and.push({ assignedDate: { lte: fromDateKey(opts.to) } });
  if (opts.q) and.push({ title: { contains: opts.q, mode: "insensitive" } });
  const where: Prisma.AdHocTaskWhereInput = { AND: and };
  const [rows, total] = await Promise.all([
    db.adHocTask.findMany({ where, include: adHocInclude, orderBy: [{ assignedDate: "desc" }, { createdAt: "desc" }], skip: opts.skip, take: opts.take }),
    db.adHocTask.count({ where }),
  ]);
  const assigners = await assignerNames(rows);
  return { rows: rows.map((t) => toAdHocRow(t, today, assigners)), total };
}

export async function getDailyTasks(
  user: AuthUser,
  opts: { employeeId?: string; status?: string; from?: string; to?: string; q?: string; skip: number; take: number },
) {
  const company = await getCompany();
  const today = todayKey(company.timezone);
  const todayDate = fromDateKey(today);
  const and: Prisma.DailyTaskWhereInput[] = [employeeWhere(user)];
  if (opts.employeeId) and.push({ employeeId: opts.employeeId });
  if (opts.status === "DELAYED") and.push(dailyDelayedWhere(todayDate));
  else if (opts.status) and.push({ status: opts.status as TaskStatusKey });
  if (opts.from) and.push({ date: { gte: fromDateKey(opts.from) } });
  if (opts.to) and.push({ date: { lte: fromDateKey(opts.to) } });
  if (opts.q) and.push({ title: { contains: opts.q, mode: "insensitive" } });
  const where: Prisma.DailyTaskWhereInput = { AND: and };
  const [rows, total] = await Promise.all([
    db.dailyTask.findMany({ where, include: dailyInclude, orderBy: [{ date: "desc" }, { createdAt: "asc" }], skip: opts.skip, take: opts.take }),
    db.dailyTask.count({ where }),
  ]);
  return { rows: rows.map((t) => toDailyRow(t, today)), total, today };
}

export async function getTaskTabCounts(user: AuthUser) {
  const company = await getCompany();
  const todayDate = fromDateKey(todayKey(company.timezone));
  const scope = employeeWhere(user);
  const [openAdHoc, delayedAdHoc, delayedDaily] = await Promise.all([
    db.adHocTask.count({ where: { ...scope, status: { in: OPEN_STATUSES } } }),
    db.adHocTask.count({ where: { AND: [scope, adHocDelayedWhere(todayDate)] } }),
    db.dailyTask.count({ where: { AND: [scope, dailyDelayedWhere(todayDate)] } }),
  ]);
  return { openAdHoc, delayedAdHoc, delayedDaily };
}

// ---------------------------------------------------------------------------
//  Entity ownership (attachments / comments)
// ---------------------------------------------------------------------------

export type OwnedEntity =
  | "DAILY_TASK"
  | "AD_HOC_TASK"
  | "WEEKLY_REPORT"
  | "MONTHLY_REPORT"
  | "MONTHLY_GOAL"
  | "MONTHLY_PLAN"
  | "PERFORMANCE_REVIEW";

/** Employee owning an attachable / commentable entity, or null when it does not exist. */
export async function entityEmployeeId(entityType: OwnedEntity, entityId: string): Promise<string | null> {
  const select = { employeeId: true } as const;
  const where = { id: entityId };
  let row: { employeeId: string } | null = null;
  switch (entityType) {
    case "DAILY_TASK":
      row = await db.dailyTask.findUnique({ where, select });
      break;
    case "AD_HOC_TASK":
      row = await db.adHocTask.findUnique({ where, select });
      break;
    case "WEEKLY_REPORT":
      row = await db.weeklyReport.findUnique({ where, select });
      break;
    case "MONTHLY_REPORT":
      row = await db.monthlyReport.findUnique({ where, select });
      break;
    case "MONTHLY_GOAL":
      row = await db.monthlyGoal.findUnique({ where, select });
      break;
    case "MONTHLY_PLAN":
      row = await db.monthlyPlan.findUnique({ where, select });
      break;
    case "PERFORMANCE_REVIEW":
      row = await db.performanceReview.findUnique({ where, select });
      break;
  }
  return row?.employeeId ?? null;
}

export interface AttachmentRow {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  uploadedById: string;
  uploaderName: string;
  createdAt: string;
}

export async function listAttachments(entityType: Exclude<OwnedEntity, "MONTHLY_PLAN" | "PERFORMANCE_REVIEW">, entityId: string): Promise<AttachmentRow[]> {
  const rows = await db.attachment.findMany({
    where: { entityType, entityId },
    select: {
      id: true,
      fileName: true,
      mimeType: true,
      size: true,
      uploadedById: true,
      createdAt: true,
      uploadedBy: { select: { name: true, employee: { select: { fullName: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((r) => ({
    id: r.id,
    fileName: r.fileName,
    mimeType: r.mimeType,
    size: r.size,
    uploadedById: r.uploadedById,
    uploaderName: r.uploadedBy.employee?.fullName ?? r.uploadedBy.name,
    createdAt: r.createdAt.toISOString(),
  }));
}

export interface CommentRow {
  id: string;
  body: string;
  authorId: string;
  authorName: string;
  createdAt: string;
}

export async function listComments(entityType: OwnedEntity, entityId: string): Promise<CommentRow[]> {
  const rows = await db.comment.findMany({
    where: { entityType, entityId },
    select: { id: true, body: true, authorId: true, createdAt: true, author: { select: { name: true, employee: { select: { fullName: true } } } } },
    orderBy: { createdAt: "asc" },
    take: 300,
  });
  return rows.map((r) => ({
    id: r.id,
    body: r.body,
    authorId: r.authorId,
    authorName: r.author.employee?.fullName ?? r.author.name,
    createdAt: r.createdAt.toISOString(),
  }));
}
