import Link from "next/link";
import { ArrowRight, FileDown, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Back link + print / PDF buttons (open the chrome-less print route in a new tab). */
export function ReportToolbar({ backHref, backLabel, printHref }: { backHref: string; backLabel: string; printHref: string }) {
  return (
    <div className="no-print flex flex-wrap items-center gap-2">
      <Button variant="ghost" size="sm" asChild>
        <Link href={backHref}>
          <ArrowRight /> {backLabel}
        </Link>
      </Button>
      <Button variant="outline" size="sm" asChild>
        <a href={printHref} target="_blank" rel="noopener">
          <Printer /> طباعة
        </a>
      </Button>
      <Button variant="outline" size="sm" asChild>
        <a href={`${printHref}?print=1`} target="_blank" rel="noopener" title="اختر «حفظ بتنسيق PDF» في نافذة الطباعة">
          <FileDown /> تصدير PDF
        </a>
      </Button>
    </div>
  );
}
