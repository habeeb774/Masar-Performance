import { NextResponse, type NextRequest } from "next/server";
import JSZip from "jszip";
import { db } from "@/server/db";
import { employeeIdScope } from "@/server/auth/session";
import { UserError } from "@/server/action";
import { audit } from "@/server/audit";
import { buildEmployeePerformanceFile } from "@/server/export/performance-report";
import { exportUser, fileResponse, parsePeriod } from "@/server/export/export-access";
import { monthLabel } from "@/lib/dates";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** ZIP with one HR workbook per employee in the manager's scope (read-only). */
export async function GET(request: NextRequest) {
  const user = await exportUser();
  if (user instanceof NextResponse) return user;
  const period = parsePeriod(request.nextUrl.searchParams);
  if (!period.success) return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
  const { year, month } = period.data;

  const scope = employeeIdScope(user);
  // only people actually evaluated this month: a plan or a review exists
  const employees = await db.employee.findMany({
    where: {
      status: { not: "TERMINATED" },
      ...(scope === "ALL" ? {} : { id: { in: scope } }),
      OR: [{ monthlyPlans: { some: { year, month } } }, { reviews: { some: { year, month } } }],
    },
    select: { id: true, fullName: true },
    orderBy: { fullName: "asc" },
  });

  const zip = new JSZip();
  const skipped: string[] = [];
  let count = 0;
  for (const e of employees) {
    try {
      const file = await buildEmployeePerformanceFile(e.id, year, month);
      zip.file(file.fileName, file.buffer);
      count++;
    } catch (err) {
      if (!(err instanceof UserError)) console.error("[performance-export-all]", e.id, err instanceof Error ? err.message : err);
      skipped.push(e.fullName);
    }
  }
  if (count === 0) return NextResponse.json({ error: `لا توجد تقييمات قابلة للتصدير لشهر ${monthLabel(year, month)}` }, { status: 404 });
  if (skipped.length) zip.file("لم-يُصدَّر.txt", `لا توجد مؤشرات أداء لهذا الشهر لكل من:\n${skipped.join("\n")}\n`);

  const buffer = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  await audit({ user, action: "performance.export", entityType: "Team", entityId: null, after: { year, month, employees: count, skipped: skipped.length } });
  const [, monthName] = monthLabel(year, month).match(/^(\S+)/) ?? [];
  return fileResponse(buffer, `مؤشرات-أداء-الفريق-${monthName ?? month}-${year}.zip`, "application/zip");
}
