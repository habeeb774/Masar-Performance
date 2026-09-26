"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { runAction, UserError } from "@/server/action";
import { actionPermission, actionUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { randomToken } from "@/server/crypto";
import { PERMISSIONS } from "@/lib/permissions";
import { fromDateKey } from "@/lib/dates";
import {
  changePasswordSchema,
  companySchema,
  departmentSchema,
  employeeSchema,
  goalTemplateSchema,
  idSchema,
  jobTitleSchema,
  roleSchema,
} from "@/lib/validation";

const refresh = () => revalidatePath("/", "layout");

// ---- company ----------------------------------------------------------------------

export async function saveCompanyAction(input: z.input<typeof companySchema>) {
  return runAction(async () => {
    const user = await actionPermission(PERMISSIONS.ORG_MANAGE);
    const data = companySchema.parse(input);
    const before = await db.company.findFirst();
    const after = before ? await db.company.update({ where: { id: before.id }, data }) : await db.company.create({ data });
    await audit({ user, action: "company.update", entityType: "Company", entityId: after.id, before, after, diff: true });
    refresh();
  }, "تم حفظ إعدادات الشركة");
}

// ---- departments --------------------------------------------------------------------

export async function saveDepartmentAction(id: string | null, input: z.input<typeof departmentSchema>) {
  return runAction(async () => {
    const user = await actionPermission(PERMISSIONS.ORG_MANAGE);
    const data = departmentSchema.parse(input);
    if (id && data.parentId === id) throw new UserError("لا يمكن أن تكون الإدارة تابعة لنفسها");
    const company = await db.company.findFirstOrThrow();
    if (id) {
      const before = await db.department.findUniqueOrThrow({ where: { id } });
      const after = await db.department.update({ where: { id }, data });
      await audit({ user, action: "department.update", entityType: "Department", entityId: id, before, after, diff: true });
    } else {
      const created = await db.department.create({ data: { ...data, companyId: company.id } });
      await audit({ user, action: "department.create", entityType: "Department", entityId: created.id, after: data });
    }
    refresh();
  }, "تم الحفظ");
}

export async function deleteDepartmentAction(id: string) {
  return runAction(async () => {
    const user = await actionPermission(PERMISSIONS.ORG_MANAGE);
    const dep = await db.department.findUniqueOrThrow({ where: { id: idSchema.parse(id) }, include: { _count: { select: { employees: true, children: true } } } });
    if (dep._count.employees || dep._count.children) throw new UserError("لا يمكن الحذف: توجد أقسام أو موظفون مرتبطون");
    await db.department.delete({ where: { id } });
    await audit({ user, action: "department.delete", entityType: "Department", entityId: id, before: dep });
    refresh();
  }, "تم الحذف");
}

// ---- job titles ------------------------------------------------------------------------

export async function saveJobTitleAction(id: string | null, input: z.input<typeof jobTitleSchema>) {
  return runAction(async () => {
    const user = await actionPermission(PERMISSIONS.ORG_MANAGE);
    const data = jobTitleSchema.parse(input);
    if (id) {
      const before = await db.jobTitle.findUniqueOrThrow({ where: { id } });
      const after = await db.jobTitle.update({ where: { id }, data });
      await audit({ user, action: "job_title.update", entityType: "JobTitle", entityId: id, before, after, diff: true });
    } else {
      const created = await db.jobTitle.create({ data });
      await audit({ user, action: "job_title.create", entityType: "JobTitle", entityId: created.id, after: data });
    }
    refresh();
  }, "تم الحفظ");
}

export async function deleteJobTitleAction(id: string) {
  return runAction(async () => {
    const user = await actionPermission(PERMISSIONS.ORG_MANAGE);
    const jt = await db.jobTitle.findUniqueOrThrow({ where: { id: idSchema.parse(id) }, include: { _count: { select: { employees: true } } } });
    if (jt._count.employees) throw new UserError("لا يمكن الحذف: يوجد موظفون بهذا المسمى");
    await db.jobTitle.delete({ where: { id } });
    await audit({ user, action: "job_title.delete", entityType: "JobTitle", entityId: id, before: jt });
    refresh();
  }, "تم الحذف");
}

// ---- employees & users -------------------------------------------------------------------

export async function saveEmployeeAction(id: string | null, input: z.input<typeof employeeSchema>) {
  return runAction(async () => {
    const user = await actionPermission(PERMISSIONS.EMPLOYEES_MANAGE, PERMISSIONS.USERS_MANAGE);
    const data = employeeSchema.parse(input);
    if (id && data.managerId === id) throw new UserError("لا يمكن أن يكون الموظف مديرًا لنفسه");
    const employeeData = {
      fullName: data.fullName,
      employeeNo: data.employeeNo,
      phone: data.phone,
      departmentId: data.departmentId,
      jobTitleId: data.jobTitleId,
      managerId: data.managerId,
      hireDate: data.hireDate ? fromDateKey(data.hireDate) : null,
      status: data.status,
      notionUserId: data.notionUserId,
      notionAlias: data.notionAlias,
    };
    let generatedPassword: string | null = null;
    if (id) {
      const before = await db.employee.findUniqueOrThrow({ where: { id }, include: { user: true } });
      if (before.userId === user.id && before.user.roleId !== data.roleId) throw new UserError("لا يمكنك تغيير دورك بنفسك");
      await db.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: before.userId },
          data: {
            email: data.email,
            name: data.fullName,
            roleId: data.roleId,
            status: data.status === "TERMINATED" ? "INACTIVE" : "ACTIVE",
            ...(data.password ? { passwordHash: await hashPassword(data.password), passwordSetAt: new Date() } : {}),
          },
        });
        const after = await tx.employee.update({ where: { id }, data: employeeData });
        if (data.status === "TERMINATED") await tx.session.deleteMany({ where: { userId: before.userId } });
        await audit(
          { user, action: "employee.update", entityType: "Employee", entityId: id, before: { ...before, user: { email: before.user.email, roleId: before.user.roleId } }, after: { ...after, email: data.email, roleId: data.roleId }, diff: true },
          tx,
        );
      });
    } else {
      generatedPassword = data.password || `${randomToken(9)}9a`;
      const passwordHash = await hashPassword(generatedPassword);
      await db.$transaction(async (tx) => {
        const u = await tx.user.create({ data: { email: data.email, name: data.fullName, roleId: data.roleId, passwordHash } });
        const e = await tx.employee.create({ data: { ...employeeData, userId: u.id } });
        await audit({ user, action: "employee.create", entityType: "Employee", entityId: e.id, after: { ...employeeData, email: data.email, roleId: data.roleId } }, tx);
      });
      if (data.password) generatedPassword = null;
    }
    refresh();
    return { generatedPassword };
  }, "تم حفظ بيانات الموظف");
}

