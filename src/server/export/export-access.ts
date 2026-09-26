import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser, type AuthUser } from "@/server/auth/session";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";

const periodSchema = z.object({
  year: z.coerce.number().int().min(2020).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});

/** Managers/admins who review performance may export; employees may not. */
export async function exportUser(): Promise<AuthUser | NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
  if (!hasPermission(user, PERMISSIONS.PERFORMANCE_REVIEW) && !hasPermission(user, PERMISSIONS.PERFORMANCE_APPROVE)) {
    return NextResponse.json({ error: "تصدير تقارير الأداء متاح للمديرين فقط" }, { status: 403 });
  }
  return user;
}

export function parsePeriod(params: URLSearchParams) {
  return periodSchema.safeParse({ year: params.get("year"), month: params.get("month") });
}

export function fileResponse(buffer: Buffer | Uint8Array, fileName: string, contentType: string) {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, "_");
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "no-store",
    },
  });
}

export const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
