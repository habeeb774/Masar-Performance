"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2, ClipboardList, Sparkles, Target, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { globalSearchAction, type SearchResultGroup } from "@/actions/search";

const GROUP_ICON: Record<SearchResultGroup["key"], React.ElementType> = {
  actions: Sparkles,
  tasks: ClipboardList,
  goals: Target,
  employees: Users,
};

/** Header trigger + ⌘K/Ctrl+K command palette searching tasks, goals and employees. */
export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [groups, setGroups] = useState<SearchResultGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const q = query.trim();
  useEffect(() => {
    if (!open || q.length < 2) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setLoading(true);
      setFailed(false);
      globalSearchAction(q)
        .then((res) => setGroups(res))
        .catch(() => {
          setGroups([]);
          setFailed(true);
        })
        .finally(() => setLoading(false));
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [q, open]);

  useEffect(() => {
    if (q.length < 2) {
      // resetting local UI state when the query is cleared, not syncing external data
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setGroups([]);
      setLoading(false);
      setFailed(false);
    }
  }, [q]);

  const select = useCallback(
    (href: string) => {
      setOpen(false);
      setQuery("");
      router.push(href);
    },
    [router],
  );

  return (
    <>
      <Button
        variant="outline"
        className="hidden h-8 w-56 justify-start gap-2 rounded-lg! border-input/30 bg-input/30 px-2.5 text-xs font-normal text-muted-foreground shadow-none hover:text-foreground sm:flex"
        onClick={() => setOpen(true)}
      >
        <Search className="size-3.5" />
        <span className="flex-1 text-start">بحث…</span>
        <kbd className="rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium" dir="ltr">
          ⌘K
        </kbd>
      </Button>
      <Button variant="ghost" size="icon" aria-label="بحث" className="sm:hidden" onClick={() => setOpen(true)}>
        <Search />
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen} title="البحث الشامل" description="ابحث أو اكتب ما تريد فعله" shouldFilter={false}>
        <CommandInput placeholder="ابحث أو اكتب ما تريد فعله… مثل: خطة جديدة، تصدير اكسل" value={query} onValueChange={setQuery} />
        <CommandList>
          {loading && (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> جارٍ البحث…
            </div>
          )}
          {!loading && failed && groups.length === 0 && <CommandEmpty>تعذر تحميل بعض نتائج البحث، حاول مرة أخرى.</CommandEmpty>}
          {!loading && !failed && query.trim().length >= 2 && groups.length === 0 && <CommandEmpty>لا توجد نتائج مطابقة</CommandEmpty>}
          {!loading && query.trim().length < 2 && (
            <div className="py-6 text-center text-sm text-muted-foreground">اكتب حرفين على الأقل لبدء البحث</div>
          )}
          {!loading &&
            groups.map((group) => {
              const Icon = GROUP_ICON[group.key];
              return (
                <CommandGroup key={group.key} heading={group.label}>
                  {group.items.map((item) => (
                    <CommandItem key={item.id} value={item.id} onSelect={() => select(item.href)}>
                      <Icon />
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate">{item.title}</span>
                        {item.subtitle && <span className="truncate text-xs text-muted-foreground">{item.subtitle}</span>}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              );
            })}
        </CommandList>
      </CommandDialog>
    </>
  );
}
