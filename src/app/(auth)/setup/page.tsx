import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Building2, ShieldCheck } from "lucide-react";
import { isSetupCompleted } from "@/server/services/setup";
import { SetupForm } from "./setup-form";

export const metadata: Metadata = { title: "إعداد النظام" };
export const dynamic = "force-dynamic";

/** One-time first-run wizard: names the company and turns the seeded placeholder admin into a real account. */
export default async function SetupPage() {
  if (await isSetupCompleted()) redirect("/login");

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-xl bg-primary text-primary-foreground shadow-[var(--shadow-raised)]">
              <ShieldCheck className="size-5" />
            </span>
            <div>
              <p className="text-lg font-bold">مسار الأداء</p>
              <p className="text-xs text-muted-foreground">إعداد النظام لأول مرة</p>
            </div>
          </div>
          <h1 className="text-2xl font-bold">مرحبًا بك 👋</h1>
          <p className="mt-1 mb-6 text-sm text-muted-foreground">هذه هي المرة الأولى التي يُفتح فيها النظام. أنشئ حساب مدير النظام الحقيقي لتبدأ.</p>
          <SetupForm />
        </div>
      </div>
      <div className="relative hidden overflow-hidden bg-sidebar p-12 text-sidebar-foreground lg:flex lg:flex-col lg:justify-center">
        <div className="absolute -top-24 -start-24 size-96 rounded-full bg-sidebar-primary/10 blur-3xl" aria-hidden />
        <div className="relative max-w-md">
          <span className="mb-4 grid size-12 place-items-center rounded-xl bg-sidebar-primary/10">
            <Building2 className="size-6 text-sidebar-primary" />
          </span>
          <h2 className="text-3xl leading-snug font-bold">خطوة واحدة وتبدأ</h2>
          <p className="mt-4 text-sm leading-7 text-sidebar-foreground/70">
            بعد إنشاء حساب المدير، سجّل الدخول به وأضف موظفيك الحقيقيين من صفحة «الموظفون»، واربط Notion من صفحة الاتصالات، وراجع مؤشرات الأداء
            الافتراضية قبل أول تقييم شهري.
          </p>
          <p className="mt-6 text-xs text-sidebar-foreground/50">هذه الصفحة تعمل مرة واحدة فقط ثم تُغلق تلقائيًا.</p>
        </div>
      </div>
    </div>
  );
}
