import "server-only";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { hashPassword } from "@/server/auth/password";
import { UserError } from "@/server/action";
import type { setupSchema } from "@/lib/validation";
import type { z } from "zod";

/**
 * The first-run setup wizard (/setup) is only reachable until this returns
 * true. It flips permanently once `completeSetup` runs.
 */
export async function isSetupCompleted(): Promise<boolean> {
  const company = await db.company.findFirst({ orderBy: { createdAt: "asc" }, select: { setupCompletedAt: true } });
  return !!company?.setupCompletedAt;
}

/**
 * Turns the seeded placeholder admin account into the real administrator's
 * account (same account, so there is exactly one admin afterwards — not a
 * duplicate) and names the company. Runs once; a race is caught by
 * re-checking `setupCompletedAt` right before writing.
 */
export async function completeSetup(input: z.infer<typeof setupSchema>) {
  const company = (await db.company.findFirst({ orderBy: { createdAt: "asc" } })) ?? (await db.company.create({ data: { name: input.companyName } }));
  if (company.setupCompletedAt) throw new UserError("تم إعداد النظام مسبقًا");

  const adminRole = await db.role.findUnique({ where: { key: "ADMIN" } });
  if (!adminRole) throw new UserError("لم يتم العثور على دور مدير النظام — تحقق من تهيئة قاعدة البيانات");

  const emailTaken = await db.user.findFirst({ where: { email: input.email, roleId: { not: adminRole.id } } });
  if (emailTaken) throw new UserError("هذا البريد الإلكتروني مستخدم بالفعل");

  const existingAdmin = await db.user.findFirst({ where: { roleId: adminRole.id }, orderBy: { createdAt: "asc" }, include: { employee: true } });
  const passwordHash = await hashPassword(input.password);

  const result = await db.$transaction(async (tx) => {
    const freshCompany = await tx.company.findUniqueOrThrow({ where: { id: company.id } });
    if (freshCompany.setupCompletedAt) throw new UserError("تم إعداد النظام مسبقًا");

    await tx.company.update({ where: { id: company.id }, data: { name: input.companyName, setupCompletedAt: new Date() } });

    if (existingAdmin) {
      const user = await tx.user.update({
        where: { id: existingAdmin.id },
        data: { name: input.fullName, email: input.email, passwordHash, status: "ACTIVE", failedLogins: 0, lockedUntil: null, passwordSetAt: new Date() },
      });
      if (existingAdmin.employee) {
        await tx.employee.update({ where: { id: existingAdmin.employee.id }, data: { fullName: input.fullName } });
      } else {
        await tx.employee.create({ data: { userId: user.id, fullName: input.fullName } });
      }
      return user;
    }

    const user = await tx.user.create({ data: { name: input.fullName, email: input.email, roleId: adminRole.id, passwordHash } });
    await tx.employee.create({ data: { userId: user.id, fullName: input.fullName } });
    return user;
  });

  await audit({
    user: null,
    action: "setup.complete",
    entityType: "Company",
    entityId: company.id,
    after: { companyName: input.companyName, adminEmail: input.email },
  });
  return result;
}
