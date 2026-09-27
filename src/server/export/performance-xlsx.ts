import "server-only";
import ExcelJS from "exceljs";
import { dutyHeading, dutyResult, sheetName, type ExportDuty } from "@/lib/performance-export";
import { bandRangeText } from "@/lib/kpi/rating-scale";
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
  /** the system's active rating scale — the single reference for the rating */
  ratingBands: { label: string; minScore: number; maxScore: number }[];
}

/**
 * The template's own rows, reused for every repeated block: duty header (8, 9),
 * KPI row (10), new-task row (30), duty total (14), gap (20), final table (39, 40, 44)
 * and the general rating (45). Rows 1–7 (title + employee header) are filled in place.
 */
const T = { head1: 8, head2: 9, kpi: 10, adhoc: 30, subtotal: 14, dutyGap: 20, finalHead: 39, finalRow: 40, finalTotal: 44, rating: 45 } as const;
const FIRST_BODY_ROW = 8;
const COLS = 13;
const KPI_HEADER = "مؤشرات الأداء الرئيسية KPIs";
const RATING_FIRST_ROW = 3;
const RATING_TEMPLATE_ROWS = 6;

const clone = <V>(v: V): V => JSON.parse(JSON.stringify(v ?? {}));
const round2 = (n: number) => Math.round(n * 100) / 100;
const cap = (n: number) => Math.min(Math.max(n, 0), 100);

type RowShape = { height?: number; styles: Partial<ExcelJS.Style>[] };
type Formula = { formula: string; result?: number | string };

function captureRow(ws: ExcelJS.Worksheet, r: number): RowShape {
  const row = ws.getRow(r);
  return { height: row.height, styles: Array.from({ length: COLS }, (_, i) => clone(row.getCell(i + 1).style)) };
}

/** Fill the thresholds sheet (G range text, H label, I minimum) from the system scale, highest band first. */
function writeRatingScale(sheet: ExcelJS.Worksheet, input: SheetHeader["ratingBands"]) {
  const bands = [...input].sort((a, b) => b.minScore - a.minScore);
  const out = bands.map((b, i) => {
    const row = RATING_FIRST_ROW + i;
    if (i >= RATING_TEMPLATE_ROWS) {
      const src = sheet.getRow(RATING_FIRST_ROW + RATING_TEMPLATE_ROWS - 1);
      const dst = sheet.getRow(row);
      dst.height = src.height;
      for (let c = 1; c <= 9; c++) dst.getCell(c).style = clone(src.getCell(c).style);
    }
    sheet.getCell(`G${row}`).value = bandRangeText(bands, i);
    sheet.getCell(`H${row}`).value = b.label;
    sheet.getCell(`I${row}`).value = b.minScore;
    return { ...b, row };
  });
  for (let i = bands.length; i < RATING_TEMPLATE_ROWS; i++) {
    for (const col of ["F", "G", "H", "I"]) sheet.getCell(`${col}${RATING_FIRST_ROW + i}`).value = null;
  }
  return out;
}

