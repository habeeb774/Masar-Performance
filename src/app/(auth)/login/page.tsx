import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
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
  // one centered card: logo, «تسجيل الدخول», the form — nothing to read before signing in
  return (
    <div className="grid min-h-svh place-items-center bg-background px-5 py-10">
      <div className="w-full max-w-[380px]">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <span className="grid size-14 place-items-center overflow-hidden rounded-2xl bg-black shadow-sm">
            <Image src="/logo.png" alt="" width={56} height={56} className="size-full object-cover" priority />
          </span>
          <p className="text-xl font-bold">مسار الأداء</p>
        </div>
        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          <h1 className="mb-5 text-lg font-semibold">تسجيل الدخول</h1>
          {setup === "1" && (
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
              <CheckCircle2 className="size-4 shrink-0" />
              تم إنشاء حسابك بنجاح، سجّل الدخول للمتابعة
            </div>
          )}
          <LoginForm next={typeof next === "string" ? next : undefined} />
        </div>
      </div>
    </div>
  );
}
