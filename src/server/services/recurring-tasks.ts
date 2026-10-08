import "server-only";
import { db } from "@/server/db";
import { addDays, fromDateKey, toDateKey, type DateKey } from "@/lib/dates";
import { num } from "@/lib/num";

const THURSDAY = 4;
const HISTORY_DAYS = 120;

const RULES = [
  {
    title: "رفع المنتجات المعدلة إلى سلة",
    matches: (value: string) => {
      const s = normalizeTitle(value);
      return s.includes("رفع المنتجات المعدله") && s.includes("سله");
    },
  },
  {
    title: "إضافة المنتجات الجديدة إلى سلة",
    matches: (value: string) => {
      const s = normalizeTitle(value);
      return (s.includes("اضافه المنتجات الجديده") || s.includes("اضافة المنتجات الجديده")) && s.includes("سله");
    },
  },
] as const;

function normalizeTitle(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("ar")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[ـ،,:؛.\-_()[\]{}]/g, " ")
    .replace(/\s+/g, " ");
}

function isThursday(day: DateKey) {
  return new Date(`${day}T00:00:00.000Z`).getUTCDay() === THURSDAY;
}

function ruleIndex(title: string) {
  return RULES.findIndex((rule) => rule.matches(title));
}

/**
 * Ensure the two weekly store-operation tasks exist every Thursday.
 *
 * Ownership is learned from task history instead of hard-coding an employee ID:
 * an employee who has used one of these tasks keeps receiving that same task on
 * Thursdays. The operation is idempotent, and opening «مهامي» also invokes it,
 * so a missed cron run self-heals immediately.
 */
export async function ensureThursdayRecurringTasks(today: DateKey, employeeId?: string) {
  if (!isThursday(today)) return 0;

  const todayDate = fromDateKey(today);
  const historyStart = fromDateKey(addDays(today, -HISTORY_DAYS));

  const history = await db.dailyTask.findMany({
    where: {
      ...(employeeId ? { employeeId } : {}),
      date: { gte: historyStart, lte: todayDate },
    },
    select: {
      id: true,
      employeeId: true,
      title: true,
      description: true,
      target: true,
      priority: true,
      createdById: true,
      monthlyGoal: { select: { name: true } },
      date: true,
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: employeeId ? 200 : 1000,
  });

  const templates = new Map<string, (typeof history)[number]>();
  for (const task of history) {
    const index = ruleIndex(task.title);
    if (index < 0) continue;
    const key = `${task.employeeId}:${index}`;
    if (!templates.has(key)) templates.set(key, task);
  }
  if (templates.size === 0) return 0;

  const employees = [...new Set([...templates.values()].map((task) => task.employeeId))];
  const todayRows = await db.dailyTask.findMany({
    where: { employeeId: { in: employees }, date: todayDate },
    select: { employeeId: true, title: true },
  });
  const existing = new Set(
    todayRows
      .map((task) => {
        const index = ruleIndex(task.title);
        return index < 0 ? null : `${task.employeeId}:${index}`;
      })
      .filter((value): value is string => !!value),
  );

  const plans = await db.monthlyPlan.findMany({
    where: {
      employeeId: { in: employees },
      status: { in: ["APPROVED", "IN_PROGRESS"] },
      executionStartDate: { lte: todayDate },
      executionEndDate: { gte: todayDate },
    },
    select: {
      employeeId: true,
      goals: {
        select: {
          id: true,
          name: true,
          weeklyGoals: {
            where: { weeklyPlan: { startDate: { lte: todayDate }, endDate: { gte: todayDate } } },
            select: { id: true },
            take: 1,
          },
        },
      },
    },
  });
  const planByEmployee = new Map(plans.map((plan) => [plan.employeeId, plan]));

  let created = 0;
  for (const [key, template] of templates) {
    if (existing.has(key)) continue;
    const index = Number(key.slice(key.lastIndexOf(":") + 1));
    const rule = RULES[index];
    if (!rule) continue;

    const plan = planByEmployee.get(template.employeeId);
    const goalName = template.monthlyGoal?.name ?? null;
    const currentGoal = goalName ? plan?.goals.find((goal) => goal.name === goalName) : null;

    await db.dailyTask.create({
      data: {
        employeeId: template.employeeId,
        monthlyGoalId: currentGoal?.id ?? null,
        weeklyGoalId: currentGoal?.weeklyGoals[0]?.id ?? null,
        title: rule.title,
        description: template.description,
        date: todayDate,
        target: Math.max(num(template.target), 1),
        achieved: 0,
        progress: 0,
        status: "NOT_STARTED",
        source: "MANUAL",
        priority: template.priority,
        createdById: template.createdById,
      },
    });
    existing.add(key);
    created++;
  }

  return created;
}
