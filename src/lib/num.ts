/** Convert Prisma Decimal / number / string / null to a plain number. */
export function num(value: unknown, fallback = 0): number {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }
  if (typeof value === "object" && value !== null && "toNumber" in value && typeof value.toNumber === "function") {
    return (value as { toNumber(): number }).toNumber();
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

export function pct(achieved: number, target: number): number {
  if (target <= 0) return achieved > 0 ? 100 : 0;
  return round2((achieved / target) * 100);
}

export function formatNumber(n: number, digits = 0): string {
  return new Intl.NumberFormat("ar-SA-u-nu-latn", { maximumFractionDigits: digits }).format(n);
}

export function formatPct(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `${formatNumber(n, digits)}%`;
}
