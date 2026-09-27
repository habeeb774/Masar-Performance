import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import type { AuthUser } from "@/server/auth/session";
import { employeeIdScope, employeeWhere } from "@/server/auth/session";
import { toDateKey } from "@/lib/dates";
import { num } from "@/lib/num";
import { ensureDueReports } from "@/server/services/reports";
import { contentProgress } from "./reports";
import { getBatchReviewQueue } from "./batches";

export { getBatchReviewQueue };

export const REVIEW_TABS = ["batches", "weekly", "monthly", "plans", "pending", "images", "content", "revision"] as const;
export type ReviewTab = (typeof REVIEW_TABS)[number];

export const NOTION_PAGE_SIZE = 50;

const IMAGE_STAGES = ["images", "productImage"];
const CONTENT_STAGES = ["content", "description"];

/** Notion item scope: items owned by visible employees, plus unattributed items. */
function itemScope(user: AuthUser): Prisma.NotionSyncedItemWhereInput {
  const scope = employeeIdScope(user);
  return scope === "ALL"
    ? { isArchived: false }
    : {
        isArchived: false,
        OR: [{ employeeId: null }, { employeeId: { in: scope } }],
      };
}

function stageWhere(user: AuthUser, tab: "pending" | "images" | "content" | "revision"): Prisma.NotionItemStageWhereInput {
  const item = itemScope(user);
  switch (tab) {
    case "pending":
      return { systemStatus: "PENDING_APPROVAL", item };
    case "images":
      return {
        systemStatus: "PENDING_APPROVAL",
        stageKey: { in: IMAGE_STAGES },
        item,
      };
    case "content":
      return {
        systemStatus: "PENDING_APPROVAL",
        stageKey: { in: CONTENT_STAGES },
        item,
      };
    case "revision":
      return { systemStatus: "NEEDS_REVISION", item };
  }
}

/** Make sure every ended week / due month of the team has its draft report (bounded, idempotent). */
export function ensureTeamReports(user: AuthUser) {
  return ensureDueReports({
    employeeIds: employeeIdScope(user),
    notify: true,
    limit: 20,
  });
}

export async function getReviewCenterCounts(user: AuthUser) {
  const scope = employeeWhere(user);
  const [batchQueue, weekly, monthly, plans, variance, pending, images, content, revision] = await Promise.all([
    getBatchReviewQueue(user).catch(() => []),
    db.weeklyReport.count({
      where: { ...scope, status: { in: ["SUBMITTED", "REVIEWED"] } },
    }),
    db.monthlyReport.count({
      where: { ...scope, status: { in: ["SUBMITTED", "REVIEWED"] } },
    }),
    db.monthlyPlan.count({ where: { ...scope, status: "SUBMITTED" } }),
    db.weeklyPlan.groupBy({
      by: ["monthlyPlanId"],
      where: { ...scope, status: "PENDING_APPROVAL" },
    }),
    db.notionItemStage.count({ where: stageWhere(user, "pending") }),
    db.notionItemStage.count({ where: stageWhere(user, "images") }),
    db.notionItemStage.count({ where: stageWhere(user, "content") }),
    db.notionItemStage.count({ where: stageWhere(user, "revision") }),
  ]);
  return {
    batches: batchQueue.reduce((n, g) => n + g.waiting.length + g.edited.length, 0),
    weekly,
    monthly,
    plans: plans + variance.length,
    pending,
    images,
    content,
    revision,
  } satisfies Record<ReviewTab, number>;
}

export async function getWeeklyReportsQueue(user: AuthUser) {
  const rows = await db.weeklyReport.findMany({
    where: {
      ...employeeWhere(user),
      status: { in: ["SUBMITTED", "REVIEWED"] },
    },
    include: {
      employee: {
        select: {
          id: true,
          fullName: true,
          jobTitle: { select: { name: true } },
        },
      },
      weeklyPlan: { select: { weekIndex: true } },
    },
    orderBy: [{ status: "asc" }, { submittedAt: "asc" }],
    take: 200,
  });
  return rows.map((r) => ({
    id: r.id,
    employeeId: r.employee.id,
    employee: r.employee.fullName,
    jobTitle: r.employee.jobTitle?.name ?? null,
    weekIndex: r.weeklyPlan.weekIndex,
    weekStart: toDateKey(r.weekStart),
    weekEnd: toDateKey(r.weekEnd),
    status: r.status,
    submittedAt: r.submittedAt,
    progress: contentProgress(r.content),
    hasBlockers: !!r.blockers,
    commented: r.status === "REVIEWED" && !!r.managerComment,
  }));
}

