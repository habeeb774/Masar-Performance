import type { Metadata } from "next";
import { LogOut, MonitorSmartphone } from "lucide-react";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { getCompany } from "@/server/services/company";
import { revokeOtherSessionsAction } from "@/actions/account";
import { formatDateAr, formatDateTimeAr } from "@/lib/dates";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { KeyValue, PageHeader } from "@/components/shared/page";
import { StatusBadge } from "@/components/shared/status-badge";
import { ActionButton } from "@/components/shared/action-button";
import { ChangePasswordForm } from "@/features/settings/change-password-form";
import { describeUserAgent } from "@/features/settings/user-agent";

export const metadata: Metadata = { title: "حسابي" };

export default async function AccountPage() {
  const user = await requireUser();
  const company = await getCompany();
  const [profile, sessions] = await Promise.all([
    db.user.findUniqueOrThrow({
      where: { id: user.id },
      select: {
        name: true,
        email: true,
        lastLoginAt: true,
        passwordSetAt: true,
        role: { select: { name: true } },
        employee: {
          select: {
            fullName: true,
            employeeNo: true,
            hireDate: true,
            jobTitle: { select: { name: true } },
            department: { select: { name: true } },
            manager: { select: { fullName: true } },
          },
        },
      },
    }),
    db.session.findMany({
      where: { userId: user.id, expiresAt: { gt: new Date() } },
      orderBy: { lastSeenAt: "desc" },
      select: { id: true, createdAt: true, lastSeenAt: true, ip: true, userAgent: true },
    }),
  ]);
  const others = sessions.filter((s) => s.id !== user.sessionId).length;
  const tz = company.timezone;

  return (
    <>
      <PageHeader title="حسابي" description="بياناتك الشخصية، كلمة المرور، والأجهزة المسجلة" />
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">الملف الشخصي</CardTitle>
            <CardDescription>لتعديل هذه البيانات تواصل مع مدير النظام</CardDescription>
          </CardHeader>
          <CardContent className="divide-y">
            <KeyValue label="الاسم">{profile.employee?.fullName ?? profile.name}</KeyValue>
            <KeyValue label="البريد الإلكتروني">
              <span dir="ltr">{profile.email}</span>
            </KeyValue>
            <KeyValue label="الدور">{profile.role.name}</KeyValue>
            <KeyValue label="المسمى الوظيفي">{profile.employee?.jobTitle?.name ?? "—"}</KeyValue>
            <KeyValue label="الإدارة / القسم">{profile.employee?.department?.name ?? "—"}</KeyValue>
            <KeyValue label="المدير المباشر">{profile.employee?.manager?.fullName ?? "—"}</KeyValue>
            {profile.employee?.employeeNo && <KeyValue label="الرقم الوظيفي">{profile.employee.employeeNo}</KeyValue>}
            {profile.employee?.hireDate && <KeyValue label="تاريخ التعيين">{formatDateAr(profile.employee.hireDate)}</KeyValue>}
            <KeyValue label="آخر تسجيل دخول">{formatDateTimeAr(profile.lastLoginAt, tz)}</KeyValue>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">تغيير كلمة المرور</CardTitle>
            <CardDescription>آخر تغيير: {formatDateTimeAr(profile.passwordSetAt, tz)} — سيتم تسجيل خروجك من الأجهزة الأخرى بعد التغيير.</CardDescription>
          </CardHeader>
          <CardContent>
            <ChangePasswordForm />
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-base">الجلسات النشطة</CardTitle>
              <CardDescription>الأجهزة والمتصفحات المسجل دخولها إلى حسابك حاليًا</CardDescription>
            </div>
            <ActionButton
              variant="outline"
              disabled={others === 0}
              action={revokeOtherSessionsAction}
              confirm={{
                title: "تسجيل الخروج من الأجهزة الأخرى؟",
                description: `سيتم إنهاء ${others} جلسة على أجهزة أخرى، وتبقى هذه الجلسة فقط.`,
                confirmLabel: "تسجيل الخروج",
                destructive: true,
              }}
            >
              <LogOut /> تسجيل الخروج من الأجهزة الأخرى
            </ActionButton>
          </CardHeader>
          <CardContent>
            <ul className="divide-y rounded-lg border">
              {sessions.map((s) => {
                const current = s.id === user.sessionId;
                return (
                  <li key={s.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:gap-4">
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                      <MonitorSmartphone className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{describeUserAgent(s.userAgent)}</span>
                        {current && <StatusBadge tone="success">هذه الجلسة</StatusBadge>}
                      </div>
                      <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground" dir="ltr" title={s.userAgent ?? undefined}>
                        {s.ip ?? "IP غير معروف"}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 text-xs text-muted-foreground sm:text-end">
                      <span>بدأت: {formatDateTimeAr(s.createdAt, tz)}</span>
                      <span>آخر نشاط: {formatDateTimeAr(s.lastSeenAt, tz)}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
