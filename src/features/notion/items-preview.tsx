import { ExternalLink, Layers } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { EmptyState } from "@/components/shared/page";
import { EnumBadge } from "@/components/shared/status-badge";
import { NOTION_STATUS_LABELS } from "@/lib/labels";
import { formatDateAr } from "@/lib/dates";
import { formatNumber } from "@/lib/num";

export interface PreviewItem {
  id: string;
  title: string;
  url: string | null;
  batch: string | null;
  batchNumber: number | null;
  productCode: string | null;
  itemDate: string | null;
  employeeName: string | null;
  stages: { stageKey: string; systemStatus: string; rawValues: string[] }[];
}

/** Read-only table of the latest synced items with each stage's derived status. */
export function ItemsPreview({ items, stages }: { items: PreviewItem[]; stages: { stageKey: string; label: string }[] }) {
  if (items.length === 0) {
    return <EmptyState icon={Layers} title="لا توجد عناصر متزامنة بعد" description="بعد أول مزامنة تظهر هنا آخر 20 عنصرًا مع حالة كل مرحلة كما يفهمها النظام." className="py-8" />;
  }
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader className="bg-muted/40">
          <TableRow>
            <TableHead className="text-start">العنصر</TableHead>
            <TableHead className="text-start">الدفعة</TableHead>
            <TableHead className="text-start">كود المنتج</TableHead>
            <TableHead className="text-start">التاريخ</TableHead>
            <TableHead className="text-start">الموظف</TableHead>
            {stages.map((s) => (
              <TableHead key={s.stageKey} className="text-start whitespace-nowrap">
                {s.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="max-w-64">
                {item.url ? (
                  <a href={item.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium hover:text-primary hover:underline">
                    <span className="truncate">{item.title || "بدون عنوان"}</span>
                    <ExternalLink className="size-3 shrink-0" />
                  </a>
                ) : (
                  <span className="font-medium">{item.title || "بدون عنوان"}</span>
                )}
              </TableCell>
              <TableCell className="text-sm">{item.batch ?? (item.batchNumber !== null ? formatNumber(item.batchNumber, 2) : "—")}</TableCell>
              <TableCell>
                {item.productCode ? (
                  <code dir="ltr" className="font-mono text-xs">
                    {item.productCode}
                  </code>
                ) : (
                  "—"
                )}
              </TableCell>
              <TableCell className="text-xs whitespace-nowrap">{formatDateAr(item.itemDate)}</TableCell>
              <TableCell className="text-sm">{item.employeeName ?? <span className="text-muted-foreground">—</span>}</TableCell>
              {stages.map((s) => {
                const st = item.stages.find((x) => x.stageKey === s.stageKey);
                if (!st) return <TableCell key={s.stageKey} className="text-muted-foreground">—</TableCell>;
                return (
                  <TableCell key={s.stageKey}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="cursor-help">
                          <EnumBadge map={NOTION_STATUS_LABELS} value={st.systemStatus} />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>{st.rawValues.length ? `في Notion: ${st.rawValues.join("، ")}` : "فارغ في Notion"}</TooltipContent>
                    </Tooltip>
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
