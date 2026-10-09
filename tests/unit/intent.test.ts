import { describe, expect, it } from "vitest";
import { interpret, matchScore, nextAchieved, normalizeArabic, parseAmount } from "@/lib/intent";

const tasks = [
  { id: "add", title: "إضافة منتجات جديدة" },
  { id: "edit", title: "تعديل منتجات سابقة" },
  { id: "banners", title: "تصميم بنرات جديدة للمتجر." },
  { id: "insta", title: "ربط المنتجات بمقاطع Instagram" },
];

describe("understanding what the employee did", () => {
  it("normalizes Arabic spelling variants and digits", () => {
    expect(normalizeArabic("أضفتُ ٥ منتجاتٍ للمكتبة")).toBe("اضفت 5 منتجات للمكتبه");
  });

  it("reads quantities in digits, Arabic digits and words", () => {
    expect(parseAmount("أضفت 5 منتجات")).toBe(5);
    expect(parseAmount("أضفت ١٢ منتج")).toBe(12);
    expect(parseAmount("عدلت ثلاث منتجات")).toBe(3);
    expect(parseAmount("خلصت البنرات")).toBeNull();
  });

  it("«أضفت 5 منتجات جديدة» → add 5 to «إضافة منتجات جديدة»", () => {
    const r = interpret("أضفت 5 منتجات جديدة", tasks);
    expect(r.kind).toBe("add");
    expect(r.amount).toBe(5);
    expect(r.matches[0].candidate.id).toBe("add");
  });

  it("«عدلت 3 منتجات سابقة» → the edit task, not the add task", () => {
    const r = interpret("عدلت 3 منتجات سابقة", tasks);
    expect(r.matches[0].candidate.id).toBe("edit");
    expect(r.amount).toBe(3);
  });

  it("«خلصت البنرات» → complete the banners task", () => {
    const r = interpret("خلصت البنرات", tasks);
    expect(r.kind).toBe("complete");
    expect(r.matches[0].candidate.id).toBe("banners");
  });

  it("«ربطت 4 مقاطع انستقرام» → Instagram task", () => {
    expect(interpret("ربطت 4 مقاطع انستقرام", tasks).matches[0].candidate.id).toBe("insta");
  });

  it("«صار المجموع 12 في إضافة المنتجات» → set the total to 12", () => {
    const r = interpret("صار المجموع 12 في إضافة المنتجات", tasks);
    expect([r.kind, r.amount, r.matches[0].candidate.id]).toEqual(["set", 12, "add"]);
  });

  it("a bare number with a single task today belongs to that task", () => {
    expect(interpret("أنجزت 4", [tasks[0]]).matches.map((m) => m.candidate.id)).toEqual(["add"]);
  });

  it("nothing matching → no guess", () => {
    expect(interpret("اجتماع مع الفريق", tasks).matches).toEqual([]);
    expect(matchScore("", "إضافة منتجات")).toBe(0);
  });

  it("applying the intent: add, set, complete — never below zero", () => {
    expect(nextAchieved("add", 5, 3, 8)).toBe(8);
    expect(nextAchieved("set", 12, 3, 20)).toBe(12);
    expect(nextAchieved("complete", null, 3, 8)).toBe(8);
    expect(nextAchieved("add", -10, 3, 8)).toBe(0);
  });
});