export async function getMonthlyReportsQueue(user: AuthUser) {
  const rows = await db.monthlyReport.findMany({
    where: {
      ...employeeWhere(user),
      status: { in: ["SUBMITTED", "REVIEWED"] },
    },
    include: {
      employee: {
        select: {
          id: true,
          fullName: true,
          jobTitle: { select: { name: true } },
        },
      },
    },
    orderBy: [{ status: "asc" }, { submittedAt: "asc" }],
    take: 200,
  });
  return rows.map((r) => ({
    id: r.id,
    employeeId: r.employee.id,
    employee: r.employee.fullName,
    jobTitle: r.employee.jobTitle?.name ?? null,
    year: r.year,
    month: r.month,
    status: r.status,
    submittedAt: r.submittedAt,
    progress: contentProgress(r.content),
    commented: r.status === "REVIEWED" && !!r.managerNotes,
  }));
}

export async function getPlansQueue(user: AuthUser) {
  const scope = employeeWhere(user);
  const [plans, weeks] = await Promise.all([
    db.monthlyPlan.findMany({
      where: { ...scope, status: "SUBMITTED" },
      include: {
        employee: {
          select: {
            id: true,
            fullName: true,
            jobTitle: { select: { name: true } },
          },
        },
        goals: { select: { weight: true, status: true } },
      },
      orderBy: { submittedAt: "asc" },
      take: 200,
    }),
    db.weeklyPlan.findMany({
      where: { ...scope, status: "PENDING_APPROVAL" },
      include: {
        employee: { select: { id: true, fullName: true } },
        monthlyPlan: { select: { id: true, year: true, month: true } },
      },
      orderBy: [{ monthlyPlanId: "asc" }, { weekIndex: "asc" }],
      take: 300,
    }),
  ]);
  const variance = new Map<
    string,
    {
      planId: string;
      employeeId: string;
      employee: string;
      year: number;
      month: number;
      weeks: number[];
      note: string | null;
      updatedAt: Date;
    }
  >();
  for (const w of weeks) {
    const cur = variance.get(w.monthlyPlanId) ?? {
      planId: w.monthlyPlanId,
      employeeId: w.employee.id,
      employee: w.employee.fullName,
      year: w.monthlyPlan.year,
      month: w.monthlyPlan.month,
      weeks: [],
      note: null,
      updatedAt: w.updatedAt,
    };
    cur.weeks.push(w.weekIndex);
    cur.note ??= w.varianceNote;
    if (w.updatedAt > cur.updatedAt) cur.updatedAt = w.updatedAt;
    variance.set(w.monthlyPlanId, cur);
  }
  return {
    plans: plans.map((p) => ({
      id: p.id,
      employeeId: p.employee.id,
      employee: p.employee.fullName,
      jobTitle: p.employee.jobTitle?.name ?? null,
      year: p.year,
      month: p.month,
      goals: p.goals.filter((g) => g.status !== "CANCELLED").length,
      totalWeight: p.goals.filter((g) => g.status !== "CANCELLED").reduce((a, g) => a + num(g.weight), 0),
      submittedAt: p.submittedAt,
    })),
    variance: [...variance.values()],
  };
}

export async function getNotionQueue(user: AuthUser, tab: "pending" | "images" | "content" | "revision", page: number) {
  const where = stageWhere(user, tab);
  const [total, rows] = await Promise.all([
    db.notionItemStage.count({ where }),
    db.notionItemStage.findMany({
      where,
      include: {
        item: {
          select: {
            id: true,
            title: true,
            url: true,
            batch: true,
            productCode: true,
            dataSourceId: true,
            dataSource: { select: { name: true } },
            employee: { select: { id: true, fullName: true } },
          },
        },
      },
      orderBy: { statusChangedAt: "asc" },
      skip: (page - 1) * NOTION_PAGE_SIZE,
      take: NOTION_PAGE_SIZE,
    }),
  ]);
  const mappings = rows.length
    ? await db.notionFieldMapping.findMany({
        where: {
          role: "STATUS",
          dataSourceId: {
            in: [...new Set(rows.map((r) => r.item.dataSourceId))],
          },
        },
        select: {
          dataSourceId: true,
          stageKey: true,
          label: true,
          ownerEmployee: { select: { fullName: true } },
        },
      })
    : [];
  const mappingOf = (dataSourceId: string, stageKey: string) => mappings.find((m) => m.dataSourceId === dataSourceId && m.stageKey === stageKey);

  const items = rows.map((r) => {
    const m = mappingOf(r.item.dataSourceId, r.stageKey);
    return {
      id: r.id,
      stageKey: r.stageKey,
      stageLabel: m?.label ?? r.stageKey,
      status: r.systemStatus,
      rawValues: r.rawValues,
      since: r.statusChangedAt,
      title: r.item.title,
      url: r.item.url,
      batch: r.item.batch,
      productCode: r.item.productCode,
      dataSource: r.item.dataSource.name,
      employee: r.item.employee?.fullName ?? m?.ownerEmployee?.fullName ?? null,
    };
  });
  const groups = new Map<string, { label: string; items: typeof items }>();
  for (const it of items) {
    const g = groups.get(it.stageLabel) ?? { label: it.stageLabel, items: [] };
    g.items.push(it);
    groups.set(it.stageLabel, g);
  }
  return {
    total,
    page,
    pageSize: NOTION_PAGE_SIZE,
    groups: [...groups.values()],
  };
}
