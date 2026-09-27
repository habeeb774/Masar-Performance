import type { NotionFilterRule } from "@/lib/notion/filter-rule";
import type { ProgressBreakdown } from "@/lib/notion/progress";
import type { z } from "zod";
import type { goalTemplateSchema } from "@/lib/validation";

export type TemplateFormInput = z.input<typeof goalTemplateSchema>;
export type TemplateItemInput = TemplateFormInput["items"][number];

/** Serializable description of a Notion data source for the rule builder. */
export interface NotionSourceOption {
  id: string;
  name: string;
  isActive: boolean;
  /** STATUS field mappings (workflow stages) */
  stages: { stageKey: string; label: string; rawValues: string[] }[];
  /** properties from the cached Notion schema */
  properties: { name: string; type: string; options: string[] }[];
}

/** Inclusive DateKey range used by "اختبار القاعدة". */
export interface TestPeriod {
  start: string;
  end: string;
  label: string;
}

export const EMPTY_RULE: NotionFilterRule = {
  stageKey: "",
  completedStatuses: ["COMPLETED"],
  completedRawValues: [],
  conditions: [],
  dateBasis: "STAGE_CHANGED",
  matchEmployee: false,
};

/** Fill defaults for a rule coming from JSON / partial form input. */
export function normalizeRule(value: unknown): NotionFilterRule | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Partial<NotionFilterRule>;
  return {
    stageKey: typeof v.stageKey === "string" ? v.stageKey : "",
    completedStatuses: Array.isArray(v.completedStatuses) ? v.completedStatuses : ["COMPLETED"],
    completedRawValues: Array.isArray(v.completedRawValues) ? v.completedRawValues : [],
    conditions: Array.isArray(v.conditions) ? v.conditions : [],
    dateBasis: v.dateBasis ?? "STAGE_CHANGED",
    matchEmployee: !!v.matchEmployee,
  };
}

/** Read a cached breakdown JSON safely. */
export function readBreakdown(value: unknown): ProgressBreakdown | null {
  if (!value || typeof value !== "object") return null;
  const b = value as Partial<ProgressBreakdown>;
  if (typeof b.completed !== "number" && typeof b.worked !== "number") return null;
  const n = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : 0);
  const r = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : null);
  return {
    target: n(b.target),
    matched: n(b.matched),
    worked: n(b.worked),
    completed: n(b.completed),
    pendingApproval: n(b.pendingApproval),
    needsRevision: n(b.needsRevision),
    inProgress: n(b.inProgress),
    blocked: n(b.blocked),
    notStarted: n(b.notStarted),
    remaining: n(b.remaining),
    reworkCount: n(b.reworkCount),
    progressPct: n(b.progressPct),
    approvalRate: r(b.approvalRate),
    revisionRate: r(b.revisionRate),
  };
}

export const newTemplateItem = (): TemplateItemInput => ({
  name: "",
  dutyName: "",
  description: "",
  goalType: "NUMERIC",
  targetValue: 0,
  unit: "عنصر",
  weight: 0,
  priority: "MEDIUM",
  source: "MANUAL",
  category: "PRODUCTIVITY",
  notionDataSourceId: null,
  notionFilter: null,
});
