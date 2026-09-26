import type { Metadata } from "next";
import { AlarmClock, CalendarCheck2, ClipboardList, UserX } from "lucide-react";
import type { SearchParams } from "@/lib/params";
import { pageParams, str } from "@/lib/params";
import { requireUser } from "@/server/auth/session";
import { getMyTasks, type DailyTaskRow, type MyTasksView } from "@/server/queries/tasks";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { formatDateAr, formatDayAr } from "@/lib/dates";
import { TASK_STATUSES, TASK_STATUS_LABELS } from "@/lib/labels";
import { EmptyState, PageHeader, SectionTitle } from "@/components/shared/page";
import { FilterBar, Pager, SearchInput, SelectFilter } from "@/components/shared/url-filters";
import { Card, CardContent } from "@/components/ui/card";
import { UrlTabs } from "@/features/tasks/url-tabs";
import { ManualTaskDialog } from "@/features/tasks/manual-task-dialog";
import { AdHocTaskItem, DailyTaskItem } from "@/features/tasks/my-task-list";
import { TodayTasksPanel } from "@/features/tasks/today-tasks-panel";

export const metadata: Metadata = { title: "مهامي" };

const VIEWS: MyTasksView[] = ["today", "week", "overdue", "all"];

function groupByDate(rows: DailyTaskRow[]) {
  const map = new Map<string, DailyTaskRow[]>();
  for (const r of rows) map.set(r.date, [...(map.get(r.date) ?? []), r]);
  return [...map.entries()];
}

export default async function MyTasksPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  if (!user.employeeId) {
    return (
      <>
        <PageHeader title="مهامي" />
        <EmptyState icon={UserX} title="حسابك غير مرتبط بملف موظف" description="اطلب من مدير النظام ربط حسابك بملف موظف لعرض مهامك." />
      </>
    );
  }
  const sp = await searchParams;
  const status = str(sp.status);
  const rawView = str(sp.view) as MyTasksView | undefined;
  const view: MyTasksView = rawView && VIEWS.includes(rawView) ? rawView : status === "DELAYED" ? "overdue" : "today";
  const q = str(sp.q);
  const { page, pageSize, skip, take } = pageParams(sp, 30);
  const validStatus = status && (TASK_STATUSES as readonly string[]).includes(status) ? status : undefined;

  const data = await getMyTasks(user, { view, status: validStatus, q, skip, take });
  const canManage = hasPermission(user, PERMISSIONS.TASKS_ASSIGN);
  const filtered = !!(validStatus || q);

  const title =
    view === "today"
      ? `مهام اليوم — ${formatDayAr(data.today)}`
      : view === "week"
        ? `هذا الأسبوع: ${formatDateAr(data.weekStart)} – ${formatDateAr(data.weekEnd)}`
        : view === "overdue"
          ? "المهام المتأخرة"
          : "كل المهام";

  return (
    <>
      <PageHeader
        title="مهامي"
        description="مهامك اليومية الموزعة من الخطة، والمهام اليدوية، والتكليفات المستجدة من المدير."
        actions={<ManualTaskDialog today={data.today} goals={data.goals} />}
      />

      <UrlTabs
        pathname="/my-tasks"
        param="view"
        value={view}
        base={{ status: validStatus, q }}
        tabs={[
          { value: "today", label: "اليوم", count: data.counts.today },
          { value: "week", label: "هذا الأسبوع", count: data.counts.week },
          { value: "overdue", label: "المتأخرة", count: data.counts.overdue, tone: "danger" },
          { value: "all", label: "الكل" },
        ]}
      />

      <FilterBar>
        <SearchInput placeholder="بحث في المهام…" />
        <SelectFilter
          param="status"
          placeholder="الحالة"
          allLabel="كل الحالات"
          options={TASK_STATUSES.map((s) => ({ value: s, label: TASK_STATUS_LABELS[s].label }))}
        />
      </FilterBar>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="space-y-3 lg:col-span-2">
          <SectionTitle>{title}</SectionTitle>
          {view === "today" && !filtered ? (
            <TodayTasksPanel daily={data.daily} adHoc={data.adHoc} today={data.today} goals={data.goals} currentUserId={user.id} canManage={canManage} />
          ) : data.daily.length === 0 ? (
            <EmptyState
              icon={view === "overdue" ? AlarmClock : CalendarCheck2}
              title={filtered ? "لا توجد مهام مطابقة للفلترة" : view === "overdue" ? "لا توجد مهام متأخرة" : "لا توجد مهام في هذه الفترة"}
              description={filtered ? "جرّب تغيير الحالة أو كلمة البحث." : "وزّع أهداف الأسبوع على الأيام من صفحة أسبوعي، أو أضف مهمة يدوية."}
            />
          ) : view === "today" ? (
            <div className="space-y-2">
              {data.daily.map((t) => (
                <DailyTaskItem key={t.id} task={t} today={data.today} goals={data.goals} currentUserId={user.id} canManage={canManage} showDate={false} />
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {groupByDate(data.daily).map(([date, rows]) => (
                <div key={date} className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground">
                    {date === data.today ? `اليوم — ${formatDayAr(date)}` : formatDayAr(date)}
                  </p>
                  {rows.map((t) => (
                    <DailyTaskItem key={t.id} task={t} today={data.today} goals={data.goals} currentUserId={user.id} canManage={canManage} showDate={false} />
                  ))}
                </div>
              ))}
            </div>
          )}
          {view === "all" && <Pager page={page} pageSize={pageSize} total={data.dailyTotal} />}
        </section>

        <aside className="space-y-3">
          <SectionTitle>
            {view === "all" ? "كل التكليفات المستجدة" : view === "overdue" ? "تكليفات متأخرة" : "التكليفات المفتوحة"}
          </SectionTitle>
          {data.adHoc.length === 0 ? (
            <Card>
              <CardContent>
                <EmptyState icon={ClipboardList} title="لا توجد تكليفات" description="ستظهر هنا المهام المستجدة التي يكلفك بها المدير." className="border-0 py-6" />
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {data.adHoc.map((t) => (
                <AdHocTaskItem key={t.id} task={t} today={data.today} currentUserId={user.id} canManage={canManage} />
              ))}
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
