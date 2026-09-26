/** Keys that must never be displayed, even if an audit row accidentally contains them. */
export const SENSITIVE_KEY = /password|token|secret|hash/i;
export const REDACTED = "••• محجوب •••";

export type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };

export function redact(value: unknown, depth = 0): JsonValue {
  if (value === null || value === undefined) return null;
  if (depth > 12) return "…";
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, JsonValue> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY.test(k) ? REDACTED : redact(v, depth + 1);
    }
    return out;
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  return String(value);
}
