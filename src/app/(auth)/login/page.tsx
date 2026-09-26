import type { Metadata } from "next";
import { BarChart3, CheckCircle2, RefreshCw, Target } from "lucide-react";
import { LoginForm } from "./login-form";
import type { SearchParams } from "@/lib/params";

export const metadata: Metadata = { title: "تسجيل الدخول" };

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const { next } = await searchParams;
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <Target className="size-5" />
            </span>
            <div>
              <p className="text-lg font-bold">مركز الإدارة والتقييم</p>
              <p className="text-xs text-muted-foreground">إدارة المتجر الإلكتروني</p>
            </div>
          </div>
          <h1 className="text-2xl font-bold">السلام عليكم 👋</h1>
          <p className="mt-1 mb-6 text-sm text-muted-foreground">سجّل الدخول لمتابعة أهدافك ومهامك وأدائك</p>
          <LoginForm next={typeof next === "string" ? next : undefined} />
        </div>
      </div>
      <div className="relative hidden overflow-hidden bg-sidebar p-12 text-sidebar-foreground lg:flex lg:flex-col lg:justify-center">
        <div className="absolute -top-24 -start-24 size-96 rounded-full bg-sidebar-primary/20 blur-3xl" aria-hidden />
        <div className="absolute -bottom-32 -end-16 size-96 rounded-full bg-sidebar-primary/10 blur-3xl" aria-hidden />
        <div className="relative max-w-md">
          <h2 className="text-3xl leading-snug font-bold text-white">من الأهداف الشهرية إلى التقييم — في مسار واحد مؤتمت</h2>
          <p className="mt-4 text-sm leading-7 text-sidebar-foreground/80">
            حدد الأهداف مرة واحدة، يعمل الفريق داخل Notion، ويجمع النظام الإنجاز ويولّد التقارير ويحسب التقييم تلقائيًا.
          </p>
          <ul className="mt-8 space-y-4 text-sm">
            {[
              { icon: Target, text: "أهداف شهرية ← خطط أسبوعية ← مهام يومية" },
              { icon: RefreshCw, text: "مزامنة تلقائية للإنجاز من قواعد Notion" },
              { icon: CheckCircle2, text: "تقارير أسبوعية وشهرية تتولد تلقائيًا" },
              { icon: BarChart3, text: "مؤشرات أداء تفصل الإنتاجية عن الجودة" },
            ].map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3">
                <span className="grid size-8 place-items-center rounded-lg bg-white/10">
                  <Icon className="size-4 text-white" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
