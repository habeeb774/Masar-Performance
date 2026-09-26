import { requireUser } from "@/server/auth/session";
import { SettingsNav, type SettingsNavItem } from "@/features/settings/settings-nav";
import { visibleSettingsSections } from "@/features/settings/settings-sections";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const sections = visibleSettingsSections(user);
  // pages authorize themselves; without any settings permission just render the (403) page
  if (sections.length === 0) return <>{children}</>;
  const items: SettingsNavItem[] = [
    { href: "/settings", label: "نظرة عامة", icon: "overview" },
    ...sections.map((s) => ({ href: s.href, label: s.label, icon: s.icon })),
  ];
  return (
    <div className="grid gap-4 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-8">
      <aside className="lg:sticky lg:top-20 lg:self-start">
        <p className="mb-2 hidden px-3 text-xs font-semibold text-muted-foreground lg:block">الإعدادات</p>
        <SettingsNav items={items} />
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
