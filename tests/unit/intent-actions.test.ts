import { describe, expect, it } from "vitest";
import { matchIntentActions } from "@/lib/intent-actions";
import { PERMISSIONS } from "@/lib/permissions";

const manager = new Set<string>([
  PERMISSIONS.PLANS_MANAGE, PERMISSIONS.TASKS_ASSIGN, PERMISSIONS.PERFORMANCE_REVIEW, PERMISSIONS.PERFORMANCE_APPROVE,
  PERMISSIONS.REPORTS_REVIEW, PERMISSIONS.REVIEW_CENTER, PERMISSIONS.EMPLOYEES_VIEW_ALL,
]);
const employee = new Set<string>([PERMISSIONS.PERFORMANCE_VIEW_OWN]);
const ids = (q: string, perms: Set<string>, hasEmployee: boolean) => matchIntentActions(q, perms, hasEmployee).map((a) => a.id);

describe("what does the user want to do?", () => {
  it("manager: «خطة جديدة» → new plan", () => expect(ids("خطة جديدة", manager, false)[0]).toBe("new-plan"));
  it("manager: «اعتماد تقييم الشهر» → approve evaluations", () => expect(ids("اعتماد تقييم الشهر", manager, false)[0]).toBe("approve-evaluations"));
  it("manager: «تصدير اكسل» / «ملف الموارد البشرية» → HR export", () => {
    expect(ids("تصدير اكسل", manager, false)[0]).toBe("hr-export");
    expect(ids("ملف الموارد البشرية", manager, false)[0]).toBe("hr-export");
  });
  it("manager: «كلف موظف بمهمة» → assign a task", () => expect(ids("كلف موظف بمهمة", manager, false)[0]).toBe("assign-task"));
  it("manager: «مين متأخر» → team", () => expect(ids("مين متأخر", manager, false)).toContain("team"));
  it("employee: «سجل انجاز» → log work; «تقريري» → my report; «تقييمي» → my evaluation", () => {
    expect(ids("سجل انجاز", employee, true)[0]).toBe("log-work");
    expect(ids("تقريري", employee, true)[0]).toBe("my-report");
    expect(ids("تقييمي", employee, true)[0]).toBe("my-performance");
  });
  it("never offers what the user is not allowed to do", () => {
    expect(ids("خطة جديدة", employee, true)).not.toContain("new-plan");
    expect(ids("تصدير اكسل", employee, true)).toEqual([]);
    expect(ids("سجل انجاز", manager, false)).not.toContain("log-work");
  });
  it("unrelated words → nothing", () => expect(ids("سيارة حمراء", manager, true)).toEqual([]));
});
