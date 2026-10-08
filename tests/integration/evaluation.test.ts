/**
 * The official monthly evaluation against the test DB (DATABASE_URL_TEST):
 * built from the template + plan + ad-hoc tasks, edited by the manager with audit,
 * validated on approval, and reproducing the manager's July sheet (96 → ممتاز).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import type { AuthUser } from "@/server/auth/session";
import * as plans from "@/server/services/plans";
import * as manual from "@/server/services/manual";
import * as ev from "@/server/services/evaluation";
import { num } from "@/lib/num";
import { toDateKey } from "@/lib/dates";
import ExcelJS from "exceljs";
import { buildEmployeePerformanceFile } from "@/server/export/performance-report";

const Y = 2035;
const M = 7;

async function authUser(email: string): Promise<AuthUser> {
  const u = await db.user.findUniqueOrThrow({
    where: { email },
    include: { role: { include: { permissions: { include: { permission: true } } } }, employee: { include: { reports: true, jobTitle: true } } },
  });
  return {
    id: u.id, email: u.email, name: u.name, roleKey: u.role.key, roleName: u.role.name,
    permissions: new Set(u.role.permissions.map((p) => p.permission.key)),
    employeeId: u.employee?.id ?? null, employeeName: u.employee?.fullName ?? null, jobTitle: u.employee?.jobTitle?.name ?? null,
    directReportIds: u.employee?.reports.map((r) => r.id) ?? [], sessionId: "test",
  };
}
const goal = (name: string, target: number, weight: number) => ({
  name, description: null, goalType: "NUMERIC" as const, targetValue: target, unit: "منتج", weight, priority: "HIGH" as const,
  source: "MANUAL" as const, category: "PRODUCTIVITY" as const, notionDataSourceId: null, notionFilter: null, startDate: null, dueDate: null,
});

let admin: AuthUser, manager: AuthUser, employee: AuthUser, emp: string;
let planId: string, evaluationId: string;
const adHocIds: string[] = [];

const load = async () => (await ev.getEvaluation(evaluationId))!;
const duty = async (n: number) => (await load()).duties[n];

async function cleanup() {
  await db.performanceEvaluation.deleteMany({ where: { employeeId: emp, year: Y } });
  await db.monthlyPlan.deleteMany({ where: { employeeId: emp, year: Y } });
  await db.adHocTask.deleteMany({ where: { employeeId: emp, title: { startsWith: "[eval-test]" } } });
}

beforeAll(async () => {
  [admin, manager, employee] = await Promise.all([authUser("admin@store.local"), authUser("manager@store.local"), authUser("products@store.local")]);
  emp = employee.employeeId!;
  await cleanup();
  const plan = await plans.createMonthlyPlan(manager, { employeeId: emp, year: Y, month: M, templateId: null, useTemplate: false, executionStartDate: `${Y}-07-01`, weeksCount: 4 });
  planId = plan.id;
  await plans.addGoal(manager, planId, goal("إضافة منتجات جديدة", 160, 40));
  await plans.addGoal(manager, planId, goal("ربط المنتجات بمقاطع Instagram", 6, 20));
  await plans.addGoal(manager, planId, goal("تصميم صور لمقالات وتعديلها على المتجر.", 5, 20));
  await plans.addGoal(manager, planId, goal("تصميم بنرات جديدة للمتجر.", 3, 20));
  await plans.approvePlan(manager, planId, "معتمد");
  const add = (await db.monthlyGoal.findFirstOrThrow({ where: { planId, name: "إضافة منتجات جديدة" } })).id;
  await manual.setManualAchievement(manager, add, { value: 141, date: `${Y}-07-08` });

  // ad-hoc tasks: two count in the evaluation, one does not
  const weights = [60, 40];
  for (const [n, w] of weights.entries()) {
    const t = await db.adHocTask.create({ data: { employeeId: emp, title: `[eval-test] مهمة ${n + 1}`, assignedDate: new Date(`${Y}-07-10T00:00:00Z`), includeInEvaluation: true, weight: w, status: n === 0 ? "COMPLETED" : "IN_PROGRESS" } });
    adHocIds.push(t.id);
  }
  await db.adHocTask.create({ data: { employeeId: emp, title: "[eval-test] خارج التقييم", assignedDate: new Date(`${Y}-07-11T00:00:00Z`), includeInEvaluation: false, weight: 0 } });
});
afterAll(cleanup);

describe("building an evaluation", () => {
  it("creates the 4 official duties (20 / 25 / 20 / 35) for the plan's execution period", async () => {
    evaluationId = (await ev.createEvaluation(manager, emp, Y, M)).id;
    const e = await load();
    expect(e.duties.map((d) => [d.kind, num(d.weight)])).toEqual([["COMMITMENT", 20], ["GOALS", 25], ["GOALS", 20], ["AD_HOC", 35]]);
    expect([toDateKey(e.periodStart), toDateKey(e.periodEnd)]).toEqual([`${Y}-07-01`, `${Y}-07-28`]);
    expect(e.monthlyPlanId).toBe(planId);
    // creating again returns the same evaluation
    expect((await ev.createEvaluation(manager, emp, Y, M)).id).toBe(evaluationId);
  });

  it("duty 2 / 3 indicators are fed by the matching plan goals; plan goals are not modified", async () => {
    const d2 = await duty(1);
    expect(d2.indicators.map((i) => [i.sourceType, num(i.achieved), num(i.target), num(i.weight)])).toEqual([["MONTHLY_GOAL", 141, 160, 100]]);
    expect(num(d2.score)).toBe(88.125);
    const d3 = await duty(2);
    expect(d3.indicators.map((i) => [num(i.target), num(i.weight)])).toEqual([[6, 100], [5, 0], [3, 0]]);
    expect(num((await db.monthlyGoal.findFirstOrThrow({ where: { planId, name: "إضافة منتجات جديدة" } })).achievedValue)).toBe(141);
  });

  it("case 9: ad-hoc tasks marked «تدخل في التقييم» appear in duty 4 with their weight", async () => {
    const d4 = await duty(3);
    expect(d4.indicators.map((i) => [i.sourceId, num(i.achieved), num(i.target), num(i.weight)])).toEqual([[adHocIds[0], 1, 1, 60], [adHocIds[1], 0, 1, 40]]);
    expect(num(d4.score)).toBe(60);
    // a task completed later is picked up by a refresh
    await db.adHocTask.update({ where: { id: adHocIds[1] }, data: { status: "COMPLETED" } });
    await ev.refreshEvaluation(manager, evaluationId);
    expect(num((await duty(3)).score)).toBe(100);
  });
});

describe("manager edits, audit and approval", () => {
  it("case 10: a manual change is audited (before / after / reason) and survives a refresh", async () => {
    const ind = (await duty(1)).indicators[0];
    await ev.updateIndicator(manager, ind.id, { achieved: 150 }, "تصحيح عدد المنتجات بعد المراجعة");
    const log = await db.auditLog.findFirstOrThrow({ where: { entityId: ind.id, action: "evaluation.indicator.update" }, orderBy: { createdAt: "desc" } });
    expect(log).toMatchObject({ userId: manager.id, reason: "تصحيح عدد المنتجات بعد المراجعة" });
    // audit stores Decimal values as strings
    expect(Number((log.before as { achieved: unknown }).achieved)).toBe(141);
    expect(Number((log.after as { achieved: unknown }).achieved)).toBe(150);
    await ev.refreshEvaluation(manager, evaluationId);
    const after = (await duty(1)).indicators[0];
    expect([num(after.achieved), after.isOverridden]).toEqual([150, true]);
    await ev.resetIndicator(manager, ind.id);
    expect(num((await duty(1)).indicators[0].achieved)).toBe(141);
  });

  it("duty weights must total 100% before approval; the error is clear Arabic", async () => {
    const d3 = await duty(2);
    await ev.updateDuty(manager, d3.id, { weight: 30 }, "تجربة");
    await expect(ev.approveEvaluation(admin, evaluationId)).rejects.toThrow("مجموع أوزان الواجبات 110% ويجب أن يساوي 100%");
    expect(await db.auditLog.count({ where: { entityId: d3.id, action: "evaluation.duty.update" } })).toBe(1);
    await ev.updateDuty(manager, d3.id, { weight: 20 }, "إرجاع");
  });

  it("keeps official template KPI weights after a manager overrides target or achieved values", async () => {
    const d3 = await duty(2);
    expect(d3.indicators.map((i) => num(i.weight))).toEqual([100, 0, 0]);
    const first = d3.indicators[0];
    await ev.updateIndicator(manager, first.id, { target: 29, achieved: 29 }, "مطابقة تقييم المدير");
    const after = await duty(2);
    expect(after.indicators.map((i) => num(i.weight))).toEqual([100, 0, 0]);
    expect([num(after.indicators[0].achieved), num(after.indicators[0].target)]).toEqual([29, 29]);
  });

  it("changing a target requires a reason and writes it into the KPI notes", async () => {
    const ind = (await duty(1)).indicators[0];
    await expect(ev.updateIndicator(manager, ind.id, { target: 120 }, null)).rejects.toThrow("سبب تعديل المستهدف مطلوب");
    await ev.updateIndicator(manager, ind.id, { target: 120 }, "تم تخفيض المستهدف لعدم توفر منتجات مناسبة");
    const updated = (await duty(1)).indicators[0];
    expect(num(updated.target)).toBe(120);
    expect(updated.notes).toContain("تم تخفيض المستهدف لعدم توفر منتجات مناسبة");
    await ev.resetIndicator(manager, ind.id);
  });

  it("the final-score override needs a reason and is audited", async () => {
    await expect(ev.overrideFinalScore(manager, evaluationId, 90, " ")).rejects.toThrow();
    await ev.overrideFinalScore(manager, evaluationId, 90, "قرار الإدارة");
    expect(num((await load()).finalScore)).toBe(90);
    expect(await db.auditLog.count({ where: { entityId: evaluationId, action: "evaluation.final_override" } })).toBe(1);
    await ev.overrideFinalScore(manager, evaluationId, null, "إلغاء التعديل");
  });
});

describe("reference: the manager's July 2026 sheet entered through the service", () => {
  it("duties 80 / 100 / 100 / 100 → final 96 → ممتاز, then approved", { timeout: 480_000 }, async () => {
    const set = async (d: number, values: [number, number, number][]) => {
      const inds = (await duty(d)).indicators;
      for (const [k, [achieved, target, weight]] of values.entries()) await ev.updateIndicator(manager, inds[k].id, { achieved, target, weight }, "مطابقة تقييم يوليو");
    };
    await set(0, [[3, 5, 25], [4, 4, 25], [4, 4, 25], [3, 5, 25]]);
    await set(1, [[100, 100, 100]]);
    await set(2, [[1, 1, 100], [0, 5, 0], [0, 3, 0]]);
    // duty 4 of the sheet: six tasks 15 / 15 / 25 / 15 / 15 / 15, all done
    const d4 = await duty(3);
    for (const ind of d4.indicators) await ev.removeIndicator(manager, ind.id, "استبدال بمهام شهر يوليو");
    for (const w of [15, 15, 25, 15, 15, 15]) await ev.addIndicator(manager, d4.id, { title: `مهمة ${w}`, achieved: 1, target: 1, weight: w });

    const e = await load();
    expect(e.duties.map((d) => num(d.score))).toEqual([80, 100, 100, 100]);
    expect(e.result.duties.map((d) => d.rate)).toEqual([16, 25, 20, 35]);
    expect(num(e.finalScore)).toBe(96);
    expect(e.ratingLabel).toBe("ممتاز");
    expect(e.validation).toEqual([]);

    await ev.approveEvaluation(admin, evaluationId);
    expect((await load()).status).toBe("APPROVED");
    await expect(ev.updateDuty(manager, d4.id, { weight: 10 }, "x")).rejects.toThrow("التقييم معتمد");
  });

  it("the HR workbook is built from the approved evaluation: same final score and rating", async () => {
    const file = await buildEmployeePerformanceFile(emp, Y, M);
    expect(file.finalScore).toBe(96);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(file.buffer as unknown as ArrayBuffer);
    const ws = wb.worksheets[1];
    const cells: { addr: string; v: ExcelJS.CellValue }[] = [];
    ws.eachRow((row) => row.eachCell((c) => cells.push({ addr: c.address, v: c.value })));
    const result = (v: ExcelJS.CellValue) => (v && typeof v === "object" && "result" in v ? v.result : v);
    const totalRow = cells.find((c) => c.addr.startsWith("B") && c.v === "النتيجة النهائية")!.addr.slice(1);
    expect(result(ws.getCell(`J${totalRow}`).value)).toBe(96);
    expect(result(ws.getCell(`H${+totalRow + 1}`).value)).toBe("ممتاز");
    // no cached error values anywhere (zero-weight / zero-target rows included)
    expect(cells.filter((c) => String(result(c.v)).startsWith("#"))).toEqual([]);
    // approved: no draft banner
    expect(ws.getCell("B2").value).not.toBe("مسودة — التقييم لم يُعتمد بعد");
  });
});
