"use client";

import { useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

function fileNameFrom(disposition: string | null, fallback: string) {
  const m = disposition?.match(/filename\*=UTF-8''([^;]+)/i);
  return m ? decodeURIComponent(m[1]) : fallback;
}

/** Downloads an HR export; server errors (e.g. no KPIs this month) show as a toast. */
export function ExportExcelButton({
  href,
  label,
  fallbackName,
  size = "sm",
  variant = "outline",
}: {
  href: string;
  label: string;
  fallbackName: string;
  size?: "sm" | "default" | "xs";
  variant?: "outline" | "ghost" | "default";
}) {
  const [pending, setPending] = useState(false);

  const download = async () => {
    setPending(true);
    try {
      const res = await fetch(href);
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(body?.error ?? "تعذر إنشاء الملف");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileNameFrom(res.headers.get("content-disposition"), fallbackName);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("تعذر الاتصال بالخادم");
    } finally {
      setPending(false);
    }
  };

  return (
    <Button type="button" size={size} variant={variant} onClick={download} disabled={pending}>
      {pending ? <Spinner /> : <FileSpreadsheet />} {label}
    </Button>
  );
}
