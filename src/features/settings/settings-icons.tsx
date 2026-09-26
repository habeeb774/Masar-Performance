import { Building2, Gauge, KeyRound, LayoutGrid, Network, ShieldCheck, Star, UserCog, Users, type LucideIcon } from "lucide-react";
import type { SettingsIcon } from "./settings-sections";

export const SETTINGS_ICONS: Record<SettingsIcon, LucideIcon> = {
  overview: LayoutGrid,
  company: Building2,
  departments: Network,
  jobTitles: UserCog,
  roles: ShieldCheck,
  permissions: KeyRound,
  kpis: Gauge,
  ratingScale: Star,
  users: Users,
};
