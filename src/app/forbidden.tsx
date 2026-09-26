import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Forbidden() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-3 px-4 text-center">
      <span className="grid size-14 place-items-center rounded-full bg-danger-soft text-danger">
        <ShieldAlert className="size-7" />
      </span>
      <h1 className="text-xl font-bold">لا تملك صلاحية الوصول</h1>
      <p className="max-w-md text-sm text-muted-foreground">هذه الصفحة تتطلب صلاحيات إضافية. تواصل مع مدير النظام إذا كنت تحتاجها.</p>
      <Button asChild>
        <Link href="/dashboard">العودة للوحة التحكم</Link>
      </Button>
    </div>
  );
}
