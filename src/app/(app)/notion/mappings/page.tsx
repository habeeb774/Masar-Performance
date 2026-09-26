import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Database, ListChecks } from "lucide-react";
import type { SearchParams } from "@/lib/params";
import { str } from "@/lib/params";
import { requirePermission } from "@/server/auth/session";
import { dataSourceOptions, getMappingsData } from "@/server/queries/notion";
import { PERMISSIONS } from "@/lib/permissions";
import { formatDateTimeAr } from "@/lib/dates";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState, NotionSyncedTag, PageHeader } from "@/components/shared/page";
import { DataSourcePicker } from "@/features/notion/data-source-picker";
import { FieldMappingsEditor } from "@/features/notion/field-mappings-editor";
import { StatusMappingsEditor } from "@/features/notion/status-mappings-editor";
import { ItemsPreview } from "@/features/notion/items-preview";

export const metadata: Metadata = { title: "ربط الحقول والحالات" };

export default async function NotionMappingsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requirePermission(PERMISSIONS.NOTION_MANAGE);
  const sp = await searchParams;
  const options = await dataSourceOptions();

  if (options.length === 0) {
    return (
      <>
        <PageHeader title="ربط الحقول والحالات" description="تحويل خصائص Notion وقيمها إلى أدوار وحالات يفهمها النظام." />
        <EmptyState
          icon={Database}
          title="لا توجد قاعدة بيانات لربطها"
          description="اربط Notion واختر القاعدة من القائمة — يقترح النظام ربط الحقول والحالات تلقائيًا، ويمكنك مراجعته هنا لاحقًا."
          action={
            <Button size="sm" asChild>
              <Link href="/notion/connect">ربط قاعدة بيانات</Link>
            </Button>
          }
        />
      </>
    );
  }

  const requested = str(sp.ds);
  const dsId = options.some((o) => o.value === requested) ? (requested as string) : options[0].value;
  const data = await getMappingsData(dsId);
  if (!data) {
    return <EmptyState icon={Database} title="قاعدة البيانات غير موجودة" />;
  }

  const unmappedTotal = data.statusFields.reduce((sum, f) => sum + f.rows.filter((r) => !r.systemStatus).length, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="ربط الحقول والحالات"
        description="حدد أي خاصية في Notion تمثل العنوان والدفعة والتاريخ وحالات مراحل العمل، ثم حوّل قيم كل حالة إلى حالات النظام."
        actions={<DataSourcePicker value={dsId} options={options} />}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ListChecks className="size-4.5 text-primary" /> ربط الحقول
          </CardTitle>
          <CardDescription>
            {data.dataSource.name} · {data.dataSource.connectionName} · {data.schema.length} خاصية
            {data.dataSource.schemaFetchedAt ? ` — آخر قراءة للخصائص ${formatDateTimeAr(new Date(data.dataSource.schemaFetchedAt))}` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.schema.length === 0 && (
            <p className="mb-4 flex items-start gap-2 rounded-lg bg-warning-soft/60 px-3 py-2 text-xs text-warning">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              لم تُقرأ خصائص هذه القاعدة من Notion بعد. اضغط «تحديث خصائص القاعدة» لعرض الخصائص وخياراتها.
            </p>
          )}
          <FieldMappingsEditor
            key={`${data.dataSource.id}:${data.fieldMappings.map((m) => m.id).join(",")}`}
            dataSourceId={data.dataSource.id}
            initial={data.fieldMappings}
            schema={data.schema}
            employees={data.employees}
            advanced={user.roleKey === "ADMIN"}
          />
        </CardContent>
      </Card>

      <Card id="status-mappings" className="scroll-mt-20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            ربط الحالات
            {unmappedTotal > 0 && <span className="rounded-full bg-warning-soft px-2 py-0.5 text-xs font-medium text-warning">{unmappedTotal} قيمة بدون ربط</span>}
          </CardTitle>
          <CardDescription>
            لكل مرحلة: القيم المعرفة في Notion + القيم التي ظهرت فعليًا في العناصر المتزامنة. القيم غير المربوطة تُعامل كـ «لم يبدأ» ولا تُحتسب في الإنجاز.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StatusMappingsEditor key={data.dataSource.id} fields={data.statusFields} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">معاينة العناصر</CardTitle>
          <CardDescription className="flex flex-wrap items-center gap-2">
            آخر 20 عنصرًا متزامنًا وحالة كل مرحلة كما يفهمها النظام — مرّر على الحالة لرؤية القيمة الأصلية. <NotionSyncedTag />
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ItemsPreview items={data.items} stages={data.stages} />
        </CardContent>
      </Card>
    </div>
  );
}