export async function resetPasswordAction(employeeId: string) {
  return runAction(async () => {
    const user = await actionPermission(PERMISSIONS.USERS_MANAGE);
    const emp = await db.employee.findUniqueOrThrow({ where: { id: idSchema.parse(employeeId) } });
    const password = `${randomToken(9)}9a`;
    await db.user.update({ where: { id: emp.userId }, data: { passwordHash: await hashPassword(password), passwordSetAt: new Date(), failedLogins: 0, lockedUntil: null } });
    await db.session.deleteMany({ where: { userId: emp.userId } });
    await audit({ user, action: "user.reset_password", entityType: "User", entityId: emp.userId });
    return { password };
  }, "تم إنشاء كلمة مرور جديدة");
}

export async function changeOwnPasswordAction(input: z.input<typeof changePasswordSchema>) {
  return runAction(async () => {
    const user = await actionUser();
    const data = changePasswordSchema.parse(input);
    const row = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    if (!(await verifyPassword(data.currentPassword, row.passwordHash))) throw new UserError("كلمة المرور الحالية غير صحيحة");
    await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(data.newPassword), passwordSetAt: new Date() } });
    await db.session.deleteMany({ where: { userId: user.id, id: { not: user.sessionId } } });
    await audit({ user, action: "user.update", entityType: "User", entityId: user.id, after: { passwordChanged: true } });
  }, "تم تغيير كلمة المرور");
}

// ---- roles & permissions ------------------------------------------------------------------

export async function createRoleAction(input: z.input<typeof roleSchema>) {
  return runAction(async () => {
    const user = await actionPermission(PERMISSIONS.ROLES_MANAGE);
    const data = roleSchema.parse(input);
    const role = await db.role.create({ data });
    await audit({ user, action: "role.create", entityType: "Role", entityId: role.id, after: data });
    refresh();
  }, "تم إنشاء الدور");
}

