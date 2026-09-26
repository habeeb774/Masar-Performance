"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, ChevronDown, Copy, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

/** Collapsible plain-text version of the report with a copy button (for WhatsApp / email). */
export function GeneratedTextBlock({ text, defaultOpen = false }: { text: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("تم نسخ النص");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("تعذر النسخ — انسخ النص يدويًا");
    }
  };
  return (
    <Card className="no-print gap-0 py-0">
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex items-center justify-between gap-2 px-4 py-3">
          <CollapsibleTrigger asChild>
            <button type="button" className="flex items-center gap-2 text-sm font-semibold">
              <FileText className="size-4 text-muted-foreground" />
              النص المولد
              <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")} />
            </button>
          </CollapsibleTrigger>
          <Button size="sm" variant="outline" onClick={copy} disabled={!text}>
            {copied ? <Check /> : <Copy />} نسخ
          </Button>
        </div>
        <CollapsibleContent>
          <CardContent className="px-4 pb-4">
            <pre className="max-h-[480px] overflow-auto rounded-lg bg-muted/60 p-3 font-sans text-sm leading-7 whitespace-pre-wrap" dir="rtl">
              {text || "—"}
            </pre>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
