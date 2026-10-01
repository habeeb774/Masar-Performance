import { formatDateAr, monthLabel } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { DutyRow, EvaluationData } from "./types";

/** Numbers as in the manager's sheet: up to 3 decimals, no trailing zeros (88.125, 35.25, 96). */
export const fmt = (n: number) => String(Math.round(n * 1000) / 1000);

const th = "border border-zinc-300 bg-zinc-100 px-2 py-1.5 text-xs font-semibold dark:border-zinc-700 dark:bg-zinc-800";
const td = "border border-zinc-300 px-2 py-1.5 align-top text-sm dark:border-zinc-700";

export function EvaluationHeader({ data }: { data: EvaluationData }) {
  return (
    <table className="w-full border-collapse">
      <tbody>
        <tr>
          <th colSpan={4} className={cn(th, "text-center text-base")}>
            نموذج تقييم أداء بشكل شهري — {monthLabel(data.year, data.month)}
          </th>
        </tr>
        <tr>
          <th className={cn(th, "w-40 text-start")}>اسم الموظف</th>
          <td className={td}>{data.employeeName}</td>
          <th className={cn(th, "w-32 text-start")}>فترة التقييم</th>
          <td className={td}>
            من {formatDateAr(data.periodStart)} إلى {formatDateAr(data.periodEnd)}
          </td>
        </tr>
        <tr>
          <th className={cn(th, "text-start")}>المسمى الوظيفي</th>
          <td className={td}>{data.jobTitle ?? "—"}</td>
          <th className={cn(th, "text-start")}>الإدارة</th>
          <td className={td}>{data.department ?? "—"}</td>
        </tr>
      </tbody>
    </table>
  );
}

/** One duty, read-only, in the sheet's column order. */
export function DutyTable({ duty }: { duty: DutyRow }) {
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr>
          <th colSpan={8} className={cn(th, "text-start text-sm")}>
            {duty.title}
          </th>
        </tr>
        <tr>
          <th className={cn(th, "text-start")}>مؤشر الأداء</th>
          <th className={cn(th, "text-start")}>المؤشر</th>
          <th className={cn(th, "text-start")}>ملاحظات</th>
          <th className={th}>المحقق</th>
          <th className={th}>من أصل</th>
          <th className={th}>الوزن</th>
          <th className={th}>الدرجة</th>
          <th className={th}>المعدل</th>
        </tr>
      </thead>
      <tbody>
        {duty.indicators.map((i) => (
          <tr key={i.id} className={i.weight === 0 ? "text-zinc-400" : undefined}>
            <td className={cn(td, "font-medium")}>{i.title}</td>
            <td className={cn(td, "text-xs")}>{i.description ?? ""}</td>
            <td className={cn(td, "text-xs")}>{i.notes ?? ""}</td>
            <td className={cn(td, "text-center tabular-nums")}>{fmt(i.achieved)}</td>
            <td className={cn(td, "text-center tabular-nums")}>{fmt(i.target)}</td>
            <td className={cn(td, "text-center tabular-nums")}>{fmt(i.weight)}</td>
            <td className={cn(td, "text-center tabular-nums")}>{fmt(i.score)}</td>
            <td className={cn(td, "text-center tabular-nums")}>{fmt(i.weightedScore)}</td>
          </tr>
        ))}
        {duty.indicators.length === 0 && (
          <tr>
            <td colSpan={8} className={cn(td, "text-center text-xs text-zinc-500")}>
              لا توجد مؤشرات
            </td>
          </tr>
        )}
        <DutyTotalRow duty={duty} />
      </tbody>
    </table>
  );
}

export function DutyTotalRow({ duty }: { duty: DutyRow }) {
  const weights = duty.indicators.reduce((a, i) => a + i.weight, 0);
  const scores = duty.indicators.reduce((a, i) => a + i.score, 0);
  return (
    <tr className="bg-zinc-50 font-semibold dark:bg-zinc-900">
      <td colSpan={5} className={td}>
        إجمالي نتيجة {duty.title.split(":")[0]}
      </td>
      <td className={cn(td, "text-center tabular-nums", Math.abs(weights - 100) > 0.005 && "text-red-600")}>{fmt(weights)}</td>
      <td className={cn(td, "text-center tabular-nums")}>{fmt(scores)}</td>
      <td className={cn(td, "text-center tabular-nums")}>{fmt(duty.score)}</td>
    </tr>
  );
}

/** «النتيجة النهائية»: duty | weight | duty result | final rate, then the final score and the rating. */
export function FinalSummary({ data }: { data: EvaluationData }) {
  const weights = data.duties.reduce((a, d) => a + d.weight, 0);
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr>
          <th className={cn(th, "text-start")}>النتيجة النهائية</th>
          <th className={th}>الوزن</th>
          <th className={th}>المعدلات</th>
          <th className={th}>المعدل النهائي</th>
        </tr>
      </thead>
      <tbody>
        {data.duties.map((d) => (
          <tr key={d.id}>
            <td className={td}>{d.title}</td>
            <td className={cn(td, "text-center tabular-nums")}>{fmt(d.weight)}</td>
            <td className={cn(td, "text-center tabular-nums")}>{fmt(d.score)}</td>
            <td className={cn(td, "text-center tabular-nums")}>{fmt(d.rate)}</td>
          </tr>
        ))}
        <tr className="bg-zinc-50 font-bold dark:bg-zinc-900">
          <td className={td}>النتيجة النهائية</td>
          <td className={cn(td, "text-center tabular-nums", Math.abs(weights - 100) > 0.005 && "text-red-600")}>{fmt(weights)}</td>
          <td className={td} />
          <td className={cn(td, "text-center text-base tabular-nums")}>
            {fmt(data.finalScore)}
            {data.overrideScore !== null && <span className="block text-xs font-normal text-zinc-500">معدّلة يدويًا (المحسوبة {fmt(data.computedScore)})</span>}
          </td>
        </tr>
        <tr className="font-bold">
          <td className={td}>التقدير العام</td>
          <td colSpan={3} className={cn(td, "text-center text-base")}>
            {data.ratingLabel}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

export function EvaluationSheet({ data }: { data: EvaluationData }) {
  return (
    <div className="space-y-5">
      <EvaluationHeader data={data} />
      {data.duties.map((d) => (
        <DutyTable key={d.id} duty={d} />
      ))}
      <FinalSummary data={data} />
      {data.managerNotes && (
        <div className="rounded border border-zinc-300 p-3 text-sm dark:border-zinc-700">
          <p className="mb-1 text-xs font-semibold text-zinc-500">ملاحظات المدير</p>
          <p className="whitespace-pre-wrap">{data.managerNotes}</p>
        </div>
      )}
    </div>
  );
}
