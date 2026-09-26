import type { Tone } from "@/lib/labels";

export const EMPLOYEE_STATUS_OPTIONS = [
  { value: "ACTIVE", label: "نشط" },
  { value: "ON_LEAVE", label: "في إجازة" },
  { value: "TERMINATED", label: "منتهي الخدمة" },
] as const;

export const EMPLOYEE_STATUS_TONE: Record<string, Tone> = { ACTIVE: "success", ON_LEAVE: "warning", TERMINATED: "blocked" };
