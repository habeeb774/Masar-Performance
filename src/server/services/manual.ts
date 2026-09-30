import "server-only";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { UserError } from "@/server/action";
import { assertEmployeeAccess, type AuthUser } from "@/server/auth/session";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { fromDateKey, todayKey } from "@/lib/dates";
import { num } from "@/lib/num";
import { getCompany } from "./company";
import { recomputePlan } from "./progress";

/**
 * Manual mode. Masar works fully without Notion: achievement can be entered by hand,
 * and a Notion-computed goal can be corrected by a manual override that keeps the
 * original Notion value and is never replaced by a sync.
 */

const RUNNING = ["APPROVED", "IN_PROGRESS"];

type GoalLike = { source: string; notionDataSourceId: string | null; notionFilter: unknown };
export const isNotionGoal = (g: GoalLike) => g.source === "NOTION" && !!g.notionDataSourceId && g.notionFilter !== null && g.notionFilter !== undefined;

const canManage = (user: AuthUser) => hasPermission(user, PERMISSIONS.PLANS_MANAGE);
export const canResolveOverrides = (user: AuthUser) => hasPermission(user, PERMISSIONS.SYSTEM_ADMIN) || hasPermission(user, PERMISSIONS.NOTION_MANAGE);

/** Notion sources whose automatic update is currently not working (last sync failed or connection lost). */
export async function unhealthySourceIds(ids?: string[]): Promise<Set<string>> {
  const sources = await db.notionDataSource.findMany({
    where: { isActive: true, ...(ids ? { id: { in: ids } } : {}) },
    select: {
      id: true,
      connection: { select: { status: true, isActive: true } },
      syncLogs: { where: { status: { not: "RUNNING" } }, orderBy: { startTime: "desc" }, take: 1, select: { status: true } },
    },
  });
  return new Set(sources.filter((s) => !s.connection.isActive || s.connection.status === "FAILED" || s.syncLogs[0]?.status === "FAILED").map((s) => s.id));
}

async function loadGoal(goalId: string) {
  const goal = await db.monthlyGoal.findUnique({ where: { id: goalId }, include: { plan: { select: { id: true, status: true, employeeId: true } } } });
  if (!goal) throw new UserError("الهدف غير موجود");
  if (goal.status === "CANCELLED") throw new UserError("هذا الهدف ملغى");
  if (!RUNNING.includes(goal.plan.status)) throw new UserError("يمكن تحديث الإنجاز بعد اعتماد الخطة");
  return goal;
}

async function weekGoalFor(goalId: string, dateKey: string) {
  const d = fromDateKey(dateKey);
  const within = await db.weeklyGoal.findFirst({ where: { monthlyGoalId: goalId, weeklyPlan: { startDate: { lte: d }, endDate: { gte: d } } } });
  if (within) return within;
  // a day outside the plan's weeks (e.g. weekend after the last week) → nearest earlier week, else the first one
  return (
    (await db.weeklyGoal.findFirst({ where: { monthlyGoalId: goalId, weeklyPlan: { startDate: { lte: d } } }, orderBy: { weeklyPlan: { startDate: "desc" } } })) ??
    (await db.weeklyGoal.findFirst({ where: { monthlyGoalId: goalId }, orderBy: { weeklyPlan: { startDate: "asc" } } }))
  );
}

/**
 * Manual goal: set the achieved total («المحقق = 85») or add to it («+ إضافة إنجاز»).
 * The difference is stored as a manual adjustment on the month and on the week of `date`,
 * so daily tasks completed later still count on top.
 */
