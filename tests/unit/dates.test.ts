import { describe, expect, it } from "vitest";
import { addDays, isDateKey, monthEnd, startOfWeek, todayKey } from "@/lib/dates";

describe("dates", () => {
  it("validates date keys", () => {
    expect(isDateKey("2026-02-29")).toBe(false);
    expect(isDateKey("2028-02-29")).toBe(true);
  });
  it("computes month end", () => {
    expect(monthEnd(2026, 2)).toBe("2026-02-28");
    expect(monthEnd(2026, 12)).toBe("2026-12-31");
  });
  it("finds week start on Saturday", () => {
    // 2026-09-26 is a Saturday
    expect(startOfWeek("2026-09-26", 6)).toBe("2026-09-26");
    expect(startOfWeek("2026-09-30", 6)).toBe("2026-09-26");
  });
  it("adds days across months", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
  });
  it("resolves today in Riyadh", () => {
    expect(todayKey("Asia/Riyadh", new Date("2026-09-25T22:30:00Z"))).toBe("2026-09-26");
  });
});
