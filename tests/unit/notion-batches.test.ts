import { describe, expect, it } from "vitest";
import { batchPace, itemQuality, manualBatchSummary, mergeManualBatches, pct, resolveCycleStages, summarizeBatches, type CycleItem, type StageEvent } from "@/lib/notion/batches";
import type { SystemStatus } from "@/lib/notion/status";

const NOW = new Date("2026-09-24T12:00:00Z");
const ago = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();
let seq = 0;
const item = (batch: number | null, images: SystemStatus | null, store: SystemStatus | null, opts: Partial<CycleItem> & { changed?: number; events?: [SystemStatus, number][] } = {}): CycleItem => ({
  id: `p${++seq}`,
  title: `منتج ${seq}`,
  url: null,
  batch: batch === null ? null : String(batch),
  batchNumber: batch,
  createdTime: opts.createdTime ?? "2026-09-21T08:00:00Z",
  itemDate: null,
  employeeId: null,
  images: images ? { status: images, changedAt: ago(opts.changed ?? 0) } : null,
  store: store ? { status: store, changedAt: ago(opts.changed ?? 0) } : null,
  imageEvents: (opts.events ?? []).map(([toStatus, d]): StageEvent => ({ toStatus, occurredAt: ago(d) })),
  note: opts.note ?? null,
});

describe("image approval cycle quality", () => {
  it("approved at the first review", () => {
    expect(itemQuality([{ toStatus: "PENDING_APPROVAL", occurredAt: ago(3) }, { toStatus: "COMPLETED", occurredAt: ago(2) }])).toEqual({
      submissions: 1,
      rejections: 0,
      firstRequestAt: ago(3),
      lastApprovedAt: ago(2),
      firstPass: true,
    });
  });
  it("needs improvement → edited → approved", () => {
    const q = itemQuality([
      { toStatus: "IN_PROGRESS", occurredAt: ago(5) },
      { toStatus: "PENDING_APPROVAL", occurredAt: ago(4) },
      { toStatus: "NEEDS_REVISION", occurredAt: ago(3.5) },
      { toStatus: "IN_PROGRESS_AFTER_REVISION", occurredAt: ago(3) },
      { toStatus: "COMPLETED", occurredAt: ago(2) },
    ]);
    expect(q).toMatchObject({ submissions: 2, rejections: 1, firstPass: false, firstRequestAt: ago(4), lastApprovedAt: ago(2) });
  });
  it("still waiting → first-pass unknown", () => {
    expect(itemQuality([{ toStatus: "PENDING_APPROVAL", occurredAt: ago(1) }]).firstPass).toBeNull();
  });
});

