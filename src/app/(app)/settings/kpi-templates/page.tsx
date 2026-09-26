import { redirect } from "next/navigation";

/** KPI templates are managed on the performance section. */
export default function KpiTemplatesSettingsPage() {
  redirect("/performance/kpis");
}
