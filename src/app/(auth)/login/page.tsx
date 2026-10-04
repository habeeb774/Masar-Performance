import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { BarChart3, CheckCircle2, RefreshCw, Target } from "lucide-react";
import { LoginForm } from "./login-form";
import { safeNextPath, type SearchParams } from "@/lib/params";
import { isSetupCompleted } from "@/server/services/setup";
import { getCurrentUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "تسجيل الدخول" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  if (!(await isSetupCompleted())) redirect("/setup");
  const { next, setup } = await searchParams;
  // The only place that decides "already signed in → skip login": the same
  // DB-validated session check the (app) layout uses. Middleware only gates
  // on cookie *presence* for private routes — it must never redirect away
  // from /login itself, or a stale/invalid cookie causes a redirect loop
  // (middleware bounces /login → /dashboard, the layout's real check bounces
  // straight back since the session doesn't actually resolve).
  if (await getCurrentUser()) redirect(safeNextPath(next));
  return (
    <div className="grid min-h-svh bg-background lg:grid-cols-2">
      <div className="relative flex items-center justify-center px-5 py-10 sm:px-8 lg:min-h-svh lg:border-e lg:border-border/60 lg:px-10 xl:px-14">
        <div className="w-full max-w-[420px]">
          <div className="mb-10 flex items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-black shadow-sm">
              <Image src="/logo.png" alt="" width={44} height={44} className="size-full object-cover" priority />
            </span>
            <div>
              <p className="text-lg font-bold">مسار الأداء</p>
              <p className="text-xs text-muted-foreground">إدارة المتجر الإلكتروني</p>
            </div>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">السلام عليكم 👋</h1>
          <p className="mt-2 mb-7 text-sm leading-6 text-muted-foreground">سجّل الدخول لمتابعة أهدافك ومهامك وأدائك</p>
          {setup === "1" && (
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
              <CheckCircle2 className="size-4 shrink-0" />
              تم إنشاء حسابك بنجاح، سجّل الدخول للمتابعة
            </div>
          )}
          <LoginForm next={typeof next === "string" ? next : undefined} />
        </div>
      </div>
      <div className="relative hidden min-h-svh overflow-hidden bg-[#0A1836] p-10 text-white lg:flex lg:items-center lg:justify-center xl:p-16">
        <div className="absolute -top-24 -start-24 size-[28rem] rounded-full bg-blue-500/20 blur-3xl" aria-hidden />
        <div className="absolute -bottom-40 -end-20 size-[30rem] rounded-full bg-cyan-400/10 blur-3xl" aria-hidden />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_65%_20%,rgba(37,99,235,0.18),transparent_35%)]" aria-hidden />
        <div className="relative w-full max-w-lg">
          <p className="mb-4 text-sm font-semibold text-blue-200">نظام إدارة الأداء</p>
          <h2 className="max-w-xl text-3xl leading-[1.45] font-bold text-white xl:text-4xl">من الأهداف الشهرية إلى التقييم — في مسار واحد مؤتمت</h2>
          <p className="mt-5 max-w-xl text-sm leading-8 text-white/75">
            حدد الأهداف مرة واحدة، يعمل الفريق داخل Notion، ويجمع النظام الإنجاز ويولّد التقارير ويحسب التقييم تلقائيًا.
          </p>
          <ul className="mt-9 grid gap-3 text-sm">
            {[
              { icon: Target, text: "أهداف شهرية ← خطط أسبوعية ← مهام يومية" },
              { icon: RefreshCw, text: "مزامنة تلقائية للإنجاز من قواعد Notion" },
              { icon: CheckCircle2, text: "تقارير أسبوعية وشهرية تتولد تلقائيًا" },
              { icon: BarChart3, text: "مؤشرات أداء تفصل الإنتاجية عن الجودة" },
            ].map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-3 text-white/90">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/10">
                  <Icon className="size-4 text-blue-100" />
                </span>
                <span className="leading-6">{text}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