export async function setManualAchievement(user: AuthUser, goalId: string, input: { value?: number; delta?: number; date?: string | null; note?: string | null }) {
  const goal = await loadGoal(goalId);
  assertEmployeeAccess(user, goal.employeeId);
  if (!canManage(user) && goal.employeeId !== user.employeeId) throw new UserError("لا يمكنك تحديث إنجاز هذا الهدف");
  if (isNotionGoal(goal)) throw new UserError("هذا الهدف يُحدَّث تلقائيًا من Notion — استخدم «تعديل يدوي»");
  const current = num(goal.achievedValue);
  const next = input.value !== undefined ? input.value : current + (input.delta ?? 0);
  if (!Number.isFinite(next) || next < 0) throw new UserError("أدخل رقمًا صحيحًا");
  if (goal.goalType === "BOOLEAN" && next > 1) throw new UserError("هذا الهدف إنجازه نعم / لا");
  const diff = next - current;
  if (diff === 0) return { achieved: current };

  const company = await getCompany();
  // Distributed goals must always be attributed to an explicit achievement date.
  // Silently defaulting to "today" corrupts historical weekly progress by placing
  // the whole manual adjustment in the current week.
  if (goal.distributionMode === "DISTRIBUTED" && !input.date) {
    throw new UserError("حدد تاريخ الإنجاز حتى يتم احتسابه في الأسبوع الصحيح");
  }
  const day = input.date || todayKey(company.timezone);
  const week = await weekGoalFor(goalId, day);
  await db.$transaction([
    db.monthlyGoal.update({ where: { id: goalId }, data: { manualAdjust: { increment: diff } } }),
    ...(week ? [db.weeklyGoal.update({ where: { id: week.id }, data: { manualAdjust: { increment: diff } } })] : []),
  ]);
  await audit({
    user,
    action: "goal.manual_progress",
    entityType: "MonthlyGoal",
    entityId: goalId,
    before: { achievedValue: current },
    after: { achievedValue: next, date: day },
    reason: input.note?.trim() || null,
  });
  await recomputePlan(goal.planId);
  return { achieved: next };
}

/** Notion goal: a manual override (reason required). The Notion value stays in `sourceValue`. */
export async function overrideGoal(user: AuthUser, goalId: string, value: number, reason: string) {
  const goal = await loadGoal(goalId);
  assertEmployeeAccess(user, goal.employeeId);
  if (!isNotionGoal(goal)) throw new UserError("هذا الهدف يدوي — حدّث إنجازه مباشرة");
  if (!canManage(user)) {
    // the employee may update by hand only while the automatic update is not working
    const unhealthy = await unhealthySourceIds([goal.notionDataSourceId!]);
    if (goal.employeeId !== user.employeeId || !unhealthy.size) throw new UserError("التعديل اليدوي من صلاحيات المدير");
  }
  if (!Number.isFinite(value) || value < 0) throw new UserError("أدخل رقمًا صحيحًا");
  if (!reason.trim()) throw new UserError("اكتب سبب التعديل");
  const before = { achievedValue: num(goal.achievedValue), sourceValue: goal.sourceValue === null ? null : num(goal.sourceValue), overrideValue: goal.overrideValue === null ? null : num(goal.overrideValue) };
  await db.monthlyGoal.update({
    where: { id: goalId },
    data: { overrideValue: value, overrideReason: reason.trim(), overrideById: user.id, overrideAt: new Date(), overrideKeptAt: null },
  });
  await audit({ user, action: "goal.override", entityType: "MonthlyGoal", entityId: goalId, before, after: { ...before, overrideValue: value, achievedValue: value }, reason: reason.trim() });
  await recomputePlan(goal.planId);
}

/** Admin: keep the manual override, or go back to the value from Notion. */
export async function resolveOverride(user: AuthUser, goalId: string, choice: "keep" | "notion") {
  if (!canResolveOverrides(user)) throw new UserError("حل التعارضات من صلاحيات مدير النظام");
  const goal = await db.monthlyGoal.findUnique({ where: { id: goalId } });
  if (!goal || goal.overrideValue === null) throw new UserError("لا يوجد تعديل يدوي على هذا الهدف");
  assertEmployeeAccess(user, goal.employeeId);
  const before = { overrideValue: num(goal.overrideValue), sourceValue: goal.sourceValue === null ? null : num(goal.sourceValue), overrideReason: goal.overrideReason };
  if (choice === "keep") {
    await db.monthlyGoal.update({ where: { id: goalId }, data: { overrideKeptAt: new Date() } });
  } else {
    await db.monthlyGoal.update({ where: { id: goalId }, data: { overrideValue: null, overrideReason: null, overrideById: null, overrideAt: null, overrideKeptAt: null } });
  }
  await audit({ user, action: choice === "keep" ? "goal.override_keep" : "goal.override_revert", entityType: "MonthlyGoal", entityId: goalId, before, after: choice === "keep" ? before : { overrideValue: null } });
  await recomputePlan(goal.planId);
}

/**
 * Called after a goal's source changed. Nothing entered by hand is lost:
 * - manual → Notion: if Notion disagrees with the manual value, the manual value becomes a pending override
 *   («القيمة اليدوية 24 · Notion 26» → the admin keeps one); if they agree, the goal simply turns automatic.
 * - Notion → manual: the current value carries over as the manual starting point.
 */
