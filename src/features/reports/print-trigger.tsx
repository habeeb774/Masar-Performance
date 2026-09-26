"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Calls window.print() once when the page is opened with ?print=1. Choosing
 * "Save as PDF" in the print dialog is the PDF export (the browser shapes the
 * Arabic text correctly, unlike most server-side PDF libraries).
 */
export function PrintTrigger() {
  const params = useSearchParams();
  const auto = params.get("print") === "1";
  useEffect(() => {
    if (!auto) return;
    const t = setTimeout(() => window.print(), 600);
    return () => clearTimeout(t);
  }, [auto]);
  return (
    <div className="no-print fixed bottom-4 start-4 z-50 flex gap-2">
      <Button onClick={() => window.print()} className="shadow-lg">
        <Printer /> طباعة / حفظ PDF
      </Button>
      <Button variant="outline" className="bg-background shadow-lg" onClick={() => window.close()}>
        إغلاق
      </Button>
    </div>
  );
}
