import type { Metadata } from "next";
import type { SearchParams } from "@/lib/params";
import { pageParams, str } from "@/lib/params";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/lib/permissions";
import { isDateKey, todayKey } from "@/lib/dates";
import { TASK_STATUSES } from "@/lib/labels";
import { getAdHocTasks, getDailyTasks, getScopeEmployees, getTaskTabCounts } from "@/server/queries/tasks";
import { getCompany } from "@/server/services/company";
import { PageHeader } from "@/components/shared/page";
import { Pager } from "@/components/shared/url-filters";
import { UrlTabs } from "@/features/tasks/url-tabs";
import { AdHocTaskDialog } from "@/features/tasks/adhoc-task-dialog";
import { AdHocTable, DailyTasksTable, TasksFilterBar } from "@/features/tasks/manager-task-tables";

export const metadata: Metadata = { title: "المهام والتكليفات" };

export default async function TasksPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requirePermission(PERMISSIONS.TASKS_ASSIGN);
  const sp = await searchParams;
  const tab = str(sp.tab) === "daily" ? "daily" : "adhoc";
  const rawStatus = str(sp.status);
  const status = rawStatus && (TASK_STATUSES as readonly string[]).includes(rawStatus) ? rawStatus : undefined;
  const employeeId = str(sp.employee);
  const from = str(sp.from);
  const to = str(sp.to);
  const q = str(sp.q);
  const { page, pageSize, skip, take } = pageParams(sp, 25);
  const filters = {
    employeeId,
    status,
    from: from && isDateKey(from) ? from : undefined,
    to: to && isDateKey(to) ? to : undefined,
    q,
    skip,
    take,
  };

  const company = await getCompany();
  const today = todayKey(company.timezone);
  const [employees, counts, adHoc, daily] = await Promise.all([
    getScopeEmployees(user),
    getTaskTabCounts(user),
    tab === "adhoc" ? getAdHocTasks(user, filters) : null,
    tab === "daily" ? getDailyTasks(user, filters) : null,
  ]);

  return (
    <>
      <PageHeader
        title="المهام والتكليفات"
        description="متابعة مهام الفريق اليومية، وإسناد التكليفات المستجدة خارج الخطة."
        actions={<AdHocTaskDialog today={today} employees={employees} autoOpenParam />}
      />

      <UrlTabs
        pathname="/tasks"
        param="tab"
        value={tab}
        base={{ status, employee: employeeId, from, to, q }}
        tabs={[
          { value: "adhoc", label: "التكليفات المستجدة", count: counts.openAdHoc },
          { value: "daily", label: "المهام اليومية", count: counts.delayedDaily, tone: "danger" },
        ]}
      />

      <TasksFilterBar employees={employees} tab={tab} />

      {adHoc && <AdHocTable rows={adHoc.rows} today={today} employees={employees} currentUserId={user.id} />}
      {daily && <DailyTasksTable rows={daily.rows} today={today} currentUserId={user.id} />}
      <Pager page={page} pageSize={pageSize} total={(adHoc ?? daily)?.total ?? 0} />
    </>
  );
}
