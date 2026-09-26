import { describe, expect, it } from "vitest";
import { buildStatusLookup, resolveSystemStatus } from "@/lib/notion/status";
import { normalizeProperties, valueToStrings } from "@/lib/notion/properties";
import { computeBreakdown, type EvalItem } from "@/lib/notion/progress";
import { notionFilterRuleSchema } from "@/lib/notion/filter-rule";

const imagesLookup = buildStatusLookup([
  { notionValue: "معتمد", systemStatus: "COMPLETED" },
  { notionValue: "يحتاج إلى اعتماد", systemStatus: "PENDING_APPROVAL" },
  { notionValue: "تم الرفع بدون اعتماد", systemStatus: "PENDING_APPROVAL" },
  { notionValue: "تحتاج إلى تحسين", systemStatus: "NEEDS_REVISION" },
  { notionValue: "معلق", systemStatus: "BLOCKED" },
  { notionValue: "تم التعديل", systemStatus: "IN_PROGRESS_AFTER_REVISION" },
]);

describe("status mapping", () => {
  it("maps configured Notion values to system statuses", () => {
    expect(resolveSystemStatus(["معتمد"], imagesLookup)).toBe("COMPLETED");
    expect(resolveSystemStatus(["معلق"], imagesLookup)).toBe("BLOCKED");
    expect(resolveSystemStatus(["تم التعديل"], imagesLookup)).toBe("IN_PROGRESS_AFTER_REVISION");
  });
  it("returns NOT_STARTED for empty and UNMAPPED for unknown values", () => {
    expect(resolveSystemStatus([], imagesLookup)).toBe("NOT_STARTED");
    expect(resolveSystemStatus(["قيمة جديدة"], imagesLookup)).toBe("UNMAPPED");
  });
  it("normalizes whitespace", () => {
    expect(resolveSystemStatus(["  معتمد "], imagesLookup)).toBe("COMPLETED");
  });
  it("picks the most advanced value in multi-selects", () => {
    const content = buildStatusLookup([
      { notionValue: "تم كتابة المحتوى الأولي", systemStatus: "PENDING_APPROVAL" },
      { notionValue: "يحتاج تعديل الملاحظات", systemStatus: "NEEDS_REVISION" },
      { notionValue: "تم تعديل الملاحظات", systemStatus: "IN_PROGRESS_AFTER_REVISION" },
      { notionValue: "الوصف معتمد", systemStatus: "COMPLETED" },
    ]);
    expect(resolveSystemStatus(["تم كتابة المحتوى الأولي", "يحتاج تعديل الملاحظات"], content)).toBe("NEEDS_REVISION");
    expect(resolveSystemStatus(["يحتاج تعديل الملاحظات", "تم تعديل الملاحظات"], content)).toBe("IN_PROGRESS_AFTER_REVISION");
    expect(resolveSystemStatus(["تم تعديل الملاحظات", "الوصف معتمد"], content)).toBe("COMPLETED");
  });
  it("honours explicit precedence", () => {
    const l = buildStatusLookup([
      { notionValue: "A", systemStatus: "COMPLETED", precedence: 1 },
      { notionValue: "B", systemStatus: "NEEDS_REVISION", precedence: 99 },
    ]);
    expect(resolveSystemStatus(["A", "B"], l)).toBe("NEEDS_REVISION");
  });
});

describe("property normalization", () => {
  it("normalizes common Notion property types", () => {
    const n = normalizeProperties({
      "المسمى في النظام": { type: "title", title: [{ plain_text: "ماسورة " }, { plain_text: "دش" }] },
      الدفعة: { type: "number", number: 65 },
      "اعتماد الصور": { type: "select", select: { name: "معتمد" } },
      "كتابة المحتوى ": { type: "multi_select", multi_select: [{ name: "الوصف معتمد" }] },
      "تاريخ الإضافة": { type: "date", date: { start: "2026-09-20", end: null } },
      Archive: { type: "checkbox", checkbox: false },
      "صاحب الاقتراح": { type: "created_by", created_by: { id: "u1", name: "Ali" } },
    });
    expect(n["المسمى في النظام"]).toBe("ماسورة دش");
    expect(n["الدفعة"]).toBe(65);
    expect(valueToStrings(n["كتابة المحتوى "])).toEqual(["الوصف معتمد"]);
    expect(n["تاريخ الإضافة"]).toEqual({ start: "2026-09-20", end: null });
    expect(valueToStrings(n["صاحب الاقتراح"])).toEqual(["Ali"]);
  });
});