describe("summarizeBatches", () => {
  const items = [
    // batch 65: 40 products
    ...Array.from({ length: 24 }, () => item(65, "COMPLETED", "COMPLETED", { events: [["PENDING_APPROVAL", 4], ["COMPLETED", 3]] })),
    ...Array.from({ length: 6 }, () => item(65, "COMPLETED", "NOT_STARTED", { changed: 3, events: [["PENDING_APPROVAL", 5], ["NEEDS_REVISION", 4], ["IN_PROGRESS_AFTER_REVISION", 3.5], ["COMPLETED", 3]] })),
    ...Array.from({ length: 4 }, () => item(65, "NEEDS_REVISION", null, { changed: 2, note: "الخلفية غير بيضاء" })),
    ...Array.from({ length: 3 }, () => item(65, "PENDING_APPROVAL", null, { changed: 3 })),
    ...Array.from({ length: 2 }, () => item(65, "IN_PROGRESS_AFTER_REVISION", null, { changed: 0.5 })),
    item(65, "IN_PROGRESS", null),
    // merged into an earlier product (admin mapped it to NOT_APPLICABLE) → not counted, not late
    item(65, "COMPLETED", "NOT_APPLICABLE", { changed: 5 }),
    // an unknown store value never stops the batch
    item(65, "COMPLETED", "UNMAPPED"),
    // an older batch in the same month and a row without a batch
    ...Array.from({ length: 5 }, () => item(64, "COMPLETED", "COMPLETED", { createdTime: "2026-09-14T08:00:00Z" })),
    item(null, "COMPLETED", "COMPLETED"),
  ];
  const [b65, b64] = summarizeBatches(items, NOW);

  it("groups by batch, newest first, skipping rows without a batch", () => {
    expect([b65.label, b64.label]).toEqual(["دفعة 65", "دفعة 64"]);
    expect(b64.total).toBe(5);
  });

  it("keeps the two stages separate: photos approved vs. added to the store", () => {
    expect(b65.total).toBe(41);
    expect(b65.excluded).toBe(1);
    expect(b65.images).toMatchObject({ approved: 31, waiting: 3, edited: 2, needsImprovement: 4, inProgress: 1 });
    expect(b65.store.added).toBe(24);
    expect(b65.readyToAdd).toBe(7);
    expect(pct(b65.images.approved, b65.total)).toBe(75.6);
    expect(pct(b65.store.added, b65.total)).toBe(58.5);
  });

  it("flags only real bottlenecks", () => {
    expect(b65.stale).toEqual({ waitingTooLong: 3, improvementNotDone: 4, approvedNotAdded: 6 });
    expect(b64.stale).toEqual({ waitingTooLong: 0, improvementNotDone: 0, approvedNotAdded: 0 });
  });

  it("derives quality from the review history", () => {
    expect(b65.quality).toMatchObject({ approved: 30, firstPass: 24, reworked: 6, rejections: 6, firstPassRate: 80 });
  });

  it("anchors each batch in its week", () => {
    expect(b65.anchorDate).toBe("2026-09-21");
    expect(b64.anchorDate).toBe("2026-09-14");
  });

  it("re-summarizing the same data is stable (no duplication)", () => {
    expect(summarizeBatches(items, NOW)).toEqual(summarizeBatches([...items], NOW));
  });
});

describe("resolveCycleStages", () => {
  it("prefers the standard keys, falls back to labels", () => {
    expect(resolveCycleStages([{ stageKey: "images", label: "x" }, { stageKey: "store", label: "y" }])).toEqual({ images: "images", store: "store" });
    expect(resolveCycleStages([{ stageKey: "stage", label: "حالة الصور" }, { stageKey: "stage2", label: "الإضافة للمتجر" }])).toEqual({ images: "stage", store: "stage2" });
  });
});

describe("batchPace", () => {
  const [b] = summarizeBatches([...Array.from({ length: 10 }, () => item(70, "COMPLETED", "COMPLETED")), ...Array.from({ length: 30 }, () => item(70, "IN_PROGRESS", null))], NOW);
  it("compares additions with the elapsed share of the week", () => {
    expect(batchPace(b, "2026-09-21", "2026-09-25", "2026-09-21")).toBe("ahead");
    expect(batchPace(b, "2026-09-21", "2026-09-25", "2026-09-25")).toBe("behind");
  });
});

describe("manual batches (no Notion)", () => {
  const m = manualBatchSummary({ id: "mb1", number: 65, total: 40, weekStart: "2026-09-21", imagesApproved: 30, added: 24, needsImprovement: 4, waiting: 6 });
  it("maps the entered numbers to the same batch summary", () => {
    expect(m).toMatchObject({ label: "دفعة 65", total: 40, store: { added: 24 }, readyToAdd: 6, anchorDate: "2026-09-21" });
    expect(m.images).toMatchObject({ approved: 30, needsImprovement: 4, waiting: 6, inProgress: 0 });
    expect(m.stale).toEqual({ waitingTooLong: 0, improvementNotDone: 0, approvedNotAdded: 0 });
  });
  it("a Notion batch with the same number wins; otherwise both are listed, newest first", () => {
    const [notion] = summarizeBatches([item(65, "COMPLETED", "COMPLETED")], NOW);
    expect(mergeManualBatches([notion], [m])).toEqual([notion]);
    const m66 = manualBatchSummary({ id: "mb2", number: 66, total: 10, weekStart: "2026-09-28", imagesApproved: 0, added: 0, needsImprovement: 0, waiting: 0 });
    expect(mergeManualBatches([notion], [m66]).map((b) => b.label)).toEqual(["دفعة 66", "دفعة 65"]);
  });
});
