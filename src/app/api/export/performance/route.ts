import { NextResponse, type NextRequest } from "next/server";
import { assertEmployeeAccess, AuthError } from "@/server/auth/session";
import { UserError } from "@/server/action";
import { audit } from "@/server/audit";
import { idSchema } from "@/lib/validation";
import { buildEmployeePerformanceFile } from "@/server/export/performance-report";
import { exportUser, fileResponse, parsePeriod, XLSX_TYPE } from "@/server/export/export-access";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** HR workbook for one employee and month (read-only). */
export async function GET(request: NextRequest) {
  const user = await exportUser();
  if (user instanceof NextResponse) return user;
  const params = request.nextUrl.searchParams;
  const period = parsePeriod(params);
  const employeeId = idSchema.safeParse(params.get("employee"));
  if (!period.success || !employeeId.success) return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });

  try {
    assertEmployeeAccess(user, employeeId.data);
    const { year, month } = period.data;
    const file = await buildEmployeePerformanceFile(employeeId.data, year, month);
    await audit({ user, action: "performance.export", entityType: "Employee", entityId: employeeId.data, after: { kind: "single", year, month } });
    return fileResponse(file.buffer, file.fileName, XLSX_TYPE);
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: 404 });
    console.error("[performance-export]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "تعذر إنشاء الملف" }, { status: 500 });
  }
}
