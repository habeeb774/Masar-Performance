import type { Metadata } from "next";
import { requirePermission } from "@/server/auth/session";
import { db } from "@/server/db";
import { PERMISSIONS } from "@/lib/permissions";
import { num } from "@/lib/num";
import { PageHeader } from "@/components/shared/page";
import { RatingScaleEditor } from "@/features/settings/rating-scale-editor";

export const metadata: Metadata = { title: "سلم التقييم" };

export default async function RatingScalePage() {
  await requirePermission(PERMISSIONS.RATING_SCALE_MANAGE);
  const scale =
    (await db.performanceRatingScale.findFirst({ where: { isActive: true }, orderBy: { updatedAt: "desc" }, include: { bands: { orderBy: { minScore: "desc" } } } })) ??
    (await db.performanceRatingScale.findFirst({ orderBy: { updatedAt: "desc" }, include: { bands: { orderBy: { minScore: "desc" } } } }));

  return (
    <>
      <PageHeader title="سلم التقييم" description="فئات التقدير التي تُعرض بجانب الدرجة النهائية لتقييم الأداء الشهري" />
      <RatingScaleEditor
        scaleId={scale?.isActive ? scale.id : null}
        isActive={scale?.isActive ?? false}
        initialName={scale?.name ?? "سلم التقييم الافتراضي"}
        initialBands={(scale?.bands ?? []).map((b) => ({ label: b.label, minScore: num(b.minScore), maxScore: num(b.maxScore), color: b.color }))}
      />
    </>
  );
}
