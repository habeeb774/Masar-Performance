import type { Metadata } from "next";
import { ScrollText } from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";
import { requirePermission } from "@/server/auth/session";
import { db } from "@/server/db";
import { AUDIT_ACTION_LABELS } from "@/server/audit";
import { getCompany } from "@/server/services/company";
import { PERMISSIONS } from "@/lib/permissions";
import { pageParams, str, type SearchParams } from "@/lib/params";
import { addDays, formatDateTimeAr, fromDateKey, isDateKey } from "@/lib/dates";
import { EmptyState, PageHeader } from "@/components/shared/page";
import { FilterBar, Pager, SearchInput, SelectFilter } from "@/components/shared/url-filters";
import { DateRangeFilter } from "@/features/audit/date-range-filter";
import { AuditTable, type AuditRow } from "@/features/audit/audit-table";
import { redact } from "@/features/audit/redact";

export const metadata: Metadata = { title: "سجل التدقيق" };

/** UTC instant of 00:00 on `key` in timezone `tz`. */
function zonedDayStart(key: string, tz: string): Date {
  const utcMidnight = fromDateKey(key);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(utcMidnight);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  const offset = asUtc - utcMidnight.getTime();
  return new Date(utcMidnight.getTime() - offset);
}

const actionLabel = (a: string) => AUDIT_ACTION_LABELS[a] ?? a;

export default async function AuditLogsPage({ searchParams }: { searchParams: SearchParams }) {
  await requirePermission(PERMISSIONS.AUDIT_VIEW);
  const sp = await searchParams;
  const company = await getCompany();
  const { page, pageSize, skip, take } = pageParams(sp, 25);

  const action = str(sp.action);
  const entityType = str(sp.entity);
  const userId = str(sp.user);
  const q = str(sp.q);
  const from = str(sp.from);
  const to = str(sp.to);

  const createdAt: Prisma.DateTimeFilter = {};
  if (from && isDateKey(from)) createdAt.gte = zonedDayStart(from, company.timezone);
  if (to && isDateKey(to)) createdAt.lt = zonedDayStart(addDays(to, 1), company.timezone);

  const where: Prisma.AuditLogWhereInput = {
    ...(action ? { action } : {}),
    ...(entityType ? { entityType } : {}),
    ...(userId ? (userId === "system" ? { userId: null } : { userId }) : {}),
    ...(createdAt.gte || createdAt.lt ? { createdAt } : {}),
    ...(q
      ? {
          OR: [
            { entityId: { contains: q, mode: "insensitive" as const } },
            { reason: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [logs, total, actions, entities, userIds] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
    db.auditLog.count({ where }),
    db.auditLog.findMany({ distinct: ["action"], select: { action: true }, orderBy: { action: "asc" } }),
    db.auditLog.findMany({ distinct: ["entityType"], select: { entityType: true }, orderBy: { entityType: "asc" } }),
    db.auditLog.findMany({ distinct: ["userId"], select: { userId: true }, where: { userId: { not: null } } }),
  ]);
  const users = await db.user.findMany({
    where: { id: { in: userIds.map((u) => u.userId).filter((v): v is string => !!v) } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const rows: AuditRow[] = logs.map((l) => ({
    id: l.id,
    createdAt: l.createdAt.toISOString(),
    time: formatDateTimeAr(l.createdAt, company.timezone),
    userName: l.user?.name ?? null,
    userEmail: l.user?.email ?? null,
    action: l.action,
    actionLabel: actionLabel(l.action),
    entityType: l.entityType,
    entityId: l.entityId,
    reason: l.reason,
    ip: l.ip,
    userAgent: l.userAgent,
    before: redact(l.before),
    after: redact(l.after),
  }));

  const hasFilters = !!(action || entityType || userId || q || from || to);

  return (
    <>
      <PageHeader title="سجل التدقيق" description="كل تغيير حساس في النظام: من قام به، ومتى، وما الذي تغير" />
      <FilterBar>
        <SearchInput placeholder="بحث في المعرّف أو السبب…" />
        <SelectFilter
          param="action"
          placeholder="الإجراء"
          allLabel="كل الإجراءات"
          className="sm:w-52"
          options={actions.map((a) => ({ value: a.action, label: actionLabel(a.action) }))}
        />
        <SelectFilter param="entity" placeholder="نوع الكيان" allLabel="كل الكيانات" options={entities.map((e) => ({ value: e.entityType, label: e.entityType }))} />
        <SelectFilter
          param="user"
          placeholder="المستخدم"
          allLabel="كل المستخدمين"
          options={[...users.map((u) => ({ value: u.id, label: u.name })), { value: "system", label: "النظام (مهام آلية)" }]}
        />
        <DateRangeFilter />
      </FilterBar>
      {rows.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title={hasFilters ? "لا توجد سجلات مطابقة" : "لا توجد سجلات بعد"}
          description={hasFilters ? "جرّب تغيير عوامل التصفية أو نطاق التاريخ." : "ستظهر هنا التغييرات الحساسة فور حدوثها."}
        />
      ) : (
        <AuditTable rows={rows} timezone={company.timezone} />
      )}
      <Pager page={page} pageSize={pageSize} total={total} />
    </>
  );
}