export async function reconcileSourceChange(user: AuthUser, goalId: string, wasNotion: boolean, previousAchieved: number) {
  const goal = await db.monthlyGoal.findUnique({ where: { id: goalId }, include: { plan: { select: { status: true } } } });
  if (!goal || !RUNNING.includes(goal.plan.status)) return;
  const nowNotion = isNotionGoal(goal);
  if (wasNotion === nowNotion) return;
  await recomputePlan(goal.planId);
  const fresh = await db.monthlyGoal.findUniqueOrThrow({ where: { id: goalId } });
  const current = num(fresh.achievedValue);
  if (nowNotion) {
    if (previousAchieved > 0 && Math.abs(current - previousAchieved) > 1e-9) {
      await db.monthlyGoal.update({
        where: { id: goalId },
        data: { overrideValue: previousAchieved, overrideReason: "قيمة يدوية قبل ربط Notion", overrideById: user.id, overrideAt: new Date(), overrideKeptAt: null },
      });
      await audit({ user, action: "goal.source_conflict", entityType: "MonthlyGoal", entityId: goalId, before: { manual: previousAchieved }, after: { notion: current } });
      await recomputePlan(goal.planId);
    }
  } else {
    await db.monthlyGoal.update({
      where: { id: goalId },
      data: { manualAdjust: { increment: previousAchieved - current }, overrideValue: null, overrideReason: null, overrideById: null, overrideAt: null, overrideKeptAt: null },
    });
    await recomputePlan(goal.planId);
  }
}

/** Goals with a manual override the admin has not reviewed yet. */
export async function pendingOverrides(user: AuthUser) {
  if (!canResolveOverrides(user)) return [];
  const rows = await db.monthlyGoal.findMany({
    where: { overrideValue: { not: null }, overrideKeptAt: null, status: { not: "CANCELLED" }, plan: { status: { in: ["APPROVED", "IN_PROGRESS"] } } },
    select: { id: true, name: true, unit: true, overrideValue: true, sourceValue: true, overrideReason: true, overrideAt: true, planId: true, employee: { select: { id: true, fullName: true } } },
    orderBy: { overrideAt: "desc" },
  });
  return rows.map((r) => ({ ...r, overrideValue: num(r.overrideValue), sourceValue: r.sourceValue === null ? null : num(r.sourceValue) }));
}

// ───────────────────────── manual batches ─────────────────────────

export interface ManualBatchInput {
  employeeId: string;
  number: number;
  total: number;
  weekStart: string;
  imagesApproved: number;
  added: number;
  needsImprovement: number;
  waiting: number;
}

function assertCanEditBatch(user: AuthUser, employeeId: string) {
  assertEmployeeAccess(user, employeeId);
  if (!canManage(user) && employeeId !== user.employeeId) throw new UserError("لا يمكنك تعديل دفعات هذا الموظف");
}

export async function saveManualBatch(user: AuthUser, input: ManualBatchInput, id?: string) {
  assertCanEditBatch(user, input.employeeId);
  const counts = [input.imagesApproved, input.added, input.needsImprovement, input.waiting];
  if (input.total <= 0 || counts.some((c) => c < 0 || c > input.total)) throw new UserError("الأعداد يجب ألا تتجاوز عدد منتجات الدفعة");
  if (input.added > input.total) throw new UserError("الأعداد يجب ألا تتجاوز عدد منتجات الدفعة");
  const data = { ...input, weekStart: fromDateKey(input.weekStart) };
  if (id) {
    const before = await db.manualBatch.findUnique({ where: { id } });
    if (!before) throw new UserError("الدفعة غير موجودة");
    assertCanEditBatch(user, before.employeeId);
    const after = await db.manualBatch.update({ where: { id }, data });
    await audit({ user, action: "batch.manual_update", entityType: "ManualBatch", entityId: id, before, after, diff: true });
    return after;
  }
  const clash = await db.manualBatch.findUnique({ where: { employeeId_number: { employeeId: input.employeeId, number: input.number } } });
  if (clash) throw new UserError(`دفعة ${input.number} موجودة بالفعل`);
  const created = await db.manualBatch.create({ data: { ...data, createdById: user.id } });
  await audit({ user, action: "batch.manual_create", entityType: "ManualBatch", entityId: created.id, after: created });
  return created;
}

export async function deleteManualBatch(user: AuthUser, id: string) {
  const before = await db.manualBatch.findUnique({ where: { id } });
  if (!before) throw new UserError("الدفعة غير موجودة");
  assertCanEditBatch(user, before.employeeId);
  await db.manualBatch.delete({ where: { id } });
  await audit({ user, action: "batch.manual_delete", entityType: "ManualBatch", entityId: id, before });
}
