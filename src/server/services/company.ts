import "server-only";
import { cache } from "react";
import { db } from "@/server/db";

export interface CompanySettings {
  id: string;
  name: string;
  timezone: string;
  weekStartDay: number;
  workDays: number[];
  planSubmissionDeadlineDay: number;
  weeklyReportDueDays: number;
}

async function loadCompany(): Promise<CompanySettings> {
  let company = await db.company.findFirst({ orderBy: { createdAt: "asc" } });
  if (!company) company = await db.company.create({ data: { name: "الشركة" } });
  return {
    id: company.id,
    name: company.name,
    timezone: company.timezone,
    weekStartDay: company.weekStartDay,
    workDays: company.workDays,
    planSubmissionDeadlineDay: company.planSubmissionDeadlineDay,
    weeklyReportDueDays: company.weeklyReportDueDays,
  };
}

/** Per-request cached company settings. */
export const getCompany = cache(loadCompany);
/** Uncached variant for cron / scripts. */
export const getCompanyFresh = loadCompany;
