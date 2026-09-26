"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { Bell, KeyRound, LogOut, Monitor, Moon, Sun, User } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { logoutAction } from "@/app/(auth)/login/actions";

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("");
}

export function AppHeader({
  user,
  unread,
}: {
  user: { name: string; email: string; roleName: string; jobTitle: string | null };
  unread: number;
}) {
  const { setTheme, theme } = useTheme();
  // the theme is only known on the client (localStorage) — render a neutral icon until hydrated
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const themeIcon = !mounted ? <Monitor /> : theme === "dark" ? <Moon /> : theme === "light" ? <Sun /> : <Monitor />;
  return (
    <header className="no-print sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur md:px-5">
      <SidebarTrigger className="-ms-1" />
      <Separator orientation="vertical" className="h-5" />
      <div className="flex-1" />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="المظهر">
            {themeIcon}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setTheme("light")}>
            <Sun /> فاتح
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setTheme("dark")}>
            <Moon /> داكن
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setTheme("system")}>
            <Monitor /> حسب النظام
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button variant="ghost" size="icon" asChild aria-label="الإشعارات" className="relative">
        <Link href="/notifications">
          <Bell />
          {unread > 0 && (
            <span className="absolute -top-0.5 -end-0.5 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] leading-4 font-bold text-white">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Link>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-muted" aria-label="قائمة المستخدم">
            <Avatar className="size-8">
              <AvatarFallback className="bg-primary/10 text-xs font-bold text-primary">{initials(user.name)}</AvatarFallback>
            </Avatar>
            <span className="hidden text-start md:block">
              <span className="block text-sm leading-tight font-medium">{user.name}</span>
              <span className="block text-[11px] leading-tight text-muted-foreground">{user.jobTitle ?? user.roleName}</span>
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>
            <span className="block text-sm">{user.name}</span>
            <span className="block text-xs font-normal text-muted-foreground" dir="ltr">
              {user.email}
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/my-performance">
              <User /> ملفي وأدائي
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/account">
              <KeyRound /> تغيير كلمة المرور
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => logoutAction()}>
            <LogOut /> تسجيل الخروج
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
