/**
 * Understands what the employee wants to record, in their own words:
 *   «أضفت 5 منتجات جديدة» → add 5 to the matching task
 *   «خلصت البنرات»        → complete the matching task
 *   «صار المجموع 12»       → set the achieved total to 12
 * Pure functions — the server and the tests share them.
 */

/** Normalize Arabic so spelling variants compare equal (أ/إ/آ→ا, ة→ه, ى→ي, no diacritics / tatweel). */
export function normalizeArabic(text: string): string {
  return text
    .replace(/[ً-ْـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .toLowerCase();
}

const STOP = new Set(["ال", "من", "في", "على", "الى", "عن", "مع", "و", "اليوم", "تم", "انا", "لقد", "قد", "كل", "جديد", "جديده", "المتجر", "متجر"]);

/** Content words of a phrase, without the article «ال» and very short particles. */
export function words(text: string): string[] {
  return normalizeArabic(text)
    .split(/[^\p{L}\p{N}]+/u)
    .map((w) => (w.startsWith("ال") && w.length > 3 ? w.slice(2) : w))
    .map((w) => (w.startsWith("وال") && w.length > 4 ? w.slice(3) : w))
    .filter((w) => w.length >= 2 && !STOP.has(w) && !/^\d+$/.test(w));
}

const ARABIC_NUMBERS: Record<string, number> = {
  واحد: 1, واحده: 1, اثنين: 2, اثنان: 2, ثنتين: 2, ثلاث: 3, ثلاثه: 3, اربع: 4, اربعه: 4, خمس: 5, خمسه: 5,
  ست: 6, سته: 6, سبع: 7, سبعه: 7, ثمان: 8, ثمانيه: 8, تسع: 9, تسعه: 9, عشر: 10, عشره: 10,
};

/** The first quantity in the text: digits (Arabic or Western, decimals allowed) or a number word. */
export function parseAmount(text: string): number | null {
  const n = normalizeArabic(text);
  const digits = /(\d+(?:[.,]\d+)?)/.exec(n);
  if (digits) return Number(digits[1].replace(",", "."));
  for (const w of n.split(/\s+/)) if (w in ARABIC_NUMBERS) return ARABIC_NUMBERS[w];
  return null;
}

const COMPLETE = ["خلصت", "خلصنا", "انهيت", "انتهيت", "اكملت", "كملت", "انجزت كامل", "اكتمل", "اكتملت", "سلمت", "خلاص"];
const TOTAL = ["المجموع", "الاجمالي", "صار", "صارت", "وصلت", "وصل", "اصبح", "اصبحت"];

export type IntentKind = "add" | "set" | "complete";

export interface Candidate {
  id: string;
  title: string;
}

export interface Interpretation<C extends Candidate = Candidate> {
  kind: IntentKind;
  amount: number | null;
  /** best matches first; empty when nothing matches */
  matches: { candidate: C; score: number }[];
}

/** How well a phrase fits a task / goal title: share of the title's words found in the phrase (with prefix tolerance). */
export function matchScore(phrase: string, title: string): number {
  const said = words(phrase);
  const need = words(title);
  if (said.length === 0 || need.length === 0) return 0;
  const hit = (w: string) => said.some((s) => s === w || (s.length >= 3 && w.length >= 3 && (s.startsWith(w.slice(0, 4)) || w.startsWith(s.slice(0, 4)))));
  return need.filter(hit).length / need.length;
}

export function interpret<C extends Candidate>(text: string, candidates: C[]): Interpretation<C> {
  const n = normalizeArabic(text);
  const amount = parseAmount(text);
  const kind: IntentKind = TOTAL.some((w) => n.includes(w)) && amount !== null ? "set" : amount === null && COMPLETE.some((w) => n.includes(w)) ? "complete" : "add";
  const matches = candidates
    .map((candidate) => ({ candidate, score: matchScore(text, candidate.title) }))
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score);
  // with one candidate only, a bare number («أضفت 5») clearly belongs to it
  if (matches.length === 0 && candidates.length === 1 && amount !== null) return { kind, amount, matches: [{ candidate: candidates[0], score: 0.5 }] };
  return { kind, amount, matches };
}

/** The achieved value after applying the intent. */
export function nextAchieved(kind: IntentKind, amount: number | null, achieved: number, target: number): number {
  if (kind === "complete") return Math.max(achieved, target);
  if (kind === "set") return Math.max(amount ?? achieved, 0);
  return Math.max(achieved + (amount ?? 0), 0);
}
