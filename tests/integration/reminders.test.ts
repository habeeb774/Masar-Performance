/**
 * «ملاحظات وتذكيرات» against the test branch: visibility, reschedule, cancel, conversion
 * into a task only on request, audit, and no effect on tasks/performance before conversion.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import type { AuthUser } from "@/server/auth/session";
import * as reminders from "@/server/services/reminders";
import { getReminders } from "@/server/queries/reminders";
import { getCompany } from "@/server/services/company";
import { todayKey } from "@/lib/dates";

async function authUser(email: string): Promise<AuthUser> {
  const u = await db.user.findUniqueOrThrow({
    where: { email },
    include: { role: { include: { permissions: { include: { permission: true } } } }, employee: { include: { reports: true, jobTitle: true } } },
  });
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    roleKey: u.role.key,
    roleName: u.role.name,
    permissions: new Set(u.role.permissions.map((p) => p.permission.key)),
    employeeId: u.employee?.id ?? null,
    employeeName: u.employee?.fullName ?? null,
    jobTitle: u.employee?.jobTitle?.name ?? null,
    directReportIds: u.employee?.reports.map((r) => r.id) ?? [],
    sessionId: "test",
  };
}

const TAG = "[اختبار-تذكير]";
let admin: AuthUser, manager: AuthUser, employee: AuthUser;
let today: string;
const shift = (days: number) => {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const note = (title: string, remindOn: string, extra: Partial<{ employeeId: string | null; priority: "NORMAL" | "IMPORTANT"; details: string }> = {}) => ({
  title: `${TAG} ${title}`,
  details: extra.details ?? null,
  remindOn,
  priority: extra.priority ?? ("NORMAL" as const),
  employeeId: extra.employeeId ?? null,
});
const clean = async () => {
  const ids = (await db.reminder.findMany({ where: { title: { startsWith: TAG } }, select: { id: true, adHocTaskId: true } }));
  await db.reminder.deleteMany({ where: { id: { in: ids.map((r) => r.id) } } });
  await db.adHocTask.deleteMany({ where: { id: { in: ids.map((r) => r.adHocTaskId).filter((x): x is string => !!x) } } });
  await db.adHocTask.deleteMany({ where: { title: { startsWith: TAG } } });
};

beforeAll(async () => {
  [admin, manager, employee] = await Promise.all([authUser("admin@store.local"), authUser("manager@store.local"), authUser("products@store.local")]);
  today = todayKey((await getCompany()).timezone);
  await clean();
});
afterAll(clean);

const titles = (list: { title: string }[]) => list.map((r) => r.title.replace(`${TAG} `, "")).filter(Boolean);
const mine = async (user: AuthUser) => {
  const d = await getReminders(user);
  const all = [...d.overdue, ...d.today_, ...d.thisWeek, ...d.later].filter((r) => r.title.startsWith(TAG));
  return { d, all };
};

describe("reminders notebook", () => {
  let personal: string, teamNote: string, managerPrivate: string, overdue: string;

  it("creating a note touches no task, plan or evaluation data", async () => {
    const before = await Promise.all([db.adHocTask.count(), db.dailyTask.count(), db.monthlyGoal.count()]);
    personal = (await reminders.createReminder(employee, note("إضافة قسم العروض الموسمية", shift(0), { details: "فكرة لموسم الشتاء" }))).id;
    overdue = (await reminders.createReminder(employee, note("مراجعة صور قديمة", shift(-3)))).id;
    teamNote = (await reminders.createReminder(manager, note("تدريب على القوالب", shift(20), { employeeId: employee.employeeId, priority: "IMPORTANT" }))).id;
    managerPrivate = (await reminders.createReminder(manager, note("فكرة خاصة بالمدير", shift(2)))).id;
    expect(await Promise.all([db.adHocTask.count(), db.dailyTask.count(), db.monthlyGoal.count()])).toEqual(before);
    const log = await db.auditLog.findFirstOrThrow({ where: { entityId: personal, action: "reminder.create" } });
    expect(log.userId).toBe(employee.id);
  });

  it("groups by date; a passed date is only a late reminder", async () => {
    const { d } = await mine(employee);
    expect(titles(d.overdue)).toContain("مراجعة صور قديمة");
    expect(titles(d.today_)).toContain("إضافة قسم العروض الموسمية");
  });

  it("visibility: employee = own notes; manager = own + team-linked; admin = all", async () => {
    const e = titles((await mine(employee)).all);
    expect(e).toEqual(expect.arrayContaining(["إضافة قسم العروض الموسمية", "مراجعة صور قديمة"]));
    expect(e).not.toContain("تدريب على القوالب");
    expect(e).not.toContain("فكرة خاصة بالمدير");
    const m = titles((await mine(manager)).all);
    expect(m).toEqual(expect.arrayContaining(["تدريب على القوالب", "فكرة خاصة بالمدير"]));
    expect(m).not.toContain("مراجعة صور قديمة"); // personal, not linked to anyone
    expect(titles((await mine(admin)).all)).toHaveLength(4);
    await expect(reminders.cancelReminder(employee, managerPrivate)).rejects.toThrow();
  });

  it("«ذكرني مرة أخرى» moves the date and is audited", async () => {
    await reminders.rescheduleReminder(employee, overdue, shift(5));
    const r = await db.reminder.findUniqueOrThrow({ where: { id: overdue } });
    expect(r.status).toBe("POSTPONED");
    const log = await db.auditLog.findFirstOrThrow({ where: { entityId: overdue, action: "reminder.reschedule" } });
    expect(log.before).toMatchObject({ status: "OPEN" });
    expect(titles((await mine(employee)).d.overdue)).not.toContain("مراجعة صور قديمة");
  });

  it("edit is audited", async () => {
    await reminders.updateReminder(employee, personal, note("إضافة قسم العروض الموسمية للشتاء", shift(0), { details: "فكرة لموسم الشتاء" }));
    expect(await db.auditLog.count({ where: { entityId: personal, action: "reminder.update" } })).toBe(1);
  });

  it("employee converts own note into a task for themselves — not part of the evaluation", async () => {
    const task = await reminders.convertReminderToTask(employee, personal, {
      employeeId: employee.employeeId!,
      title: `${TAG} إضافة قسم العروض الموسمية للشتاء`,
      description: "فكرة لموسم الشتاء",
      assignedDate: today,
      dueDate: null,
      priority: "MEDIUM",
      includeInEvaluation: true,
      weight: 30,
      isOutOfPlan: true,
      compensatesGoalId: null,
      notes: null,
    });
    expect(task).toMatchObject({ employeeId: employee.employeeId, includeInEvaluation: false });
    expect(Number(task.weight)).toBe(0);
    const r = await db.reminder.findUniqueOrThrow({ where: { id: personal } });
    expect([r.status, r.adHocTaskId]).toEqual(["APPROVED", task.id]);
    expect(await db.auditLog.count({ where: { entityId: personal, action: "reminder.convert" } })).toBe(1);
    await expect(reminders.cancelReminder(employee, personal)).rejects.toThrow();
    const { d } = await mine(employee);
    expect(titles(d.approved)).toContain("إضافة قسم العروض الموسمية للشتاء");
  });

  it("manager converts a team note into an evaluated assignment; cancel is audited", async () => {
    const task = await reminders.convertReminderToTask(manager, teamNote, {
      employeeId: employee.employeeId!,
      title: `${TAG} تدريب على القوالب`,
      description: null,
      assignedDate: today,
      dueDate: shift(20),
      priority: "HIGH",
      includeInEvaluation: true,
      weight: 10,
      isOutOfPlan: true,
      compensatesGoalId: null,
      notes: null,
    });
    expect(task.includeInEvaluation).toBe(true);
    await reminders.cancelReminder(manager, managerPrivate);
    expect((await db.reminder.findUniqueOrThrow({ where: { id: managerPrivate } })).status).toBe("CANCELLED");
    expect(await db.auditLog.count({ where: { entityId: managerPrivate, action: "reminder.cancel" } })).toBe(1);
    expect(titles((await mine(manager)).all)).not.toContain("فكرة خاصة بالمدير");
  });
});
