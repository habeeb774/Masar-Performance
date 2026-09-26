import "server-only";
import ExcelJS from "exceljs";
import { dutyHeading, dutyResult, sheetName, type ExportDuty } from "@/lib/performance-export";
import { PERFORMANCE_TEMPLATE_BASE64 } from "./performance-template";

export interface SheetHeader {
  employeeName: string;
  jobTitle: string;
  department: string;
  year: number;
  month: number;
  /** shown above the title when the review is not approved yet */
  draftNote: string | null;
  adjustment: number;
  adjustmentReason: string | null;
  managerNotes: string | null;
}

// prototype rows in the template's monthly sheet
const P = { title: 3, name: 4, period: 5, dates: 6, gap: 7, head1: 8, head2: 9, kpi: 10, adhoc: 30, subtotal: 14, dutyGap: 20, finalHead: 39, finalRow: 40, finalTotal: 44, rating: 45 } as const;
const COLS = 11;
const KPI_HEADER = "مؤشرات الأداء الرئيسية KPIs";

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v ?? {}));
const round2 = (n: number) => Math.round(n * 100) / 100;
const cap = (n: number) => Math.min(Math.max(n, 0), 100);

type Formula = { formula: string; result?: number | string };

export async function renderPerformanceWorkbook(header: SheetHeader, duties: ExportDuty[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(PERFORMANCE_TEMPLATE_BASE64, "base64") as unknown as ArrayBuffer);
  const ratings = wb.worksheets[0];
  const proto = wb.getWorksheet("proto")!;

  const ws = wb.addWorksheet(sheetName(header.year, header.month), {
    views: [{ rightToLeft: true, zoomScale: 83, showGridLines: true }],
    properties: clone(proto.properties),
  });
  for (let c = 1; c <= 13; c++) ws.getColumn(c).width = proto.getColumn(c).width;

  const copyRow = (from: number, to: number) => {
    const src = proto.getRow(from);
    const dst = ws.getRow(to);
    if (src.height) dst.height = src.height;
    for (let c = 1; c <= COLS; c++) dst.getCell(c).style = clone(src.getCell(c).style);
  };
  const set = (addr: string, value: ExcelJS.CellValue) => {
    ws.getCell(addr).value = value;
  };
  const f = (formula: string, result: number | string): Formula => ({ formula, result });

  // ---- title + employee header
  const hasDraft = !!header.draftNote;
  if (hasDraft) {
    const c = ws.getCell("B2");
    c.value = header.draftNote;
    c.font = { bold: true, color: { argb: "FFC00000" }, size: 14 };
    c.alignment = { horizontal: "center", vertical: "middle" };
    ws.mergeCells("B2:J2");
    ws.getRow(2).height = 28;
  }
  copyRow(P.title, 3);
  set("B3", "نموذج تقييم أداء بشكل شهري");
  ws.mergeCells("B3:J3");

  copyRow(P.name, 4);
  set("B4", "اسم الموظف");
  set("C4", header.employeeName);
  set("E4", "فترة التقييم ");
  ws.mergeCells("C4:D4");
  ws.mergeCells("E4:J4");

  copyRow(P.period, 5);
  set("B5", "المسمى الوظيفي");
  set("C5", header.jobTitle);
  set("E5", "من");
  set("H5", "إلى");
  ws.mergeCells("C5:D5");
  ws.mergeCells("E5:G5");
  ws.mergeCells("H5:J5");

  copyRow(P.dates, 6);
  set("B6", "الإدارة / الإدارة العامة ");
  set("C6", header.department);
  set("E6", new Date(Date.UTC(header.year, header.month - 1, 1)));
  set("H6", new Date(Date.UTC(header.year, header.month, 0)));
  ws.mergeCells("C6:D6");
  ws.mergeCells("E6:G6");
  ws.mergeCells("H6:J6");
  copyRow(P.gap, 7);

  // ---- duties
  let r = 8;
  const subtotalRows: number[] = [];
  duties.forEach((duty, di) => {
    const heading = dutyHeading(di, duty.title);
    const isAdHoc = duty.rows.every((row) => row.target === 1);
    copyRow(P.head1, r);
    copyRow(P.head2, r + 1);
    set(`B${r}`, heading);
    set(`D${r}`, KPI_HEADER);
    set(`H${r}`, "الوزن");
    set(`I${r}`, "الدرجة ");
    set(`J${r}`, "المعدل ");
    set(`D${r + 1}`, "المؤشر");
    set(`E${r + 1}`, "ملاحظات");
    set(`F${r + 1}`, "المحقق");
    set(`G${r + 1}`, "من أصل");
    ws.mergeCells(`B${r}:C${r + 1}`);
    ws.mergeCells(`D${r}:G${r}`);
    for (const col of ["H", "I", "J"]) ws.mergeCells(`${col}${r}:${col}${r + 1}`);
    r += 2;

    const first = r;
    for (const row of duty.rows) {
      copyRow(isAdHoc ? P.adhoc : P.kpi, r);
      const degree = cap((row.achieved / row.target) * 100);
      set(`B${r}`, row.name);
      set(`D${r}`, row.indicator);
      set(`E${r}`, row.note || null);
      set(`F${r}`, row.achieved);
      set(`G${r}`, row.target);
      set(`H${r}`, row.weight);
      // business rule: a KPI never scores above 100
      set(`I${r}`, f(`MIN((F${r}/G${r})*100,100)`, round2(degree)));
      set(`J${r}`, f(`I${r}*H${r}/100`, round2((degree * row.weight) / 100)));
      ws.getCell(`E${r}`).numFmt = "@";
      ws.mergeCells(`B${r}:C${r}`);
      r++;
    }
    const last = r - 1;
    copyRow(P.subtotal, r);
    set(`B${r}`, `إجمالي نتيجة الواجب ${heading.split(":")[0].replace("الواجب ", "")}`);
    set(`H${r}`, f(`SUM(H${first}:H${last})`, round2(duty.rows.reduce((a, x) => a + x.weight, 0))));
    set(`I${r}`, f(`SUM(I${first}:I${last})`, round2(duty.rows.reduce((a, x) => a + cap((x.achieved / x.target) * 100), 0))));
    set(`J${r}`, f(`SUM(J${first}:J${last})`, round2(dutyResult(duty.rows))));
    ws.mergeCells(`B${r}:G${r}`);
    subtotalRows.push(r);
    r++;
    copyRow(P.dutyGap, r);
    r++;
  });

  // ---- final result
  r++;
  copyRow(P.finalHead, r);
  set(`B${r}`, " النتيجة النهائية ");
  set(`H${r}`, "الوزن");
  set(`I${r}`, "المعدلات");
  set(`J${r}`, "المعدل النهائي ");
  ws.mergeCells(`B${r}:G${r}`);
  r++;

  const finalFirst = r;
  let finalValue = 0;
  duties.forEach((duty, di) => {
    copyRow(P.finalRow, r);
    const result = dutyResult(duty.rows);
    set(`B${r}`, dutyHeading(di, duty.title));
    set(`H${r}`, duty.weight);
    set(`I${r}`, f(`J${subtotalRows[di]}`, round2(result)));
    set(`J${r}`, f(`I${r}*H${r}/100`, round2((result * duty.weight) / 100)));
    ws.mergeCells(`B${r}:G${r}`);
    finalValue += (result * duty.weight) / 100;
    r++;
  });
  if (header.adjustment) {
    copyRow(P.finalRow, r);
    set(`B${r}`, header.adjustmentReason ? `تعديل المدير: ${header.adjustmentReason}` : "تعديل المدير");
    set(`J${r}`, header.adjustment);
    ws.mergeCells(`B${r}:G${r}`);
    finalValue += header.adjustment;
    r++;
  }
  const finalLast = r - 1;
  const total = round2(cap(finalValue));
  copyRow(P.finalTotal, r);
  set(`B${r}`, "النتيجة النهائية");
  set(`H${r}`, f(`SUM(H${finalFirst}:H${finalLast})`, round2(duties.reduce((a, d) => a + d.weight, 0))));
  set(`I${r}`, f(`SUM(I${finalFirst}:I${finalLast})`, round2(duties.reduce((a, d) => a + dutyResult(d.rows), 0))));
  set(`J${r}`, f(`MAX(0,MIN(100,SUM(J${finalFirst}:J${finalLast})))`, total));
  ws.mergeCells(`B${r}:G${r}`);
  const totalRow = r;
  r++;

  // ---- general rating: thresholds and labels come from the «مؤشرات التقييم» sheet
  copyRow(P.rating, r);
  set(`B${r}`, "التقدير العام");
  const ref = `'${ratings.name.replace(/'/g, "''")}'`;
  const bands = [3, 4, 5, 6, 7].map((row) => ({ row, min: Number(ratings.getCell(`I${row}`).value) || 0, label: String(ratings.getCell(`H${row}`).value ?? "").trim() }));
  const lowest = String(ratings.getCell("H8").value ?? "").trim();
  const conditions = bands.map((b, i) => `J${totalRow}${i === 0 ? ">" : ">="}${ref}!$I$${b.row},${ref}!$H$${b.row}`).join(",");
  const label = bands.find((b, i) => (i === 0 ? total > b.min : total >= b.min))?.label ?? lowest;
  set(`H${r}`, f(`_xlfn.IFS(${conditions},TRUE,${ref}!$H$8)`, label));
  ws.mergeCells(`B${r}:G${r}`);
  ws.mergeCells(`H${r}:J${r}`);
  r++;

  if (header.managerNotes) {
    copyRow(P.rating, r);
    set(`B${r}`, "ملاحظات المدير");
    set(`H${r}`, header.managerNotes);
    ws.getCell(`H${r}`).alignment = { ...clone(ws.getCell(`H${r}`).alignment), wrapText: true };
    ws.getRow(r).height = Math.min(120, 30 + Math.ceil(header.managerNotes.length / 60) * 16);
    ws.mergeCells(`B${r}:G${r}`);
    ws.mergeCells(`H${r}:J${r}`);
    r++;
  }

  ws.pageSetup = {
    ...clone(proto.pageSetup),
    printArea: `A${hasDraft ? 2 : 3}:K${r - 1}`,
    orientation: "portrait",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    paperSize: 9,
  };

  wb.removeWorksheet(proto.id);
  wb.calcProperties.fullCalcOnLoad = true;
  wb.creator = "مسار الأداء";
  wb.created = new Date();
  return Buffer.from(await wb.xlsx.writeBuffer());
}
