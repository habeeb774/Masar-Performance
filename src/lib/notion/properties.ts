/**
 * Normalizes Notion page property payloads (API 2025-09-03) into plain JSON
 * values that can be stored and filtered without knowing the Notion shape.
 */

export type NormalizedValue =
  | string
  | number
  | boolean
  | null
  | string[]
  | { start: string; end: string | null }
  | { id: string; name: string | null }
  | { id: string; name: string | null }[];

type RichText = { plain_text?: string }[];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyProp = Record<string, any> & { type: string };

const text = (rt: RichText | undefined) => (rt ?? []).map((t) => t.plain_text ?? "").join("").trim();

export function normalizeProperty(prop: AnyProp | undefined | null): NormalizedValue {
  if (!prop) return null;
  switch (prop.type) {
    case "title":
      return text(prop.title);
    case "rich_text":
      return text(prop.rich_text);
    case "number":
      return typeof prop.number === "number" ? prop.number : null;
    case "select":
      return prop.select?.name ?? null;
    case "status":
      return prop.status?.name ?? null;
    case "multi_select":
      return (prop.multi_select ?? []).map((o: { name: string }) => o.name);
    case "date":
      return prop.date ? { start: prop.date.start, end: prop.date.end ?? null } : null;
    case "checkbox":
      return Boolean(prop.checkbox);
    case "people":
      return (prop.people ?? []).map((p: { id: string; name?: string }) => ({ id: p.id, name: p.name ?? null }));
    case "created_by":
    case "last_edited_by": {
      const u = prop[prop.type];
      return u ? { id: u.id, name: u.name ?? null } : null;
    }
    case "created_time":
      return prop.created_time ?? null;
    case "last_edited_time":
      return prop.last_edited_time ?? null;
    case "url":
      return prop.url ?? null;
    case "email":
      return prop.email ?? null;
    case "phone_number":
      return prop.phone_number ?? null;
    case "unique_id":
      return prop.unique_id ? `${prop.unique_id.prefix ? prop.unique_id.prefix + "-" : ""}${prop.unique_id.number}` : null;
    case "relation":
      return (prop.relation ?? []).map((r: { id: string }) => r.id);
    case "files":
      return (prop.files ?? []).map((f: { name: string }) => f.name);
    case "formula": {
      const f = prop.formula;
      if (!f) return null;
      if (f.type === "string") return f.string ?? null;
      if (f.type === "number") return f.number ?? null;
      if (f.type === "boolean") return Boolean(f.boolean);
      if (f.type === "date") return f.date ? { start: f.date.start, end: f.date.end ?? null } : null;
      return null;
    }
    case "rollup": {
      const r = prop.rollup;
      if (!r) return null;
      if (r.type === "number") return r.number ?? null;
      if (r.type === "date") return r.date ? { start: r.date.start, end: r.date.end ?? null } : null;
      if (r.type === "array") {
        return (r.array ?? [])
          .map((x: AnyProp) => normalizeProperty(x))
          .flat()
          .filter((x: unknown) => typeof x === "string") as string[];
      }
      return null;
    }
    default:
      return null;
  }
}

export function normalizeProperties(properties: Record<string, AnyProp>): Record<string, NormalizedValue> {
  const out: Record<string, NormalizedValue> = {};
  for (const [name, prop] of Object.entries(properties ?? {})) out[name] = normalizeProperty(prop);
  return out;
}

/** Flatten a normalized value into comparable string values. */
export function valueToStrings(value: NormalizedValue | undefined): string[] {
  if (value === null || value === undefined) return [];
  if (typeof value === "string") return value ? [value] : [];
  if (typeof value === "number") return [String(value)];
  if (typeof value === "boolean") return [value ? "true" : "false"];
  if (Array.isArray(value)) {
    return value.flatMap((v) => (typeof v === "string" ? [v] : v && typeof v === "object" && "id" in v ? [v.name ?? v.id] : []));
  }
  if ("start" in value) return [value.start];
  if ("id" in value) return [value.name ?? value.id];
  return [];
}

export function valueToNumber(value: NormalizedValue | undefined): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const n = Number(value.replace(/[^\d.-]/g, ""));
    return value.trim() !== "" && Number.isFinite(n) ? n : null;
  }
  return null;
}

export function valueToDateKey(value: NormalizedValue | undefined): string | null {
  if (!value) return null;
  if (typeof value === "string") return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;
  if (typeof value === "object" && !Array.isArray(value) && "start" in value) return value.start?.slice(0, 10) ?? null;
  return null;
}

/** Person identities (id + name) contained in a people / created_by value. */
export function valueToPeople(value: NormalizedValue | undefined): { id: string; name: string | null }[] {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) {
    return value.filter((v): v is { id: string; name: string | null } => typeof v === "object" && v !== null && "id" in v);
  }
  if ("id" in value) return [value as { id: string; name: string | null }];
  return [];
}

/** Options declared on a select / multi_select / status property schema. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function schemaOptions(propSchema: Record<string, any> | undefined): { name: string; color?: string }[] {
  if (!propSchema) return [];
  const t = propSchema.type as string;
  const cfg = propSchema[t];
  const opts = cfg?.options ?? [];
  return opts.map((o: { name: string; color?: string }) => ({ name: o.name, color: o.color }));
}
