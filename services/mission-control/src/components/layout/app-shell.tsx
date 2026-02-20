"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, useCallback, useEffect, useState } from "react";

import { appSections } from "@/lib/navigation";
import { getJwtPayload, logout } from "@/lib/auth";

type AppShellProps = {
  children: ReactNode;
};

const iconMap: Record<string, string> = {
  grid: "\u25EB",
  "check-square": "\u2611",
  layers: "\u25E7",
  send: "\u27A4",
  reply: "\u21A9",
  calendar: "\u25F0",
  database: "\u2B21",
  users: "\u25C9",
  zap: "\u26A1",
  gamepad: "\uD83C\uDFAE",
  activity: "\u25C8",
  twitter: "\uD83D\uDC26",
};

type ServiceStatus = {
  name: string;
  status: "up" | "down" | "degraded";
  latencyMs: number;
};

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const [email, setEmail] = useState<string | null>(null);
  const [services, setServices] = useState<ServiceStatus[]>([]);
  const [healthLoaded, setHealthLoaded] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const payload = getJwtPayload();
    if (payload?.email) setEmail(payload.email);
  }, []);

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch("/api/health/services");
      if (res.ok) {
        const data = await res.json();
        setServices(data.services || []);
        setHealthLoaded(true);
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 60000);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  const upCount = services.filter((s) => s.status === "up").length;
  const totalCount = services.length;
  const hasDown = services.some((s) => s.status === "down");
  const hasDegraded = services.some((s) => s.status === "degraded");

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Mobile top bar */}
      <div className="md:hidden flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-xs font-bold">MC</div>
          <span className="text-sm font-bold">Mission Control</span>
        </div>
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="flex items-center justify-center h-9 w-9 rounded-lg border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 transition"
          aria-label="Toggle menu"
        >
          {sidebarOpen ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
          )}
        </button>
      </div>

      <div className="mx-auto grid min-h-screen max-w-7xl grid-cols-1 md:grid-cols-[260px_1fr]">
        {/* Sidebar - hidden on mobile unless toggled */}
        <aside className={`${sidebarOpen ? "block" : "hidden"} md:block border-b border-white/10 p-6 md:border-r md:border-b-0 md:sticky md:top-0 md:h-screen md:overflow-y-auto flex flex-col`}>
          <Link href="/" className="mb-8 hidden md:block space-y-1">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-sm font-bold">MC</div>
              <div>
                <h1 className="text-lg font-bold leading-tight">Mission Control</h1>
                <p className="text-[10px] uppercase tracking-[0.15em] text-slate-500">WolfeUp HQ</p>
              </div>
            </div>
          </Link>

          <nav className="space-y-1">
            {appSections.map((section) => {
              const isActive = pathname === section.href || (section.href !== "/" && pathname.startsWith(section.href) && !appSections.some((s) => s.href !== section.href && s.href.startsWith(section.href) && pathname.startsWith(s.href)));
              return (
                <Link key={section.href} href={section.href}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                    isActive
                      ? "bg-white/10 text-white font-medium border border-white/10"
                      : "text-slate-400 hover:text-white hover:bg-white/5 border border-transparent"
                  }`}>
                  <span className="text-base w-5 text-center">{iconMap[section.icon] || "\u2022"}</span>
                  {section.title}
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto pt-6 space-y-3">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-2">
              {healthLoaded ? (
                <>
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${hasDown ? "bg-red-400 shadow-[0_0_6px] shadow-red-400/50" : hasDegraded ? "bg-amber-400 shadow-[0_0_6px] shadow-amber-400/50" : "bg-emerald-400 shadow-[0_0_6px] shadow-emerald-400/50"}`} />
                    <span className="text-xs font-medium text-slate-300">{upCount}/{totalCount} Services Online</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {services.map((s) => (
                      <span
                        key={s.name}
                        title={`${s.name}: ${s.status} (${s.latencyMs}ms)`}
                        className={`h-2 w-2 rounded-full ${s.status === "up" ? "bg-emerald-400" : s.status === "degraded" ? "bg-amber-400" : "bg-red-400"}`}
                      />
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_6px] shadow-emerald-400/50" />
                    <span className="text-xs font-medium text-slate-300">Systems Online</span>
                  </div>
                  <div className="text-[10px] text-slate-500 space-y-0.5">
                    <p>Gateway: OpenClaw Control</p>
                    <p>Games: 75+ containers</p>
                    <p>Convex: greedy-heron-704</p>
                  </div>
                </>
              )}
            </div>

            {email && (
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-2">
                <p className="text-xs text-slate-400 truncate">{email}</p>
                <button
                  onClick={logout}
                  className="text-xs text-slate-500 hover:text-white transition"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </aside>

        <main className="p-4 md:p-10">{children}</main>
      </div>
    </div>
  );
}
