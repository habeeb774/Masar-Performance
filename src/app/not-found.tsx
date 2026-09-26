import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-3 px-4 text-center">
      <span className="grid size-14 place-items-center rounded-full bg-muted text-muted-foreground">
        <SearchX className="size-7" />
      </span>
      <h1 className="text-xl font-bold">الصفحة غير موجودة</h1>
      <p className="text-sm text-muted-foreground">ربما تم حذف السجل أو أن الرابط غير صحيح.</p>
      <Button asChild>
        <Link href="/dashboard">العودة للوحة التحكم</Link>
      </Button>
    </div>
  );
}