export async function saveRolePermissionsAction(roleId: string, permissionKeys: string[]) {
  return runAction(async () => {
    const user = await actionPermission(PERMISSIONS.ROLES_MANAGE);
    const role = await db.role.findUniqueOrThrow({ where: { id: idSchema.parse(roleId) }, include: { permissions: { include: { permission: true } } } });
    const keys = z.array(z.string().max(64)).max(100).parse(permissionKeys);
    if (role.key === "ADMIN" && !keys.includes(PERMISSIONS.SYSTEM_ADMIN)) throw new UserError("لا يمكن إزالة صلاحية إدارة النظام من دور المدير العام");
    const perms = await db.permission.findMany({ where: { key: { in: keys } } });
    await db.$transaction([
      db.rolePermission.deleteMany({ where: { roleId } }),
      db.rolePermission.createMany({ data: perms.map((p) => ({ roleId, permissionId: p.id })) }),
    ]);
    await audit({
      user,
      action: "role.update_permissions",
      entityType: "Role",
      entityId: roleId,
      before: role.permissions.map((p) => p.permission.key),
      after: perms.map((p) => p.key),
    });
    refresh();
  }, "تم حفظ صلاحيات الدور");
}

// ---- goal templates --------------------------------------------------------------------------

export async function saveGoalTemplateAction(id: string | null, input: z.input<typeof goalTemplateSchema>) {
  return runAction(async () => {
    const user = await actionPermission(PERMISSIONS.GOAL_TEMPLATES_MANAGE);
    const data = goalTemplateSchema.parse(input);
    const items = data.items.map((it, i) => ({
      name: it.name,
      description: it.description,
      goalType: it.goalType,
      targetValue: it.targetValue,
      unit: it.unit,
      weight: it.weight,
      priority: it.priority,
      source: it.source,
      category: it.category,
      sortOrder: i,
      // templates keep the data source inside the rule JSON
      notionFilter:
        it.source === "NOTION" && it.notionFilter ? ({ ...it.notionFilter, dataSourceId: it.notionDataSourceId } as Prisma.InputJsonValue) : undefined,
    }));
    const before = id ? await db.goalTemplate.findUnique({ where: { id }, include: { items: true } }) : null;
    const saved = await db.$transaction(async (tx) => {
      if (id) {
        await tx.goalTemplateItem.deleteMany({ where: { templateId: id } });
        return tx.goalTemplate.update({
          where: { id },
          data: { name: data.name, description: data.description, jobTitleId: data.jobTitleId, isActive: data.isActive, items: { create: items } },
        });
      }
      return tx.goalTemplate.create({
        data: { name: data.name, description: data.description, jobTitleId: data.jobTitleId, isActive: data.isActive, items: { create: items } },
      });
    });
    await audit({ user, action: id ? "goal_template.update" : "goal_template.create", entityType: "GoalTemplate", entityId: saved.id, before, after: data });
    refresh();
    return { id: saved.id };
  }, "تم حفظ القالب");
}

export async function deleteGoalTemplateAction(id: string) {
  return runAction(async () => {
    const user = await actionPermission(PERMISSIONS.GOAL_TEMPLATES_MANAGE);
    const before = await db.goalTemplate.findUniqueOrThrow({ where: { id: idSchema.parse(id) }, include: { items: true } });
    await db.monthlyPlan.updateMany({ where: { templateId: id }, data: { templateId: null } });
    await db.goalTemplate.delete({ where: { id } });
    await audit({ user, action: "goal_template.delete", entityType: "GoalTemplate", entityId: id, before });
    refresh();
  }, "تم حذف القالب");
}

// ---- notifications ------------------------------------------------------------------------------

export async function markNotificationReadAction(id: string) {
  return runAction(async () => {
    const user = await actionUser();
    await db.notification.updateMany({ where: { id: idSchema.parse(id), userId: user.id, readAt: null }, data: { readAt: new Date() } });
    refresh();
  });
}

export async function markAllNotificationsReadAction() {
  return runAction(async () => {
    const user = await actionUser();
    await db.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
    refresh();
  }, "تم تعليم الكل كمقروء");
}
