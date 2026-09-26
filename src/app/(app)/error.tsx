"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <span className="grid size-14 place-items-center rounded-full bg-danger-soft text-danger">
        <AlertTriangle className="size-7" />
      </span>
      <h1 className="text-lg font-bold">حدث خطأ أثناء تحميل الصفحة</h1>
      <p className="max-w-md text-sm text-muted-foreground">حاول مرة أخرى. إذا تكرر الخطأ تواصل مع مدير النظام{error.digest ? ` (رمز: ${error.digest})` : ""}.</p>
      <Button onClick={reset}>
        <RotateCcw /> إعادة المحاولة
      </Button>
    </div>
  );
}
