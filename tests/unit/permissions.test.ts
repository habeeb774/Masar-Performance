import { describe, expect, it } from "vitest";
import { canAccessEmployee, DEFAULT_ROLE_PERMISSIONS, employeeScope, hasPermission, PERMISSIONS } from "@/lib/permissions";

describe("permissions", () => {
  it("system.admin implies everything", () => {
    expect(hasPermission({ permissions: [PERMISSIONS.SYSTEM_ADMIN] }, PERMISSIONS.KPI_MANAGE)).toBe(true);
  });
  it("employees cannot approve plans", () => {
    expect(hasPermission({ permissions: DEFAULT_ROLE_PERMISSIONS.EMPLOYEE }, PERMISSIONS.PLANS_APPROVE)).toBe(false);
  });
  it("managers can review reports", () => {
    expect(hasPermission({ permissions: new Set(DEFAULT_ROLE_PERMISSIONS.MANAGER) }, PERMISSIONS.REPORTS_REVIEW)).toBe(true);
  });
  it("scopes employees to self and direct reports", () => {
    const emp = { permissions: DEFAULT_ROLE_PERMISSIONS.EMPLOYEE, employeeId: "e1", directReportIds: [] };
    expect(employeeScope(emp)).toEqual(["e1"]);
    expect(canAccessEmployee(emp, "e2")).toBe(false);
    const lead = { permissions: DEFAULT_ROLE_PERMISSIONS.EMPLOYEE, employeeId: "m1", directReportIds: ["e1"] };
    expect(canAccessEmployee(lead, "e1")).toBe(true);
    const mgr = { permissions: DEFAULT_ROLE_PERMISSIONS.MANAGER, employeeId: "m1", directReportIds: [] };
    expect(employeeScope(mgr)).toBe("ALL");
  });
});
