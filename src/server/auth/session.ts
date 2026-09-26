import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { forbidden, redirect } from "next/navigation";
import { db } from "@/server/db";
import { randomToken, sha256 } from "@/server/crypto";
import {
  canAccessEmployee,
  employeeScope,
  hasPermission,
  type PermissionKey,
} from "@/lib/permissions";

export const SESSION_COOKIE = "sph_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SESSION_REFRESH_MS = 24 * 60 * 60 * 1000;
const LAST_SEEN_THROTTLE_MS = 5 * 60 * 1000;

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  roleKey: string;
  roleName: string;
  permissions: Set<string>;
  employeeId: string | null;
  employeeName: string | null;
  jobTitle: string | null;
  directReportIds: string[];
  sessionId: string;
}

export class AuthError extends Error {
  constructor(
    message = "غير مصرح",
    public status: 401 | 403 = 401,
  ) {
    super(message);
  }
}

export async function requestMeta() {
  const h = await headers();
  const ip = (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "").trim() || null;
  return { ip, userAgent: h.get("user-agent")?.slice(0, 300) ?? null };
}

export async function createSession(userId: string) {
  const token = randomToken(32);
  const meta = await requestMeta();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.session.create({
    data: { tokenHash: sha256(token), userId, expiresAt, ip: meta.ip, userAgent: meta.userAgent },
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: sha256(token) } });
  jar.delete(SESSION_COOKIE);
}

/** Resolve the signed-in user once per request. */
export const getCurrentUser = cache(async (): Promise<AuthUser | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await db.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: {
      user: {
        include: {
          role: { include: { permissions: { include: { permission: true } } } },
          employee: { include: { jobTitle: true, reports: { select: { id: true } } } },
        },
      },
    },
  });
  if (!session || session.expiresAt < new Date() || session.user.status !== "ACTIVE") return null;

  const now = Date.now();
  if (now - session.lastSeenAt.getTime() > LAST_SEEN_THROTTLE_MS) {
    const extend = session.expiresAt.getTime() - now < SESSION_TTL_MS - SESSION_REFRESH_MS;
    await db.session.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date(), ...(extend ? { expiresAt: new Date(now + SESSION_TTL_MS) } : {}) },
    });
  }

  const u = session.user;
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    roleKey: u.role.key,
    roleName: u.role.name,
    permissions: new Set(u.role.permissions.map((rp) => rp.permission.key)),
    employeeId: u.employee?.id ?? null,
    employeeName: u.employee?.fullName ?? null,
    jobTitle: u.employee?.jobTitle?.name ?? null,
    directReportIds: u.employee?.reports.map((r) => r.id) ?? [],
    sessionId: session.id,
  };
});

export function can(user: AuthUser | null, key: PermissionKey): boolean {
  return !!user && hasPermission(user, key);
}

// ---- page guards (redirect / 403 page) -------------------------------------

export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requirePermission(...keys: PermissionKey[]): Promise<AuthUser> {
  const user = await requireUser();
  if (!keys.some((k) => hasPermission(user, k))) forbidden();
  return user;
}

export async function requireEmployeeAccess(employeeId: string): Promise<AuthUser> {
  const user = await requireUser();
  if (!canAccessEmployee(user, employeeId)) forbidden();
  return user;
}

// ---- action guards (throw AuthError, surfaced as a toast) -------------------

export async function actionUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError("انتهت الجلسة، يرجى تسجيل الدخول مجددًا", 401);
  return user;
}

export async function actionPermission(...keys: PermissionKey[]): Promise<AuthUser> {
  const user = await actionUser();
  if (!keys.some((k) => hasPermission(user, k))) throw new AuthError("ليس لديك صلاحية لتنفيذ هذا الإجراء", 403);
  return user;
}

export function assertEmployeeAccess(user: AuthUser, employeeId: string) {
  if (!canAccessEmployee(user, employeeId)) throw new AuthError("لا يمكنك الوصول لبيانات هذا الموظف", 403);
}

/** Prisma `where` fragment restricting rows to employees visible to the user. */
export function employeeWhere(user: AuthUser): { employeeId?: { in: string[] } } {
  const scope = employeeScope(user);
  return scope === "ALL" ? {} : { employeeId: { in: scope } };
}

export function employeeIdScope(user: AuthUser): "ALL" | string[] {
  return employeeScope(user);
}