export async function renderPerformanceWorkbook(header: SheetHeader, duties: ExportDuty[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(PERFORMANCE_TEMPLATE_BASE64, "base64") as unknown as ArrayBuffer);
  const [ratings, ws] = wb.worksheets;
  ws.name = sheetName(header.year, header.month);

  // ---- remember the template's own row shapes, then clear the body below the employee header
  const shape = Object.fromEntries(Object.entries(T).map(([k, row]) => [k, captureRow(ws, row)])) as Record<keyof typeof T, RowShape>;
  for (const range of [...(ws.model.merges ?? [])]) {
    const top = Number(range.split(":")[0].replace(/[A-Z]+/g, ""));
    if (top >= FIRST_BODY_ROW) ws.unMergeCells(range);
  }
  const lastTemplateRow = Math.max(ws.rowCount, T.rating + 2);
  for (let row = FIRST_BODY_ROW; row <= lastTemplateRow; row++) {
    const current = ws.getRow(row);
    current.height = undefined as unknown as number;
    for (let c = 1; c <= COLS; c++) {
      const cell = current.getCell(c);
      cell.value = null;
      cell.style = {};
      cell.dataValidation = undefined as unknown as ExcelJS.DataValidation;
    }
  }

  const apply = (s: RowShape, to: number) => {
    const row = ws.getRow(to);
    if (s.height) row.height = s.height;
    s.styles.forEach((style, i) => (row.getCell(i + 1).style = clone(style)));
  };
  const set = (addr: string, value: ExcelJS.CellValue) => {
    ws.getCell(addr).value = value;
  };
  const f = (formula: string, result: number | string): Formula => ({ formula, result });

  // ---- employee header: the template's own cells, values only
  set("C4", header.employeeName);
  set("C5", header.jobTitle);
  set("C6", header.department);
  set("E6", new Date(Date.UTC(header.year, header.month - 1, 1)));
  set("H6", new Date(Date.UTC(header.year, header.month, 0)));
  if (header.draftNote) {
    const c = ws.getCell("B2");
    c.value = header.draftNote;
    c.font = { bold: true, color: { argb: "FFC00000" }, size: 14 };
    c.alignment = { horizontal: "center", vertical: "middle", readingOrder: "rtl" };
    ws.mergeCells("B2:J2");
    ws.getRow(2).height = 28;
  }

  // ---- duties, each built from the template's duty rows
  let r = FIRST_BODY_ROW;
  const dutyTitleRows: number[] = [];
  const subtotalRows: number[] = [];
  duties.forEach((duty, di) => {
    const heading = dutyHeading(di, duty.title);
    const isAdHoc = duty.rows.every((row) => row.target === 1);
    apply(shape.head1, r);
    apply(shape.head2, r + 1);
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
    dutyTitleRows.push(r);
    r += 2;

    const first = r;
    for (const row of duty.rows) {
      apply(isAdHoc ? shape.adhoc : shape.kpi, r);
      const degree = cap((row.achieved / row.target) * 100);
      set(`B${r}`, row.name);
      set(`D${r}`, row.indicator);
      set(`E${r}`, row.note || null);
      set(`F${r}`, row.achieved);
      set(`G${r}`, row.target);
      set(`H${r}`, row.weight);
      if (!Number.isInteger(row.weight)) ws.getCell(`H${r}`).numFmt = "0.00";
      // the template's formulas; the degree is capped at 100 (current system rule)
      set(`I${r}`, f(`MIN((F${r}/G${r})*100,100)`, degree));
      set(`J${r}`, f(`I${r}*H${r}/100`, (degree * row.weight) / 100));
      ws.mergeCells(`B${r}:C${r}`);
      r++;
    }
    const last = r - 1;
    apply(shape.subtotal, r);
    set(`B${r}`, `إجمالي نتيجة ${heading.split(":")[0]}`);
    set(`H${r}`, f(`SUM(H${first}:H${last})`, duty.rows.reduce((a, x) => a + x.weight, 0)));
    set(`I${r}`, f(`SUM(I${first}:I${last})`, duty.rows.reduce((a, x) => a + cap((x.achieved / x.target) * 100), 0)));
    set(`J${r}`, f(`SUM(J${first}:J${last})`, dutyResult(duty.rows)));
    ws.mergeCells(`B${r}:G${r}`);
    subtotalRows.push(r);
    r++;
    apply(shape.dutyGap, r);
    r++;
  });

  // ---- final result table (template rows 39/40/44)
  r++;
  apply(shape.finalHead, r);
  set(`B${r}`, " النتيجة النهائية ");
  set(`H${r}`, "الوزن");
  set(`I${r}`, "المعدلات");
  set(`J${r}`, "المعدل النهائي ");
  ws.mergeCells(`B${r}:G${r}`);
  r++;

  const finalFirst = r;
  let finalValue = 0;
  duties.forEach((duty, di) => {
    apply(shape.finalRow, r);
    const result = dutyResult(duty.rows);
    // like the template (=B16), the final table references each duty's title cell
    set(`B${r}`, f(`B${dutyTitleRows[di]}`, dutyHeading(di, duty.title)));
    set(`H${r}`, duty.weight);
    if (!Number.isInteger(duty.weight)) ws.getCell(`H${r}`).numFmt = "0.00";
    set(`I${r}`, f(`J${subtotalRows[di]}`, result));
    set(`J${r}`, f(`I${r}*H${r}/100`, (result * duty.weight) / 100));
    ws.mergeCells(`B${r}:G${r}`);
    finalValue += (result * duty.weight) / 100;
    r++;
  });
  if (header.adjustment) {
    apply(shape.finalRow, r);
    set(`B${r}`, header.adjustmentReason ? `تعديل المدير: ${header.adjustmentReason}` : "تعديل المدير");
    set(`J${r}`, header.adjustment);
    ws.mergeCells(`B${r}:G${r}`);
    finalValue += header.adjustment;
    r++;
  }
  const finalLast = r - 1;
  const total = round2(cap(finalValue));
  apply(shape.finalTotal, r);
  set(`B${r}`, "النتيجة النهائية");
  set(`H${r}`, f(`SUM(H${finalFirst}:H${finalLast})`, duties.reduce((a, d) => a + d.weight, 0)));
  set(`I${r}`, f(`SUM(I${finalFirst}:I${finalLast})`, duties.reduce((a, d) => a + dutyResult(d.rows), 0)));
  ws.getCell(`I${r}`).numFmt = "0.###";
  // rounded to 2 decimals exactly like the system's final score
  set(`J${r}`, f(`ROUND(MAX(0,MIN(100,SUM(J${finalFirst}:J${finalLast}))),2)`, total));
  ws.mergeCells(`B${r}:G${r}`);
  // the template validates the weights total (whole number 1–100); keep it on the moved row
  ws.getCell(`H${r}`).dataValidation = { type: "whole", allowBlank: true, showInputMessage: true, showErrorMessage: true, formulae: [1, 100] };
  const totalRow = r;
  r++;

  // ---- general rating: thresholds and labels from «مؤشرات التقييم» (written from the system scale)
  apply(shape.rating, r);
  set(`B${r}`, "التقدير العام");
  const ref = `'${ratings.name.replace(/'/g, "''")}'`;
  const bands = writeRatingScale(ratings, header.ratingBands);
  const lowest = bands[bands.length - 1];
  const conditions = bands
    .slice(0, -1)
    .map((b) => `J${totalRow}>=${ref}!$I$${b.row},${ref}!$H$${b.row}`)
    .join(",");
  const label = bands.find((b) => total >= b.minScore)?.label ?? lowest.label;
  set(`H${r}`, f(conditions ? `_xlfn.IFS(${conditions},TRUE,${ref}!$H$${lowest.row})` : `${ref}!$H$${lowest.row}`, label));
  ws.mergeCells(`B${r}:G${r}`);
  ws.mergeCells(`H${r}:J${r}`);
  r++;

  if (header.managerNotes) {
    apply(shape.rating, r);
    set(`B${r}`, "ملاحظات المدير");
    set(`H${r}`, header.managerNotes);
    ws.getCell(`H${r}`).alignment = { ...clone(ws.getCell(`H${r}`).alignment), wrapText: true };
    ws.getRow(r).height = Math.min(120, 30 + Math.ceil(header.managerNotes.length / 60) * 16);
    ws.mergeCells(`B${r}:G${r}`);
    ws.mergeCells(`H${r}:J${r}`);
    r++;
  }

  // the template's own page setup; only the print area follows the number of rows
  ws.pageSetup.printArea = `A${header.draftNote ? 2 : 3}:K${r - 1}`;
  wb.calcProperties.fullCalcOnLoad = true;
  return Buffer.from(await wb.xlsx.writeBuffer());
}
