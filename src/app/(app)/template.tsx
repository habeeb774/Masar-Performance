/**
 * `template.tsx` re-mounts on every navigation (unlike `layout.tsx`, which
 * persists), so this is the right place for a per-page entrance transition.
 */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return <div className="[animation:var(--animate-in-page)]">{children}</div>;
}