let seq = 0;
function item(p: Partial<EvalItem> & { status?: EvalItem["stage"] }): EvalItem {
  const { status, ...rest } = p;
  return {
    id: `i${seq++}`,
    batch: "65",
    batchNumber: 65,
    productCode: null,
    taskType: null,
    employeeId: "e1",
    itemDate: null,
    createdTime: "2026-09-01T08:00:00Z",
    lastEditedTime: "2026-09-21T08:00:00Z",
    properties: {},
    stage: status ?? null,
    revisionEvents: [],
    ...rest,
  };
}

type Stage = NonNullable<EvalItem["stage"]>;
const st = (systemStatus: Stage["systemStatus"], day = "2026-09-22", raw: string[] = []): Stage => ({
  systemStatus,
  rawValues: raw,
  statusChangedAt: `${day}T09:00:00Z`,
});

describe("computeBreakdown", () => {
  const rule = notionFilterRuleSchema.parse({
    stageKey: "store",
    conditions: [{ field: "batch", op: "eq", value: 65 }],
    dateBasis: "STAGE_CHANGED",
  });

  it("reproduces the spec example (target 25 from batch 65)", () => {
    const items: EvalItem[] = [
      ...Array.from({ length: 15 }, () => item({ status: st("COMPLETED") })),
      ...Array.from({ length: 4 }, () => item({ status: st("PENDING_APPROVAL") })),
      ...Array.from({ length: 2 }, () => item({ status: st("NEEDS_REVISION") })),
      item({ batch: "64", batchNumber: 64, status: st("COMPLETED") }),
      item({ status: st("COMPLETED", "2026-09-10") }), // outside the week
    ];
    const b = computeBreakdown(items, rule, { start: "2026-09-19", end: "2026-09-25", employeeId: "e1" }, 25);
    expect(b.worked).toBe(21);
    expect(b.completed).toBe(15);
    expect(b.pendingApproval).toBe(4);
    expect(b.needsRevision).toBe(2);
    expect(b.remaining).toBe(10);
    expect(b.progressPct).toBe(60);
  });

  it("honours explicit completed raw values", () => {
    const raw = notionFilterRuleSchema.parse({
      stageKey: "store",
      completedRawValues: ["تم الإضافة", "مضاف نهائي"],
      dateBasis: "NONE",
    });
    const items = [
      item({ status: st("COMPLETED", "2026-09-22", ["مضاف نهائي"]) }),
      item({ status: st("COMPLETED", "2026-09-22", ["مضاف مسبقاً"]) }),
    ];
    const b = computeBreakdown(items, raw, { start: null, end: null, employeeId: null }, 2);
    expect(b.completed).toBe(1);
  });

  it("filters by employee when requested", () => {
    const r = { ...rule, matchEmployee: true, dateBasis: "NONE" as const };
    const items = [item({ status: st("COMPLETED") }), item({ employeeId: "e2", status: st("COMPLETED") })];
    expect(computeBreakdown(items, r, { start: null, end: null, employeeId: "e1" }, 10).completed).toBe(1);
  });

  it("computes quality separately from volume", () => {
    const r = { ...rule, conditions: [], dateBasis: "NONE" as const };
    const items = [
      ...Array.from({ length: 95 }, () => item({ status: st("COMPLETED") })),
      ...Array.from({ length: 5 }, () => item({ status: st("NEEDS_REVISION") })),
    ];
    const b = computeBreakdown(items, r, { start: null, end: null, employeeId: null }, 100);
    expect(b.worked).toBe(100);
    expect(b.approvalRate).toBe(95);
    expect(b.revisionRate).toBe(5);
  });

  it("counts rework events inside the period", () => {
    const items = [
      item({ status: st("COMPLETED"), revisionEvents: ["2026-09-20T10:00:00Z"] }),
      item({ status: st("COMPLETED"), revisionEvents: ["2026-08-01T10:00:00Z"] }),
    ];
    const b = computeBreakdown(items, rule, { start: "2026-09-19", end: "2026-09-25", employeeId: null }, 2);
    expect(b.reworkCount).toBe(1);
  });

  it("supports numeric range conditions", () => {
    const r = notionFilterRuleSchema.parse({ stageKey: "store", dateBasis: "NONE", conditions: [{ field: "batch", op: "gte", value: 60 }] });
    const items = [item({ batchNumber: 59, batch: "59", status: st("COMPLETED") }), item({ status: st("COMPLETED") })];
    expect(computeBreakdown(items, r, { start: null, end: null, employeeId: null }, 1).completed).toBe(1);
  });
});
