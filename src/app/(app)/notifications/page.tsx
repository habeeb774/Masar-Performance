import type { Metadata } from "next";
import { BellOff, CheckCheck } from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";
import type { NotificationType } from "@/generated/prisma/enums";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { getCompany } from "@/server/services/company";
import { markAllNotificationsReadAction } from "@/actions/org";
import { pageParams, str, type SearchParams } from "@/lib/params";
import { formatDateTimeAr } from "@/lib/dates";
import { formatNumber } from "@/lib/num";
import { NOTIFICATION_TYPE_LABELS } from "@/lib/labels";
import { EmptyState, PageHeader } from "@/components/shared/page";
import { FilterBar, Pager, SelectFilter } from "@/components/shared/url-filters";
import { ActionButton } from "@/components/shared/action-button";
import { NotificationList, type NotificationItem } from "@/features/notifications/notification-list";

export const metadata: Metadata = { title: "الإشعارات" };

export default async function NotificationsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const sp = await searchParams;
  const company = await getCompany();
  const { page, pageSize, skip, take } = pageParams(sp, 20);
  const filter = str(sp.filter) === "unread" ? "unread" : "all";
  const typeParam = str(sp.type);
  const type = typeParam && typeParam in NOTIFICATION_TYPE_LABELS ? (typeParam as NotificationType) : undefined;

  const where: Prisma.NotificationWhereInput = {
    userId: user.id,
    ...(filter === "unread" ? { readAt: null } : {}),
    ...(type ? { type } : {}),
  };

  const [items, total, unread, types] = await Promise.all([
    db.notification.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
    db.notification.count({ where }),
    db.notification.count({ where: { userId: user.id, readAt: null } }),
    db.notification.findMany({ where: { userId: user.id }, distinct: ["type"], select: { type: true } }),
  ]);

  const rows: NotificationItem[] = items.map((n) => ({
    id: n.id,
    type: n.type,
    typeLabel: NOTIFICATION_TYPE_LABELS[n.type] ?? n.type,
    title: n.title,
    body: n.body,
    link: n.link,
    read: !!n.readAt,
    time: formatDateTimeAr(n.createdAt, company.timezone),
  }));

  return (
    <>
      <PageHeader
        title="الإشعارات"
        description={unread ? `لديك ${formatNumber(unread)} إشعار غير مقروء` : "لا توجد إشعارات غير مقروءة"}
        actions={
          <ActionButton variant="outline" action={markAllNotificationsReadAction} disabled={unread === 0}>
            <CheckCheck /> تعليم الكل كمقروء
          </ActionButton>
        }
      />
      <FilterBar>
        <SelectFilter
          param="filter"
          placeholder="الحالة"
          allLabel="كل الإشعارات"
          options={[{ value: "unread", label: `غير المقروءة (${formatNumber(unread)})` }]}
        />
        <SelectFilter
          param="type"
          placeholder="النوع"
          allLabel="كل الأنواع"
          className="sm:w-52"
          options={types.map((t) => ({ value: t.type, label: NOTIFICATION_TYPE_LABELS[t.type] ?? t.type }))}
        />
      </FilterBar>
      {rows.length === 0 ? (
        <EmptyState
          icon={BellOff}
          title={filter === "unread" || type ? "لا توجد إشعارات مطابقة" : "لا توجد إشعارات"}
          description={filter === "unread" ? "قرأت جميع إشعاراتك." : "ستصلك هنا تنبيهات المهام والخطط والتقارير والتقييمات."}
        />
      ) : (
        <NotificationList items={rows} />
      )}
      <Pager page={page} pageSize={pageSize} total={total} />
    </>
  );
}
