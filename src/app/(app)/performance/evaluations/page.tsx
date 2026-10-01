import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ClipboardCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, PageHeader } from "@/components/shared/page";
import { MonthPicker } from "@/components/shared/url-filters";
import type { SearchParams } from "@/lib/params";
import { int } from "@/lib/params";
import { PERMISSIONS, hasPermission } from "@/lib/permissions";
import { monthLabel } from "@/lib/dates";
import { num } from "@/lib/num";
import { db } from "@/server/db";
import { employeeWhere, requirePermission } from "@/server/auth/session";
import { currentMonth } from "@/server/queries/performance";
import { listEvaluations } from "@/server/services/evaluation";
import { CreateEvaluationButton } from "@/features/evaluation/evaluation-buttons";
import { fmt } from "@/features/evaluation/evaluation-sheet";

export const metadata: Metadata = { title: "التقييم الرسمي الشهري" };

export default async function EvaluationsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requirePermission(PERMISSIONS.PERFORMANCE_REVIEW, PERMISSIONS.PERFORMANCE_APPROVE);
  const sp = await searchParams;
  const now = await currentMonth();
  const year = int(sp.year, now.year, 2020, 2100);
  const month = int(sp.month, now.month, 1, 12);
  const scope = employeeWhere(user);
  const [employees, evaluations] = await Promise.all([
    db.employee.findMany({ where: { status: "ACTIVE", ...(scope.employeeId ? { id: scope.employeeId } : {}) }, select: { id: true, fullName: true, jobTitle: { select: { name: true } } }, orderBy: { fullName: "asc" } }),
    listEvaluations(user, { year, month }),
  ]);
  const byEmployee = new Map(evaluations.map((e) => [e.employeeId, e]));
  const canCreate = hasPermission(user, PERMISSIONS.PERFORMANCE_REVIEW);

  return (
    <>
      <PageHeader
        title="التقييم الرسمي الشهري"
        description={`نموذج المدير: 4 واجبات موزونة (20 / 40 / 20 / 20) — ${monthLabel(year, month)}`}
        actions={<MonthPicker year={year} month={month} />}
      />
      <Card>
        <CardContent>
          {employees.length === 0 ? (
            <EmptyState icon={ClipboardCheck} title="لا يوجد موظفون في نطاقك" />
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow>
                    <TableHead className="text-start">الموظف</TableHead>
                    <TableHead className="text-start">المسمى</TableHead>
                    <TableHead className="text-start">الحالة</TableHead>
                    <TableHead className="text-start">النتيجة النهائية</TableHead>
                    <TableHead className="text-start">التقدير العام</TableHead>
                    <TableHead className="text-end" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employees.map((emp) => {
                    const e = byEmployee.get(emp.id);
                    return (
                      <TableRow key={emp.id}>
                        <TableCell className="font-medium">{emp.fullName}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{emp.jobTitle?.name ?? "—"}</TableCell>
                        <TableCell>{e ? (e.status === "APPROVED" ? "معتمد" : "مسودة") : "—"}</TableCell>
                        <TableCell className="tabular-nums">{e ? fmt(num(e.finalScore)) : "—"}</TableCell>
                        <TableCell>{e?.ratingLabel ?? "—"}</TableCell>
                        <TableCell className="text-end">
                          {e ? (
                            <Button size="sm" variant="ghost" asChild>
                              <Link href={`/performance/evaluations/${e.id}`}>
                                فتح <ArrowLeft />
                              </Link>
                            </Button>
                          ) : (
                            canCreate && <CreateEvaluationButton employeeId={emp.id} year={year} month={month} />
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
