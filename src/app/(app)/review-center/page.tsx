import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page";
import type { SearchParams } from "@/lib/params";
import { int, str } from "@/lib/params";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { requirePermission } from "@/server/auth/session";
import {
  getMonthlyReportsQueue,
  getNotionQueue,
  getPlansQueue,
  getReviewCenterCounts,
  getWeeklyReportsQueue,
  REVIEW_TABS,
  type ReviewTab,
} from "@/server/queries/review-center";
import { MonthlyReportsQueue, NotionQueue, PlansQueue, WeeklyReportsQueue } from "@/features/review-center/queues";

export const metadata: Metadata = { title: "مركز المراجعة" };

const TAB_LABELS: Record<ReviewTab, string> = {
  weekly: "التقارير الأسبوعية",
  monthly: "التقارير الشهرية",
  plans: "الخطط",
  pending: "بانتظار الاعتماد",
  images: "اعتماد الصور",
  content: "اعتماد المحتوى",
  revision: "تحتاج تحسين",
};

const NOTION_EMPTY: Record<"pending" | "images" | "content" | "revision", string> = {
  pending: "لا توجد عناصر بانتظار الاعتماد",
  images: "لا توجد صور بانتظار الاعتماد",
  content: "لا يوجد محتوى بانتظار الاعتماد",
  revision: "لا توجد عناصر تحتاج تحسين",
};

export default async function ReviewCenterPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requirePermission(PERMISSIONS.REVIEW_CENTER);
  const sp = await searchParams;
  const raw = str(sp.tab);
  const tab: ReviewTab = raw && (REVIEW_TABS as readonly string[]).includes(raw) ? (raw as ReviewTab) : "weekly";
  const page = int(sp.page, 1, 1, 10_000);
  const canApproveReports = hasPermission(user, PERMISSIONS.REPORTS_REVIEW);
  const canApprovePlans = hasPermission(user, PERMISSIONS.PLANS_APPROVE);

  const counts = await getReviewCenterCounts(user);
  let body: React.ReactNode;
  if (tab === "weekly") body = <WeeklyReportsQueue rows={await getWeeklyReportsQueue(user)} canApprove={canApproveReports} />;
  else if (tab === "monthly") body = <MonthlyReportsQueue rows={await getMonthlyReportsQueue(user)} canApprove={canApproveReports} />;
  else if (tab === "plans") body = <PlansQueue data={await getPlansQueue(user)} canApprove={canApprovePlans} />;
  else body = <NotionQueue data={await getNotionQueue(user, tab, page)} emptyTitle={NOTION_EMPTY[tab]} />;

  return (
    <>
      <PageHeader title="مركز المراجعة" description="كل ما ينتظر قرارك في مكان واحد: التقارير والخطط وعناصر Notion" />
      <nav className="mb-4 flex gap-1 overflow-x-auto rounded-lg border bg-card p-1" aria-label="أقسام المراجعة">
        {REVIEW_TABS.map((t) => (
          <Link
            key={t}
            href={t === "weekly" ? "/review-center" : `/review-center?tab=${t}`}
            aria-current={t === tab ? "page" : undefined}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
              t === tab && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
            )}
          >
            {TAB_LABELS[t]}
            <span
              className={cn(
                "min-w-5 rounded-full px-1.5 text-center text-[11px] tabular-nums",
                t === tab ? "bg-primary-foreground/20" : counts[t] > 0 ? "bg-pending-soft text-pending" : "bg-muted",
              )}
            >
              {counts[t]}
            </span>
          </Link>
        ))}
      </nav>
      <Card>
        <CardContent>{body}</CardContent>
      </Card>
    </>
  );
}
