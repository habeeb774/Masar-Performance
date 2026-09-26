import { describe, expect, it } from "vitest";
import { mapNotionItem, matchEmployee, type FieldMappingConfig } from "@/lib/notion/item-mapper";
import { matchPreset } from "@/lib/notion/presets";
import { normalizeProperties } from "@/lib/notion/properties";

const employees = [
  { id: "e1", fullName: "أحمد علي", notionUserId: "1d7f6e72-08fc-80f7-a98e-c402b6d9d33d", notionAlias: null },
  { id: "e2", fullName: "سارة محمد", notionUserId: null, notionAlias: "Sara" },
];

describe("matchEmployee", () => {
  it("matches Notion people by id (dash-insensitive)", () => {
    expect(matchEmployee([{ id: "1d7f6e7208fc80f7a98ec402b6d9d33d", name: "X" }], employees)).toBe("e1");
  });
  it("falls back to alias / full name", () => {
    expect(matchEmployee({ id: "zzz", name: "sara" }, employees)).toBe("e2");
    expect(matchEmployee("أحمد  علي", employees)).toBe("e1");
    expect(matchEmployee("غير معروف", employees)).toBeNull();
  });
});

describe("mapNotionItem", () => {
  const mappings: FieldMappingConfig[] = [
    { role: "TITLE", notionProperty: "المسمى في النظام", stageKey: null, ownerEmployeeId: null, statusMappings: [] },
    { role: "BATCH", notionProperty: "الدفعة", stageKey: null, ownerEmployeeId: null, statusMappings: [] },
    { role: "PRODUCT_CODE", notionProperty: "كود المنتج", stageKey: null, ownerEmployeeId: null, statusMappings: [] },
    { role: "DATE", notionProperty: "تاريخ الإضافة", stageKey: null, ownerEmployeeId: null, statusMappings: [] },
    {
      role: "STATUS",
      notionProperty: "الإضافة للمتجر",
      stageKey: "store",
      ownerEmployeeId: "e1",
      statusMappings: [
        { notionValue: "مضاف نهائي", systemStatus: "COMPLETED" },
        { notionValue: "يحتاج اضافة", systemStatus: "NOT_STARTED" },
      ],
    },
    {
      role: "STATUS",
      notionProperty: "كتابة المحتوى ",
      stageKey: "content",
      ownerEmployeeId: "e2",
      statusMappings: [
        { notionValue: "يحتاج تعديل الملاحظات", systemStatus: "NEEDS_REVISION" },
        { notionValue: "الوصف معتمد", systemStatus: "COMPLETED" },
      ],
    },
  ];

  it("maps a page using only configured mappings", () => {
    const props = normalizeProperties({
      "المسمى في النظام": { type: "title", title: [{ plain_text: "طقم اوريانت /اسود" }] },
      الدفعة: { type: "number", number: 65 },
      "كود المنتج": { type: "rich_text", rich_text: [{ plain_text: "SW-1001" }] },
      "تاريخ الإضافة": { type: "date", date: { start: "2026-09-21", end: null } },
      "الإضافة للمتجر": { type: "select", select: { name: "مضاف نهائي" } },
      "كتابة المحتوى ": { type: "multi_select", multi_select: [{ name: "يحتاج تعديل الملاحظات" }] },
    });
    const m = mapNotionItem(props, mappings, employees, { defaultEmployeeId: "e2" });
    expect(m.title).toBe("طقم اوريانت /اسود");
    expect(m.batch).toBe("65");
    expect(m.batchNumber).toBe(65);
    expect(m.productCode).toBe("SW-1001");
    expect(m.itemDate).toBe("2026-09-21");
    expect(m.employeeId).toBe("e2");
    expect(m.stages).toEqual([
      { stageKey: "store", rawValues: ["مضاف نهائي"], systemStatus: "COMPLETED" },
      { stageKey: "content", rawValues: ["يحتاج تعديل الملاحظات"], systemStatus: "NEEDS_REVISION" },
    ]);
  });

  it("falls back to the raw title when no TITLE mapping exists", () => {
    const m = mapNotionItem({}, [], employees, { fallbackTitle: "صفحة" });
    expect(m.title).toBe("صفحة");
    expect(m.stages).toEqual([]);
  });
});

describe("matchPreset (real products database schema)", () => {
  // subset of the live Notion schema, including the trailing space in "كتابة المحتوى "
  const schema = [
    { name: "المسمى في النظام", type: "title", options: [] },
    { name: "الدفعة", type: "number", options: [] },
    { name: "كود المنتج", type: "rich_text", options: [] },
    { name: "تاريخ الإضافة", type: "date", options: [] },
    {
      name: "اعتماد الصور",
      type: "select",
      options: ["تم الرفع بدون اعتماد", "معتمد", "تحتاج إلى تحسين", "تم التعديل", "معلق", "يحتاج إلى اعتماد"].map((name) => ({ name })),
    },
    {
      name: "كتابة المحتوى ",
      type: "multi_select",
      options: ["تم كتابة الوصف الفني", "تم كتابة المحتوى الأولي", "يحتاج تعديل الملاحظات", "تم تعديل الملاحظات", "الوصف معتمد", "تمت الإضافة للمتجر"].map((name) => ({ name })),
    },
  ];
  it("matches fields whitespace-insensitively and keeps exact Notion names", () => {
    const matched = matchPreset(schema);
    const content = matched.find((m) => m.stageKey === "content")!;
    expect(content.notionProperty).toBe("كتابة المحتوى ");
    expect(content.statuses?.length).toBe(6);
    const images = matched.find((m) => m.stageKey === "images")!;
    expect(images.statuses?.find((s) => s.value === "معلق")?.status).toBe("BLOCKED");
    expect(images.statuses?.find((s) => s.value === "تم التعديل")?.status).toBe("IN_PROGRESS_AFTER_REVISION");
    expect(matched.map((m) => m.role)).toEqual(expect.arrayContaining(["TITLE", "BATCH", "PRODUCT_CODE", "DATE", "STATUS"]));
  });
  it("skips fields absent from the schema", () => {
    expect(matchPreset(schema).some((m) => m.stageKey === "seo")).toBe(false);
  });
});
