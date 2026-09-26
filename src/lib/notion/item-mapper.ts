import type { NormalizedValue } from "./properties";
import { valueToDateKey, valueToNumber, valueToPeople, valueToStrings } from "./properties";
import { buildStatusLookup, resolveSystemStatus, type StatusMappingRule, type SystemStatus } from "./status";

export type FieldRole = "TITLE" | "STATUS" | "DATE" | "BATCH" | "PRODUCT_CODE" | "EMPLOYEE" | "TASK_TYPE" | "TEXT" | "NUMBER";

export interface FieldMappingConfig {
  role: FieldRole;
  notionProperty: string;
  stageKey: string | null;
  ownerEmployeeId: string | null;
  statusMappings: StatusMappingRule[];
}

export interface EmployeeIdentity {
  id: string;
  fullName: string;
  notionUserId: string | null;
  notionAlias: string | null;
}

export interface MappedItem {
  title: string;
  batch: string | null;
  batchNumber: number | null;
  productCode: string | null;
  taskType: string | null;
  itemDate: string | null;
  employeeId: string | null;
  stages: { stageKey: string; rawValues: string[]; systemStatus: SystemStatus }[];
}

const clean = (s: string) => s.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();

export function matchEmployee(value: NormalizedValue | undefined, employees: EmployeeIdentity[]): string | null {
  const people = valueToPeople(value);
  for (const p of people) {
    const byId = employees.find((e) => e.notionUserId && e.notionUserId.replace(/-/g, "") === p.id.replace(/-/g, ""));
    if (byId) return byId.id;
  }
  const names = [...people.map((p) => p.name ?? ""), ...(people.length ? [] : valueToStrings(value))].filter(Boolean).map(clean);
  for (const n of names) {
    const hit = employees.find(
      (e) => (e.notionAlias && clean(e.notionAlias) === n) || clean(e.fullName) === n,
    );
    if (hit) return hit.id;
  }
  return null;
}

function findTitle(properties: Record<string, NormalizedValue>, titleProp: string | undefined): string {
  if (titleProp) {
    const v = valueToStrings(properties[titleProp])[0];
    if (v) return v;
  }
  return "";
}

/**
 * Pure mapping of a normalized Notion page into the system representation,
 * driven entirely by the admin-configured field & status mappings.
 */
export function mapNotionItem(
  properties: Record<string, NormalizedValue>,
  mappings: FieldMappingConfig[],
  employees: EmployeeIdentity[],
  opts: { fallbackTitle?: string; defaultEmployeeId?: string | null } = {},
): MappedItem {
  const byRole = (role: FieldRole) => mappings.find((m) => m.role === role);
  const title = findTitle(properties, byRole("TITLE")?.notionProperty) || opts.fallbackTitle || "بدون عنوان";

  const batchProp = byRole("BATCH")?.notionProperty;
  const batchValue = batchProp ? properties[batchProp] : undefined;
  const batch = valueToStrings(batchValue)[0] ?? null;
  const batchNumber = valueToNumber(batchValue ?? undefined);

  const codeProp = byRole("PRODUCT_CODE")?.notionProperty;
  const typeProp = byRole("TASK_TYPE")?.notionProperty;
  const dateProp = byRole("DATE")?.notionProperty;
  const empProp = byRole("EMPLOYEE")?.notionProperty;

  const employeeId = (empProp ? matchEmployee(properties[empProp], employees) : null) ?? opts.defaultEmployeeId ?? null;

  const stages = mappings
    .filter((m) => m.role === "STATUS" && m.stageKey)
    .map((m) => {
      const rawValues = valueToStrings(properties[m.notionProperty]);
      return {
        stageKey: m.stageKey as string,
        rawValues,
        systemStatus: resolveSystemStatus(rawValues, buildStatusLookup(m.statusMappings)),
      };
    });

  return {
    title,
    batch,
    batchNumber,
    productCode: codeProp ? (valueToStrings(properties[codeProp])[0] ?? null) : null,
    taskType: typeProp ? (valueToStrings(properties[typeProp])[0] ?? null) : null,
    itemDate: dateProp ? valueToDateKey(properties[dateProp]) : null,
    employeeId,
    stages,
  };
}

/** Title of a page when no TITLE mapping exists: first title-typed property. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function rawTitle(rawProperties: Record<string, any>): string {
  for (const p of Object.values(rawProperties ?? {})) {
    if (p?.type === "title") return (p.title ?? []).map((t: { plain_text?: string }) => t.plain_text ?? "").join("").trim();
  }
  return "";
}
