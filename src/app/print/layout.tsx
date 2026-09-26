import type { Metadata } from "next";
import { requireUser } from "@/server/auth/session";
import { getCompany } from "@/server/services/company";
import { formatDateTimeAr } from "@/lib/dates";

export const metadata: Metadata = { title: "نسخة للطباعة", robots: { index: false, follow: false } };

const PRINT_CSS = `
  .print-page { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .print-page .report-section { box-shadow: none; }
  @media print {
    .print-page { padding: 0 !important; max-width: none !important; }
    .print-page .report-section { break-inside: avoid-page; border-color: #d4d4d8; }
    .print-page table { font-size: 11px; }
    .print-page a { color: inherit; text-decoration: none; }
  }
`;

/** Minimal A4-friendly shell for printable pages (no sidebar / header). */
export default async function PrintLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const company = await getCompany();
  return (
    <div className="min-h-screen bg-white text-zinc-900" style={{ colorScheme: "light" }}>
      <style>{PRINT_CSS}</style>
      <div className="print-page mx-auto max-w-[210mm] px-6 py-8">
        <header className="mb-6 flex items-end justify-between gap-4 border-b-2 border-zinc-900 pb-3">
          <div>
            <p className="text-lg font-bold">{company.name}</p>
            <p className="text-xs text-zinc-500">مركز الإدارة والتقييم</p>
          </div>
          <p className="text-[11px] text-zinc-500">
            طُبع بواسطة {user.employeeName ?? user.name} — {formatDateTimeAr(new Date(), company.timezone)}
          </p>
        </header>
        {children}
      </div>
    </div>
  );
}
