/**
 * Store workflow from Notion → Masar, against the isolated test branch:
 * the real sync engine reads pages (Notion API stubbed at the HTTP layer),
 * batches/stages/history/notes are derived, and goals compute achievement.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { encryptSecret } from "@/server/crypto";
import { syncDataSource } from "@/server/notion/sync";
import { batchesForPeriod, getEmployeeBatches } from "@/server/queries/batches";
import { computeBreakdown, type EvalItem } from "@/lib/notion/progress";

const DS_NOTION_ID = "11111111-2222-3333-4444-555555555555";
const DAY = 86_400_000;
const now = Date.now();
const iso = (daysAgo: number) => new Date(now - daysAgo * DAY).toISOString();
const dateKey = (daysAgo: number) => iso(daysAgo).slice(0, 10);

type Row = { id: string; title: string; batch: number; images: string; store: string | null; note?: string; created: number; edited: number };
let rows: Row[] = [];
const page = (r: Row) => ({
  object: "page",
  id: r.id,
  created_time: iso(r.created),
  last_edited_time: iso(r.edited),
  archived: false,
  in_trash: false,
  url: `https://www.notion.so/${r.id.replace(/-/g, "")}`,
  public_url: null,
  icon: null,
  cover: null,
  parent: { type: "data_source_id", data_source_id: DS_NOTION_ID },
  created_by: { object: "user", id: "u" },
  last_edited_by: { object: "user", id: "u" },
  properties: {
    "اسم المنتج": { id: "title", type: "title", title: [{ type: "text", plain_text: r.title, text: { content: r.title, link: null }, annotations: {}, href: null }] },
    "رقم الدفعة": { id: "b", type: "number", number: r.batch },
    "اعتماد الصور": { id: "i", type: "select", select: { id: "x", name: r.images, color: "default" } },
    "الإضافة للمتجر": { id: "s", type: "select", select: r.store ? { id: "y", name: r.store, color: "default" } : null },
    "ملاحظة المدير": { id: "n", type: "rich_text", rich_text: r.note ? [{ type: "text", plain_text: r.note, text: { content: r.note, link: null }, annotations: {}, href: null }] : [] },
  },
});

const realFetch = globalThis.fetch;
let employeeId: string;
let connectionId: string;
let dataSourceId: string;

beforeAll(async () => {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.hostname !== "api.notion.com") return realFetch(input, init);
    if (url.pathname === `/v1/data_sources/${DS_NOTION_ID}/query`) {
      return new Response(JSON.stringify({ object: "list", type: "page_or_data_source", page_or_data_source: {}, results: rows.map(page), next_cursor: null, has_more: false }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ object: "error", status: 404, code: "object_not_found", message: "not stubbed" }), { status: 404, headers: { "content-type": "application/json" } });
  }) as typeof fetch;

  const emp = await db.employee.findFirstOrThrow({ where: { user: { email: "products@store.local" } } });
  employeeId = emp.id;
  await db.notionConnection.deleteMany({ where: { name: "integration-batches" } });
  const conn = await db.notionConnection.create({ data: { name: "integration-batches", tokenEncrypted: encryptSecret("ntn_stubbed_token_not_real_0000000"), tokenHint: "0000" } });
  connectionId = conn.id;
  const ds = await db.notionDataSource.create({
    data: { connectionId, name: "إضافة المنتجات (اختبار الدفعات)", notionDatabaseId: "db-batches", notionDataSourceId: DS_NOTION_ID, syncEnabled: false, defaultEmployeeId: employeeId },
  });
  dataSourceId = ds.id;
  await db.notionFieldMapping.createMany({
    data: [
      { dataSourceId, role: "TITLE", notionProperty: "اسم المنتج", notionPropertyType: "title", label: "اسم المنتج" },
      { dataSourceId, role: "BATCH", notionProperty: "رقم الدفعة", notionPropertyType: "number", label: "رقم الدفعة" },
      { dataSourceId, role: "NOTES", notionProperty: "ملاحظة المدير", notionPropertyType: "rich_text", label: "ملاحظة المدير" },
    ],
  });
  await db.notionFieldMapping.create({
    data: {
      dataSourceId,
      role: "STATUS",
      notionProperty: "اعتماد الصور",
      notionPropertyType: "select",
      stageKey: "images",
      label: "اعتماد الصور",
      statusMappings: {
        create: [
          { notionValue: "قيد العمل", systemStatus: "IN_PROGRESS" },
          { notionValue: "يحتاج إلى اعتماد", systemStatus: "PENDING_APPROVAL" },
          { notionValue: "تحتاج إلى تحسين", systemStatus: "NEEDS_REVISION" },
          { notionValue: "تم التعديل", systemStatus: "IN_PROGRESS_AFTER_REVISION" },
          { notionValue: "معتمد", systemStatus: "COMPLETED" },
        ],
      },
    },
  });
  await db.notionFieldMapping.create({
    data: {
      dataSourceId,
      role: "STATUS",
      notionProperty: "الإضافة للمتجر",
      notionPropertyType: "select",
      stageKey: "store",
      label: "الإضافة للمتجر",
      statusMappings: {
        create: [
          { notionValue: "تم الإضافة", systemStatus: "COMPLETED" },
          // the admin decided merged products are excluded from the target
          { notionValue: "تم الدمج", systemStatus: "NOT_APPLICABLE" },
        ],
      },
    },
  });

  // batch 64 (last week) and batch 65 (this week)
  rows = [
    ...Array.from({ length: 5 }, (_, i) => ({ id: `aaaaaaaa-0000-0000-0064-${String(i).padStart(12, "0")}`, title: `منتج 64-${i}`, batch: 64, images: "معتمد", store: "تم الإضافة", created: 9, edited: 8 })),
    ...Array.from({ length: 6 }, (_, i) => ({ id: `aaaaaaaa-0000-0000-0065-${String(i).padStart(12, "0")}`, title: `منتج 65-${i}`, batch: 65, images: "معتمد", store: i < 4 ? "تم الإضافة" : null, created: 3, edited: 2 })),
    { id: "aaaaaaaa-0000-0000-0065-000000000010", title: "منتج 65-10", batch: 65, images: "يحتاج إلى اعتماد", store: null, created: 3, edited: 2 },
    { id: "aaaaaaaa-0000-0000-0065-000000000011", title: "منتج 65-11", batch: 65, images: "قيد العمل", store: null, created: 3, edited: 2 },
    { id: "aaaaaaaa-0000-0000-0065-000000000012", title: "منتج 65-12 مدموج", batch: 65, images: "معتمد", store: "تم الدمج", created: 3, edited: 2 },
    { id: "aaaaaaaa-0000-0000-0065-000000000013", title: "منتج 65-13", batch: 65, images: "حالة جديدة لم تُعرّف", store: null, created: 3, edited: 2 },
  ];
});

afterAll(async () => {
  globalThis.fetch = realFetch;
  await db.notionConnection.deleteMany({ where: { id: connectionId } });
});

const items = () => db.notionSyncedItem.findMany({ where: { dataSourceId }, include: { stages: true, events: { orderBy: { occurredAt: "asc" } } } });

describe("store workflow batches from Notion", () => {
  it("recognizes batches and stages; an unknown value does not stop the sync", async () => {
    const r = await syncDataSource(dataSourceId, "FULL_RESYNC");
    expect(r.status).toBe("SUCCESS");
    const list = await items();
    expect(list).toHaveLength(15);
    const unknown = list.find((i) => i.title === "منتج 65-13")!;
    expect(unknown.stages.find((s) => s.stageKey === "images")?.systemStatus).toBe("UNMAPPED");
    expect(list.every((i) => i.batch === "64" || i.batch === "65")).toBe(true);
  });

  it("a repeated sync creates no duplicates and no new history", async () => {
    const before = await items();
    const events = before.reduce((a, i) => a + i.events.length, 0);
    await syncDataSource(dataSourceId, "MANUAL");
    await syncDataSource(dataSourceId, "FULL_RESYNC");
    const after = await items();
    expect(after).toHaveLength(15);
    expect(after.reduce((a, i) => a + i.events.length, 0)).toBe(events);
  });

  it("follows one product through the review cycle and reads the reviewer's note", async () => {
    const id = "aaaaaaaa-0000-0000-0065-000000000010";
    const step = async (images: string, store: string | null, edited: number, note?: string) => {
      rows = rows.map((r) => (r.id === id ? { ...r, images, store, edited, note } : r));
      await syncDataSource(dataSourceId, "MANUAL");
    };
    await step("تحتاج إلى تحسين", null, 1.5, "الخلفية يجب أن تكون بيضاء");
    const mid = await getEmployeeBatches(employeeId, +dateKey(0).slice(0, 4), +dateKey(0).slice(5, 7));
    expect(mid?.needsImprovement.find((p) => p.title === "منتج 65-10")?.note).toBe("الخلفية يجب أن تكون بيضاء");
    await step("تم التعديل", null, 1.2);
    await step("معتمد", null, 1);
    await step("معتمد", "تم الإضافة", 0.5);
    const p = (await items()).find((i) => i.notionPageId === id)!;
    expect(p.events.filter((e) => e.stageKey === "images").map((e) => e.toStatus)).toEqual(["PENDING_APPROVAL", "NEEDS_REVISION", "IN_PROGRESS_AFTER_REVISION", "COMPLETED"]);
    expect(p.events.find((e) => e.stageKey === "store")?.toStatus).toBe("COMPLETED");
  });

  it("summarizes batches: photos vs. store, merged excluded, two batches in the month", async () => {
    const data = await getEmployeeBatches(employeeId, +dateKey(0).slice(0, 4), +dateKey(0).slice(5, 7));
    expect(data?.current?.label).toBe("دفعة 65");
    const b65 = data!.current!;
    expect(b65.total).toBe(9);
    expect(b65.excluded).toBe(1);
    expect(b65.images.approved).toBe(7);
    expect(b65.store.added).toBe(5);
    expect(b65.readyToAdd).toBe(2);
    expect(b65.images.unknown).toBe(1);
    expect(b65.quality).toMatchObject({ approved: 7, firstPass: 6, reworked: 1, rejections: 1 });
    const period = await batchesForPeriod(employeeId, dateKey(20), dateKey(0));
    expect(period.map((b) => b.label)).toEqual(["دفعة 64", "دفعة 65"]);
  });

  it("goal achievement comes from Notion: photos = معتمد, products = تم الإضافة", async () => {
    const list = await items();
    const evalItems = (stageKey: string): EvalItem[] =>
      list.map((i) => {
        const s = i.stages.find((x) => x.stageKey === stageKey);
        return {
          id: i.id,
          batch: i.batch,
          batchNumber: i.batchNumber === null ? null : Number(i.batchNumber),
          productCode: null,
          taskType: null,
          employeeId: i.employeeId,
          itemDate: null,
          createdTime: i.createdTime.toISOString(),
          lastEditedTime: i.lastEditedTime.toISOString(),
          properties: {},
          stage: s ? { rawValues: s.rawValues, systemStatus: s.systemStatus, statusChangedAt: s.statusChangedAt.toISOString() } : null,
          revisionEvents: i.events.filter((e) => e.stageKey === stageKey && e.toStatus === "NEEDS_REVISION").map((e) => e.occurredAt.toISOString()),
        };
      });
    const batch65 = [{ field: "batch" as const, op: "eq" as const, value: 65 }];
    const photos = computeBreakdown(evalItems("images"), { stageKey: "images", completedStatuses: ["COMPLETED"], completedRawValues: [], conditions: batch65, dateBasis: "NONE", matchEmployee: false }, { start: null, end: null, employeeId: null }, 9);
    const added = computeBreakdown(evalItems("store"), { stageKey: "store", completedStatuses: ["COMPLETED"], completedRawValues: [], conditions: batch65, dateBasis: "NONE", matchEmployee: false }, { start: null, end: null, employeeId: null }, 9);
    expect(photos.completed).toBe(8); // includes the merged product whose photos were approved
    expect(added.completed).toBe(5);
    expect(added.progressPct).toBeCloseTo(55.56, 1);
    expect(photos.reworkCount).toBe(1);
  });
});
