import Link from "next/link";
import { ArrowLeft, CheckCircle2, Circle, ExternalLink } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface OnboardingState {
  connection: boolean;
  connectionOk: boolean;
  dataSource: boolean;
  fields: boolean;
  statuses: boolean;
  firstSync: boolean;
}

/** Step-by-step explanation of how to connect the store's Notion database. */
export function NotionSetupSteps({ className }: { className?: string }) {
  const steps: { title: string; body: React.ReactNode }[] = [
    {
      title: "أنشئ تكاملًا داخليًا في Notion",
      body: (
        <>
          افتح{" "}
          <a href="https://www.notion.so/my-integrations" target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline" dir="ltr">
            notion.so/my-integrations <ExternalLink className="size-3" />
          </a>{" "}
          ثم «New integration» واختر مساحة العمل، ونوع التكامل «Internal». يكفي منحه صلاحية القراءة (Read content).
        </>
      ),
    },
    {
      title: "انسخ رمز التكامل",
      body: (
        <>
          من تبويب «Configuration» انسخ «Internal Integration Secret» — يبدأ عادةً بـ <code dir="ltr" className="rounded bg-muted px-1 text-[11px]">ntn_</code>. يُحفظ الرمز مشفّرًا ولا يُعرض مرة أخرى.
        </>
      ),
    },
    {
      title: "شارك قاعدة البيانات مع التكامل",
      body: <>افتح قاعدة «إضافة المنتجات للمتجر» في Notion ← القائمة ⋯ أعلى الصفحة ← «Connections» ← أضف التكامل الذي أنشأته. بدون هذه الخطوة لن يتمكن النظام من رؤية القاعدة.</>,
    },
    {
      title: "أضف الاتصال هنا ثم الصق رابط القاعدة",
      body: <>من «الاتصالات» الصق الرمز واختبره، ثم من «قواعد البيانات» الصق رابط القاعدة (Copy link) ليكتشف النظام خصائصها، وطبّق الربط المقترح.</>,
    },
  ];
  return (
    <ol className={cn("space-y-3", className)}>
      {steps.map((s, i) => (
        <li key={s.title} className="flex gap-3">
          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">{i + 1}</span>
          <div className="min-w-0">
            <p className="text-sm font-medium">{s.title}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{s.body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function OnboardingChecklist({ state, canManage }: { state: OnboardingState; canManage: boolean }) {
  const items = [
    { done: state.connection, title: "إضافة اتصال Notion", hint: state.connection && !state.connectionOk ? "الاتصال غير مُتحقق — اختبره" : "رمز التكامل الداخلي", href: "/notion/connections" },
    { done: state.dataSource, title: "إضافة قاعدة البيانات", hint: "الصق رابط القاعدة واختر مصدر البيانات", href: "/notion/data-sources" },
    { done: state.fields, title: "ربط الحقول", hint: "العنوان وحقول حالات المراحل على الأقل", href: "/notion/mappings" },
    { done: state.statuses, title: "ربط الحالات", hint: "تحويل قيم Notion إلى حالات النظام", href: "/notion/mappings" },
    { done: state.firstSync, title: "أول مزامنة ناجحة", hint: "اضغط «مزامنة الآن» على القاعدة", href: "/notion/data-sources" },
  ];
  const doneCount = items.filter((i) => i.done).length;
  const nextIndex = items.findIndex((i) => !i.done);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">خطوات إعداد التكامل</CardTitle>
        <CardDescription>
          أُنجز {doneCount} من {items.length} — بعد اكتمالها تُحتسب أهداف الموظفين تلقائيًا من Notion.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-2">
        <ul className="space-y-1.5">
          {items.map((item, i) => {
            const isNext = i === nextIndex;
            const body = (
              <div
                className={cn(
                  "flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors",
                  item.done ? "border-success/25 bg-success-soft/40" : isNext ? "border-primary/40 bg-primary/5" : "border-border",
                  canManage && "hover:bg-accent/40",
                )}
              >
                {item.done ? <CheckCircle2 className="size-4.5 shrink-0 text-success" /> : <Circle className={cn("size-4.5 shrink-0", isNext ? "text-primary" : "text-muted-foreground")} />}
                <div className="min-w-0 flex-1">
                  <p className={cn("text-sm font-medium", item.done && "text-success")}>{item.title}</p>
                  <p className="text-xs text-muted-foreground">{item.hint}</p>
                </div>
                {canManage && isNext && <ArrowLeft className="size-4 text-primary" />}
              </div>
            );
            return <li key={item.title}>{canManage ? <Link href={item.href}>{body}</Link> : body}</li>;
          })}
        </ul>
        <div className="rounded-xl border border-dashed p-4">
          <p className="mb-3 text-sm font-semibold">كيف أربط قاعدة Notion؟</p>
          <NotionSetupSteps />
          {canManage && nextIndex >= 0 && (
            <Button className="mt-4" size="sm" asChild>
              <Link href={items[nextIndex].href}>
                {items[nextIndex].title} <ArrowLeft />
              </Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
