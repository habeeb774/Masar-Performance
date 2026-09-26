import { describe, expect, it } from "vitest";
import { normalizeLabel, pickDatabase, stageKeyFor, suggestMappings, suggestStatus, unresolvedCount, type SchemaInput } from "@/lib/notion/auto-map";

const sel = (name: string, values: string[], type = "select"): SchemaInput => ({ name, type, options: values.map((v) => ({ name: v })) });

describe("normalizeLabel", () => {
  it("folds Arabic letter variants, diacritics and case", () => {
    expect(normalizeLabel("  مُكتملة ")).toBe("مكتمله");
    expect(normalizeLabel("إضافة")).toBe(normalizeLabel("اضافه"));
    expect(normalizeLabel("In-Progress")).toBe("in progress");
  });
});

describe("suggestStatus", () => {
  it.each([
    ["Done", "COMPLETED"],
    ["Completed", "COMPLETED"],
    ["مكتمل", "COMPLETED"],
    ["تم", "COMPLETED"],
    ["Doing", "IN_PROGRESS"],
    ["In progress", "IN_PROGRESS"],
    ["جاري العمل", "IN_PROGRESS"],
    ["قيد التنفيذ", "IN_PROGRESS"],
    ["بانتظار المراجعة", "PENDING_APPROVAL"],
    ["Review", "PENDING_APPROVAL"],
    ["لم يبدأ", "NOT_STARTED"],
    ["جديد", "NOT_STARTED"],
    ["Not started", "NOT_STARTED"],
  ])("maps %s exactly", (value, status) => {
    expect(suggestStatus(value)).toEqual({ status, confidence: "auto" });
  });

  it("uses keywords for longer phrasings and never treats «لم يتم» as done", () => {
    expect(suggestStatus("لم يتم الاضافة").status).toBe("NOT_STARTED");
    expect(suggestStatus("تم رفع الصور").status).toBe("COMPLETED");
    expect(suggestStatus("غير معتمد نهائيًا").status).toBe("CANCELLED");
    expect(suggestStatus("يحتاج تعديل الملاحظات").status).toBe("NEEDS_REVISION");
    expect(suggestStatus("تم تعديل الملاحظات").status).toBe("IN_PROGRESS_AFTER_REVISION");
    expect(suggestStatus("تم رفع الصور").confidence).toBe("suggested");
  });

  it("falls back to the Notion status group, then unknown", () => {
    expect(suggestStatus("Shipped 🚀", "complete")).toEqual({ status: "COMPLETED", confidence: "suggested" });
    expect(suggestStatus("أزرق")).toEqual({ status: null, confidence: "unknown" });
  });
});

describe("suggestMappings", () => {
  const schema: SchemaInput[] = [
    { name: "Name", type: "title", options: [] },
    { name: "كود المنتج", type: "rich_text", options: [] },
    { name: "SKU", type: "rich_text", options: [] },
    { name: "تاريخ الإضافة", type: "date", options: [] },
    sel("حالة الصور", ["لم يبدأ", "جاري العمل", "مكتمل"], "status"),
    sel("SEO Status", ["Not started", "Done"]),
    sel("Content Status", ["Doing", "Something odd"]),
    sel("اللون", ["أحمر", "أزرق"]),
    { name: "ملاحظات", type: "rich_text", options: [] },
  ];
  const result = suggestMappings(schema, { "Content Status": { Doing: 4, "Legacy value": 1 } });
  const by = (p: string) => result.find((r) => r.property === p)!;

  it("keeps Notion's property order", () => {
    expect(result.map((r) => r.property)).toEqual(schema.map((s) => s.name));
  });

  it("auto-maps title, product code and date — single-use roles only once", () => {
    expect(by("Name")).toMatchObject({ role: "TITLE", confidence: "auto" });
    expect(by("كود المنتج")).toMatchObject({ role: "PRODUCT_CODE", confidence: "auto" });
    expect(by("SKU").role).toBeNull();
    expect(by("تاريخ الإضافة")).toMatchObject({ role: "DATE", confidence: "auto" });
  });

  it("generates stage keys and confidence from option values", () => {
    expect(by("حالة الصور")).toMatchObject({ role: "STATUS", stageKey: "images", confidence: "auto" });
    expect(by("SEO Status")).toMatchObject({ role: "STATUS", stageKey: "seo", confidence: "auto" });
    expect(by("Content Status")).toMatchObject({ role: "STATUS", stageKey: "content", confidence: "suggested" });
  });

  it("includes values observed in real items that are not defined options", () => {
    const content = by("Content Status");
    expect(content.statuses.map((s) => s.value)).toContain("Legacy value");
    expect(content.statuses.find((s) => s.value === "Doing")?.count).toBe(4);
  });

  it("asks the user only about ambiguous fields", () => {
    expect(by("اللون")).toMatchObject({ role: null, confidence: "unknown" });
    expect(by("ملاحظات")).toMatchObject({ role: null, confidence: "auto" });
    // «اللون» + «Something odd» + «Legacy value»
    expect(unresolvedCount(result)).toBe(3);
  });

  it("applies the store preset exactly when its property names are present", () => {
    const r = suggestMappings([sel("الإضافة للمتجر", ["يحتاج اضافة", "مضاف مسبقاً", "تم الإضافة"])]);
    expect(r[0]).toMatchObject({ role: "STATUS", stageKey: "store", confidence: "auto" });
    expect(r[0].statuses.find((s) => s.value === "مضاف مسبقاً")?.status).toBe("NOT_APPLICABLE");
  });

  it("never duplicates a stage key", () => {
    const r = suggestMappings([sel("حالة الصور", ["تم"]), sel("اعتماد الصور", ["معتمد"])]);
    expect(new Set(r.map((f) => f.stageKey)).size).toBe(2);
  });
});

describe("stageKeyFor", () => {
  it("derives a unique key from the label without user typing", () => {
    expect(stageKeyFor("مراجعة الجودة", [])).toBe("review");
    expect(stageKeyFor("مراجعة نهائية", ["review"])).toBe("review2");
    expect(stageKeyFor("شيء آخر", ["stage"])).toBe("stage2");
  });
});

describe("pickDatabase", () => {
  const db = (name: string, addedId: string | null = null) => ({ name, addedId });
  it("takes the only new database", () => {
    expect(pickDatabase([db("A", "x"), db("Roadmap")])?.name).toBe("Roadmap");
  });
  it("takes a clearly stronger match", () => {
    expect(pickDatabase([db("إضافة المنتجات للمتجر"), db("Meeting notes"), db("الإجازات")])?.name).toBe("إضافة المنتجات للمتجر");
    expect(pickDatabase([db("Products"), db("Content Calendar")])?.name).toBe("Products");
  });
  it("asks when it's a tie or nothing matches", () => {
    expect(pickDatabase([db("Content Calendar"), db("مهام التصميم")])).toBeNull();
    expect(pickDatabase([db("Wiki"), db("Notes")])).toBeNull();
    expect(pickDatabase([db("A", "x")])).toBeNull();
  });
});
