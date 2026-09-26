"use server";

import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { createSession, destroySession, getCurrentUser, requestMeta } from "@/server/auth/session";
import { DUMMY_HASH, verifyPassword } from "@/server/auth/password";
import { rateLimit, resetRateLimit } from "@/server/rate-limit";
import { loginSchema } from "@/lib/validation";

export interface LoginState {
  error?: string;
}

const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60 * 1000;

function safeNext(next: unknown) {
  const v = typeof next === "string" ? next : "";
  return v.startsWith("/") && !v.startsWith("//") && !v.startsWith("/\\") ? v : "/dashboard";
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "بيانات غير صحيحة" };
  const { email, password } = parsed.data;
  const { ip } = await requestMeta();

  const byIp = await rateLimit(`login:ip:${ip ?? "unknown"}`, 30, 15 * 60 * 1000);
  const byEmail = await rateLimit(`login:email:${email}`, 10, 15 * 60 * 1000);
  if (!byIp.ok || !byEmail.ok) {
    const minutes = Math.ceil(Math.max(byIp.retryAfterMs, byEmail.retryAfterMs) / 60000);
    return { error: `محاولات كثيرة، حاول بعد ${minutes} دقيقة` };
  }

  const user = await db.user.findUnique({ where: { email } });
  const valid = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);

  if (!user || !valid) {
    if (user) {
      const failures = user.failedLogins + 1;
      await db.user.update({
        where: { id: user.id },
        data: { failedLogins: failures, lockedUntil: failures >= MAX_FAILURES ? new Date(Date.now() + LOCK_MS) : user.lockedUntil },
      });
      await audit({ user: null, action: "auth.login_failed", entityType: "User", entityId: user.id });
    }
    return { error: "البريد الإلكتروني أو كلمة المرور غير صحيحة" };
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return { error: "الحساب مقفل مؤقتًا بسبب محاولات فاشلة متكررة، حاول لاحقًا" };
  }
  if (user.status !== "ACTIVE") return { error: "الحساب غير مفعل، تواصل مع مدير النظام" };

  await db.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } });
  await resetRateLimit(`login:email:${email}`);
  await createSession(user.id);
  await audit({ user: null, action: "auth.login", entityType: "User", entityId: user.id });
  redirect(safeNext(formData.get("next")));
}

export async function logoutAction() {
  const user = await getCurrentUser();
  await destroySession();
  if (user) await audit({ user, action: "auth.logout", entityType: "User", entityId: user.id });
  redirect("/login");
}
