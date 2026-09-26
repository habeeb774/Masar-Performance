import Link from "next/link";
import { ArrowLeft, CheckCircle2, Circle } from "lucide-react";
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

/** Connect Notion → select database → confirm & sync. */
export function OnboardingChecklist({ state, canManage }: { state: OnboardingState; canManage: boolean }) {
  const items = [
    { done: state.connection && state.connectionOk, title: "ربط Notion", hint: state.connection && !state.connectionOk ? "الاتصال يحتاج إعادة ربط" : "خطوة واحدة عبر حسابك في Notion" },
    { done: state.dataSource, title: "اختيار قاعدة البيانات", hint: "من قائمة القواعد المتاحة — بدون روابط أو معرّفات" },
    { done: state.firstSync, title: "التأكيد وبدء المزامنة", hint: "يقترح النظام ربط الحقول والحالات تلقائيًا" },
  ];
  const doneCount = items.filter((i) => i.done).length;
  const nextIndex = items.findIndex((i) => !i.done);
  const href = state.connection && !state.connectionOk ? "/notion/connections" : "/notion/connect";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">ابدأ بربط Notion</CardTitle>
        <CardDescription>
          أُنجز {doneCount} من {items.length} — بعدها تُحتسب أهداف الموظفين تلقائيًا من Notion.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ol className="grid gap-2 md:grid-cols-3">
          {items.map((item, i) => {
            const isNext = i === nextIndex;
            return (
              <li
                key={item.title}
                className={cn(
                  "flex items-center gap-3 rounded-xl border px-3 py-3",
                  item.done ? "border-success/25 bg-success-soft/40" : isNext ? "border-primary/40 bg-primary/5" : "border-border",
                )}
              >
                {item.done ? <CheckCircle2 className="size-5 shrink-0 text-success" /> : <Circle className={cn("size-5 shrink-0", isNext ? "text-primary" : "text-muted-foreground")} />}
                <div className="min-w-0">
                  <p className={cn("text-sm font-medium", item.done && "text-success")}>{item.title}</p>
                  <p className="text-xs text-muted-foreground">{item.hint}</p>
                </div>
              </li>
            );
          })}
        </ol>
        {canManage && nextIndex >= 0 && (
          <Button asChild>
            <Link href={href}>
              {items[nextIndex].title} <ArrowLeft />
            </Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
