"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  LayoutDashboard,
  PhoneCall,
  Settings,
  Users,
  LogOut,
  Bot,
  Megaphone,
  Loader2,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";

const links = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/leads", label: "Leads", icon: Users },
  { href: "/calls", label: "Calls", icon: PhoneCall },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

function NavContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  function handleLogout() {
    setSigningOut(true);
    logout();
  }

  return (
    <>
      <div className="mb-8 px-2">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <p className="font-display text-lg leading-none text-ink-800">Horizon</p>
            <p className="mt-0.5 text-xs text-ink-500">Real Estate AI CRM</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-1">
        {links.map((link) => {
          const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-brand-600 text-white shadow-sm"
                  : "text-ink-600 hover:bg-brand-50 hover:text-brand-800"
              )}
            >
              <Icon className={cn("h-4 w-4", active ? "text-white" : "text-ink-400")} />
              {link.label}
            </Link>
          );
        })}
      </nav>

      <div className="rounded-xl border border-ink-200 bg-ink-50/80 p-3">
        <p className="truncate text-sm font-medium text-ink-800">{user?.name}</p>
        <p className="text-xs capitalize text-ink-500">{user?.role?.toLowerCase()}</p>
        <button
          onClick={handleLogout}
          disabled={signingOut}
          className="mt-3 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-ink-600 transition hover:bg-white hover:text-ink-800 disabled:opacity-50"
        >
          {signingOut ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <LogOut className="h-4 w-4" />
          )}
          {signingOut ? "Signing out..." : "Sign out"}
        </button>
      </div>
    </>
  );
}

export function Sidebar() {
  return (
    <aside className="flex h-full w-64 flex-col border-r border-ink-200 bg-white px-4 py-6">
      <NavContent />
    </aside>
  );
}

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const { logout } = useAuth();

  return (
    <>
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-ink-200 bg-white/90 px-4 py-3 backdrop-blur md:hidden">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-lg p-2 text-ink-600 hover:bg-ink-100"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <p className="font-display text-lg text-ink-800">Horizon</p>
        </div>
        <button
          type="button"
          onClick={logout}
          className="rounded-lg px-2 py-1.5 text-sm text-ink-600 hover:bg-ink-100"
        >
          Sign out
        </button>
      </header>

      {open ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-ink-900/40"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
          />
          <aside className="relative flex h-full w-72 max-w-[85vw] flex-col bg-white px-4 py-6 shadow-soft">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute right-3 top-3 rounded-lg p-2 text-ink-500 hover:bg-ink-100"
              aria-label="Close menu"
            >
              <X className="h-4 w-4" />
            </button>
            <NavContent onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      ) : null}
    </>
  );
}
