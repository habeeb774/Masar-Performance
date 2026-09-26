import type { Metadata } from "next";
import Link from "next/link";
import { Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, PageHeader } from "@/components/shared/page";
import { EnumBadge, StatusBadge } from "@/components/shared/status-badge";
import { ProgressBar } from "@/components/shared/progress-bar";
import { FilterBar, Pager, SearchInput, SelectFilter } from "@/components/shared/url-filters";
import type { SearchParams } from "@/lib/params";
import { pageParams, str } from "@/lib/params";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { PLAN_STATUS_LABELS } from "@/lib/labels";
import { monthLabel } from "@/lib/dates";
import { requirePermission } from "@/server/auth/session";
import { getEmployeeFormOptions, getEmployeesList } from "@/server/queries/performance";
import { AddEmployeeButton, EmployeeRowActions } from "@/features/employees/employee-actions";
import { EMPLOYEE_STATUS_OPTIONS, EMPLOYEE_STATUS_TONE } from "@/features/employees/constants";

export const metadata: Metadata = { title: "الموظفون" };

export default async function EmployeesPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requirePermission(PERMISSIONS.EMPLOYEES_VIEW_ALL, PERMISSIONS.EMPLOYEES_MANAGE);
  const sp = await searchParams;
  const { page, pageSize, skip, take } = pageParams(sp);
  const canEdit = hasPermission(user, PERMISSIONS.EMPLOYEES_MANAGE) || hasPermission(user, PERMISSIONS.USERS_MANAGE);
  const canReset = hasPermission(user, PERMISSIONS.USERS_MANAGE);
  const [list, options] = await Promise.all([
    getEmployeesList(user, { q: str(sp.q), departmentId: str(sp.department), jobTitleId: str(sp.jobTitle), status: str(sp.status), skip, take }),
    getEmployeeFormOptions(),
  ]);
  const filtered = !!(str(sp.q) || str(sp.department) || str(sp.jobTitle) || str(sp.status));

  return (
    <>
      <PageHeader title="الموظفون" description={`بيانات الفريق وحالة خطة ${monthLabel(list.year, list.month)}`} actions={canEdit && <AddEmployeeButton options={options} />} />

      <FilterBar>
        <SearchInput placeholder="بحث بالاسم أو البريد أو الرقم الوظيفي…" />
        <SelectFilter param="department" placeholder="الإدارة" allLabel="كل الإدارات" options={options.departments} />
        <SelectFilter param="jobTitle" placeholder="المسمى الوظيفي" allLabel="كل المسميات" options={options.jobTitles} />
        <SelectFilter param="status" placeholder="الحالة" allLabel="كل الحالات" options={EMPLOYEE_STATUS_OPTIONS.map((s) => ({ value: s.value, label: s.label }))} />
      </FilterBar>

      <Card>
        <CardContent>
          {list.rows.length === 0 ? (
            <EmptyState
              icon={Users}
              title={filtered ? "لا توجد نتائج مطابقة" : "لا يوجد موظفون بعد"}
              description={filtered ? "جرّب تغيير كلمات البحث أو الفلاتر." : "أضف أول موظف لبدء إعداد الخطط والتقييمات."}
              action={!filtered && canEdit ? <AddEmployeeButton options={options} /> : undefined}
            />
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow>
                    <TableHead className="text-start">الموظف</TableHead>
                    <TableHead className="text-start">الرقم الوظيفي</TableHead>
                    <TableHead className="text-start">المسمى / الإدارة</TableHead>
                    <TableHead className="text-start">المدير المباشر</TableHead>
                    <TableHead className="text-start">الدور</TableHead>
                    <TableHead className="text-start">الحالة</TableHead>
                    <TableHead className="text-start">خطة الشهر</TableHead>
                    <TableHead className="min-w-36 text-start">الإنجاز الموزون</TableHead>
                    {(canEdit || canReset) && <TableHead className="text-end">إجراءات</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.rows.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell>
                        <Link href={`/employees/${e.id}`} className="font-medium hover:underline">
                          {e.fullName}
                        </Link>
                        <div className="text-xs text-muted-foreground" dir="ltr">
                          {e.email}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm tabular-nums" dir="ltr">
                        {e.employeeNo ?? "—"}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{e.jobTitleName ?? <span className="text-muted-foreground">بدون مسمى</span>}</div>
                        <div className="text-xs text-muted-foreground">{e.departmentName ?? "—"}</div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {e.managerId ? (
                          <Link href={`/employees/${e.managerId}`} className="hover:underline">
                            {e.managerName}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">{e.roleName}</TableCell>
                      <TableCell>
                        <StatusBadge tone={EMPLOYEE_STATUS_TONE[e.status] ?? "neutral"}>{EMPLOYEE_STATUS_OPTIONS.find((s) => s.value === e.status)?.label ?? e.status}</StatusBadge>
                      </TableCell>
                      <TableCell>
                        {e.planStatus ? (
                          <Link href={`/monthly-plans/${e.planId}`}>
                            <EnumBadge map={PLAN_STATUS_LABELS} value={e.planStatus} />
                          </Link>
                        ) : (
                          <span className="text-xs text-muted-foreground">بدون خطة</span>
                        )}
                      </TableCell>
                      <TableCell>{e.progress === null ? <span className="text-muted-foreground">—</span> : <ProgressBar value={e.progress} showLabel size="sm" />}</TableCell>
                      {(canEdit || canReset) && (
                        <TableCell>
                          <EmployeeRowActions employee={e} options={options} canEdit={canEdit} canResetPassword={canReset} />
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <Pager page={page} pageSize={pageSize} total={list.total} />
        </CardContent>
      </Card>
    </>
  );
}
