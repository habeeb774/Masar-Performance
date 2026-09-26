import "server-only";
import type { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { UserError } from "@/server/action";
import { assertEmployeeAccess, type AuthUser } from "@/server/auth/session";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { fromDateKey, monthEnd, monthLabel, monthStart } from "@/lib/dates";
import { num } from "@/lib/num";
import type { teamPlanSchema } from "@/lib/validation";
import { approvePlan, createMonthlyPlan, submitPlan } from "./plans";

export interface DraftGoal {
  name: string;
  target: number;
  unit: string;
  /** a previous monthly goal or a template item whose settings (weight, Notion link…) are reused */
  sourceId: string | null;
}

/** Prefill the quick plan form: last month's goals first, else the job title's template. */
export async function teamPlanDraft(user: AuthUser, employeeId: string, year: number, month: number) {
  assertEmployeeAccess(user, employeeId);
  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  const previous = await db.monthlyPlan.findUnique({
    where: { employeeId_year_month: { employeeId, year: prevYear, month: prevMonth } },
    include: { goals: { where: { status: { not: "CANCELLED" }, isAdHoc: false }, orderBy: { sortOrder: "asc" } } },
  });
  if (previous && previous.goals.length > 0) {
    return {
      from: `نفس أهداف ${monthLabel(prevYear, prevMonth)}`,
      goals: previous.goals.map((g): DraftGoal => ({ name: g.name, target: num(g.targetValue), unit: g.unit, sourceId: `goal:${g.id}` })),
    };
  }
  const employee = await db.employee.findUniqueOrThrow({ where: { id: employeeId }, select: { jobTitleId: true } });
  const template = employee.jobTitleId
    ? await db.goalTemplate.findFirst({
        where: { jobTitleId: employee.jobTitleId, isActive: true },
        include: { items: { orderBy: { sortOrder: "asc" } } },
        orderBy: { updatedAt: "desc" },
      })
    : null;
  if (template && template.items.length > 0) {
    return {
      from: `من قالب «${template.name}»`,
      goals: template.items.map((i): DraftGoal => ({ name: i.name, target: num(i.targetValue), unit: i.unit, sourceId: `item:${i.id}` })),
    };
  }
  return { from: null, goals: [] as DraftGoal[] };
}

/** Weights stay out of the normal form: reuse known weights, give new goals the average, then scale to 100. */
export function autoWeights(known: (number | null)[]): number[] {
  if (known.length === 0) return [];
  const present = known.filter((w): w is number => w !== null && w > 0);
  const fill = present.length ? present.reduce((a, b) => a + b, 0) / present.length : 1;
  const raw = known.map((w) => (w !== null && w > 0 ? w : fill));
  const sum = raw.reduce((a, b) => a + b, 0);
  const scaled = raw.map((w) => Math.round((w / sum) * 10000) / 100);
  scaled[0] = Math.round((scaled[0] + 100 - scaled.reduce((a, b) => a + b, 0)) * 100) / 100;
  return scaled;
}

type Source = {
  description: string | null;
  goalType: string;
  weight: Prisma.Decimal;
  priority: string;
  source: string;
  category: string;
  notionFilter: Prisma.JsonValue;
  notionDataSourceId?: string | null;
};

export async function createTeamPlan(user: AuthUser, input: z.infer<typeof teamPlanSchema>) {
  if (!hasPermission(user, PERMISSIONS.PLANS_MANAGE)) throw new UserError("إعداد خطط الفريق متاح للمديرين فقط");
  const plan = await createMonthlyPlan(user, { employeeId: input.employeeId, year: input.year, month: input.month, templateId: null, useTemplate: false });

  const goalIds = input.goals.map((g) => g.sourceId?.startsWith("goal:") && g.sourceId.slice(5)).filter((v): v is string => !!v);
  const itemIds = input.goals.map((g) => g.sourceId?.startsWith("item:") && g.sourceId.slice(5)).filter((v): v is string => !!v);
  const [prevGoals, items] = await Promise.all([
    goalIds.length ? db.monthlyGoal.findMany({ where: { id: { in: goalIds }, employeeId: input.employeeId } }) : [],
    itemIds.length ? db.goalTemplateItem.findMany({ where: { id: { in: itemIds } } }) : [],
  ]);
  const sources = new Map<string, Source>([
    ...prevGoals.map((g) => [`goal:${g.id}`, g] as [string, Source]),
    ...items.map((i) => [`item:${i.id}`, i] as [string, Source]),
  ]);
  const resolved = input.goals.map((g) => (g.sourceId ? (sources.get(g.sourceId) ?? null) : null));
  const weights = autoWeights(resolved.map((s) => (s ? num(s.weight) : null)));

  const start = fromDateKey(monthStart(input.year, input.month));
  const end = fromDateKey(monthEnd(input.year, input.month));
  await db.monthlyGoal.createMany({
    data: input.goals.map((g, i) => {
      const s = resolved[i];
      const filter = s?.source === "NOTION" && s.notionFilter && typeof s.notionFilter === "object" ? (s.notionFilter as Prisma.InputJsonObject) : null;
      const notionDataSourceId = s?.source === "NOTION" ? (s.notionDataSourceId ?? (filter as { dataSourceId?: string } | null)?.dataSourceId ?? null) : null;
      const notion = !!(filter && notionDataSourceId);
      return {
        planId: plan.id,
        employeeId: input.employeeId,
        name: g.name,
        description: s?.description ?? null,
        goalType: (s && (s.goalType !== "NOTION_SYNCED" || notion) ? s.goalType : "NUMERIC") as never,
        targetValue: g.target,
        unit: g.unit,
        weight: weights[i],
        priority: (s?.priority ?? "MEDIUM") as never,
        source: (notion ? "NOTION" : s?.source === "SYSTEM" ? "SYSTEM" : "MANUAL") as never,
        category: (s?.category ?? "PRODUCTIVITY") as never,
        notionDataSourceId: notion ? notionDataSourceId : null,
        notionFilter: notion ? filter! : undefined,
        startDate: start,
        dueDate: end,
        sortOrder: i,
      };
    }),
  });
  await audit({
    user,
    action: "goal.create",
    entityType: "MonthlyPlan",
    entityId: plan.id,
    after: { via: "team-plan", goals: input.goals.map((g, i) => ({ name: g.name, target: g.target, unit: g.unit, weight: weights[i] })) },
  });

  if (hasPermission(user, PERMISSIONS.PLANS_APPROVE)) await approvePlan(user, plan.id);
  else await submitPlan(user, plan.id);
  return { planId: plan.id };
}
