"use client";
import { useState } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { companiesApi, approvalApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { AxiosError } from "axios";

const NAV = [
  { href: "", label: "Overview", icon: "⬡" },
  { href: "/approval", label: "Approval Queue", icon: "✓" },
  { href: "/campaigns", label: "Campaigns", icon: "📊" },
  { href: "/leads", label: "Leads", icon: "👥" },
  { href: "/budget", label: "Budget", icon: "💰" },
  { href: "/costs", label: "Costs", icon: "💳" },
  { href: "/library", label: "Materials", icon: "📁" },
  { href: "/schedule", label: "Calendar", icon: "📅" },
  { href: "/setup", label: "Setup Guide", icon: "🔑" },
  { href: "/settings", label: "Settings & Credentials", icon: "⚙" },
];

const MODULES = [
  { href: "/paid-ads", label: "Paid Ads", color: "text-orange-400 hover:text-orange-300", bg: "hover:bg-orange-500/10", dot: "bg-orange-400" },
  { href: "/referral", label: "Referral", color: "text-emerald-400 hover:text-emerald-300", bg: "hover:bg-emerald-500/10", dot: "bg-emerald-400" },
  { href: "/content", label: "Content", color: "text-violet-400 hover:text-violet-300", bg: "hover:bg-violet-500/10", dot: "bg-violet-400" },
  { href: "/seo", label: "SEO", color: "text-sky-400 hover:text-sky-300", bg: "hover:bg-sky-500/10", dot: "bg-sky-400" },
  { href: "/profiles", label: "Profiles", color: "text-pink-400 hover:text-pink-300", bg: "hover:bg-pink-500/10", dot: "bg-pink-400" },
];

const INTELLIGENCE = [
  { href: "/roi", label: "ROI Analytics", color: "text-amber-400 hover:text-amber-300", bg: "hover:bg-amber-500/10", dot: "bg-amber-400" },
  { href: "/competitors", label: "Competitors", color: "text-red-400 hover:text-red-300", bg: "hover:bg-red-500/10", dot: "bg-red-400" },
  { href: "/reputation", label: "Reputation", color: "text-pink-400 hover:text-pink-300", bg: "hover:bg-pink-500/10", dot: "bg-pink-400" },
  { href: "/reports", label: "GTM Digest", color: "text-indigo-400 hover:text-indigo-300", bg: "hover:bg-indigo-500/10", dot: "bg-indigo-400" },
  { href: "/aeo", label: "AI Engine SEO", color: "text-violet-400 hover:text-violet-300", bg: "hover:bg-violet-500/10", dot: "bg-violet-400" },
  { href: "/video", label: "Video Ad Generator", color: "text-pink-400 hover:text-pink-300", bg: "hover:bg-pink-500/10", dot: "bg-pink-400" },
  { href: "/templates", label: "Templates", color: "text-violet-300 hover:text-violet-200", bg: "hover:bg-violet-500/10", dot: "bg-violet-300" },
  { href: "/intake", label: "Intake Forms", color: "text-teal-400 hover:text-teal-300", bg: "hover:bg-teal-500/10", dot: "bg-teal-400" },
  { href: "/spam", label: "Spam & Compliance", color: "text-purple-400 hover:text-purple-300", bg: "hover:bg-purple-500/10", dot: "bg-purple-400" },
  { href: "/ask", label: "AI Strategy Chat", color: "text-sky-400 hover:text-sky-300", bg: "hover:bg-sky-500/10", dot: "bg-sky-400" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { companyId } = useParams<{ companyId: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  const { data: company, error: companyError } = useQuery({
    queryKey: ["company", companyId],
    queryFn: () => companiesApi.get(companyId).then((r) => r.data),
    enabled: !!companyId,
    retry: 1,
  });

  // True when there is no HTTP response at all — backend is unreachable
  const isNetworkError = !!companyError && !(companyError as AxiosError)?.response;

  const { data: approvalData } = useQuery({
    queryKey: ["approval-count", companyId],
    queryFn: () => approvalApi.count(companyId).then((r) => r.data),
    enabled: !!companyId,
    staleTime: 60_000,
  });
  const pendingCount = approvalData?.pending ?? 0;

  const base = `/dashboard/${companyId}`;

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="px-5 py-4" style={{ borderBottom: "1px solid #1e293b" }}>
        <button
          onClick={() => { router.push("/"); setMobileOpen(false); }}
          className="flex items-center gap-2.5 group"
        >
          <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}>
            <span className="text-white font-bold text-xs">A</span>
          </div>
          <div className="text-left">
            <div className="text-sm font-semibold text-white leading-none">Arche GTM</div>
            <div className="text-xs leading-none mt-0.5" style={{ color: "#475569" }}>Marketing Engine</div>
          </div>
        </button>
      </div>

      {/* Company card */}
      {company && (
        <div className="px-4 py-3" style={{ borderBottom: "1px solid #1e293b" }}>
          <div className="flex items-start gap-2.5">
            <div className="mt-0.5 relative shrink-0">
              <div className="w-2 h-2 rounded-full bg-emerald-400" />
              <div className="w-2 h-2 rounded-full bg-emerald-400 absolute inset-0 pulse-dot opacity-50" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-white truncate leading-tight">{company.name}</p>
              <p className="text-xs truncate mt-0.5" style={{ color: "#475569" }}>
                {company.website_url?.replace(/^https?:\/\//, "")}
              </p>
              {company.is_pilot && (
                <span className="mt-1 inline-block text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "rgba(99,102,241,0.2)", color: "#818cf8" }}>
                  Pilot
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main nav */}
      <nav className="py-3 px-3">
        {NAV.map((item) => {
          const href = base + item.href;
          const isActive = pathname === href || (item.href === "" && pathname === base);
          return (
            <Link
              key={item.href}
              href={href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all mb-0.5",
                isActive ? "text-white font-medium" : "font-normal"
              )}
              style={isActive
                ? { background: "rgba(99,102,241,0.18)", color: "#a5b4fc" }
                : { color: "#94a3b8" }
              }
            >
              <span className="text-base leading-none w-5 text-center">{item.icon}</span>
              <span className="flex-1">{item.label}</span>
              {item.label === "Approval Queue" && pendingCount > 0 && (
                <span className="text-xs px-1.5 py-0.5 rounded-full font-semibold" style={{ background: "#6366f1", color: "#fff" }}>
                  {pendingCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Module quick-links */}
      <div className="px-3 py-3" style={{ borderTop: "1px solid #1e293b" }}>
        <p className="text-xs px-3 mb-2 uppercase tracking-widest font-semibold" style={{ color: "#334155" }}>
          Modules
        </p>
        {MODULES.map((m) => {
          const href = base + m.href;
          const isActive = pathname.startsWith(href);
          return (
            <Link
              key={m.href}
              href={href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all mb-0.5",
                m.color, m.bg
              )}
              style={isActive ? { background: "rgba(255,255,255,0.08)" } : {}}
            >
              <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", m.dot)} />
              {m.label}
            </Link>
          );
        })}
      </div>

      {/* Intelligence & Tools */}
      <div className="px-3 py-3 mt-auto" style={{ borderTop: "1px solid #1e293b" }}>
        <p className="text-xs px-3 mb-2 uppercase tracking-widest font-semibold" style={{ color: "#334155" }}>
          Intelligence
        </p>
        {INTELLIGENCE.map((m) => {
          const href = base + m.href;
          const isActive = pathname.startsWith(href);
          return (
            <Link
              key={m.href}
              href={href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all mb-0.5",
                m.color, m.bg
              )}
              style={isActive ? { background: "rgba(255,255,255,0.08)" } : {}}
            >
              <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", m.dot)} />
              {m.label}
            </Link>
          );
        })}
      </div>

      {/* Portfolio link */}
      <div className="px-3 pb-4">
        <button
          onClick={() => { router.push("/admin"); setMobileOpen(false); }}
          className="w-full text-xs py-2 rounded-lg transition-colors text-center"
          style={{ color: "#475569", border: "1px solid #1e293b" }}
          onMouseEnter={(e) => { (e.target as HTMLElement).style.color = "#94a3b8"; }}
          onMouseLeave={(e) => { (e.target as HTMLElement).style.color = "#475569"; }}
        >
          ← Portfolio Overview
        </button>
      </div>
    </>
  );

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "#f8fafc" }}>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar — desktop: always visible; mobile: slide-in overlay */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 flex flex-col shrink-0 overflow-y-auto transition-transform duration-200 ease-in-out",
          "md:relative md:w-60 md:translate-x-0 md:z-auto",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
        style={{ background: "#0f172a", borderRight: "1px solid #1e293b" }}
      >
        {sidebarContent}
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto min-w-0">
        {/* Mobile top bar */}
        <div
          className="md:hidden flex items-center gap-3 px-4 py-3 sticky top-0 z-30 border-b"
          style={{ background: "#0f172a", borderColor: "#1e293b" }}
        >
          <button
            onClick={() => setMobileOpen(true)}
            className="text-slate-400 hover:text-white p-1 -ml-1"
            aria-label="Open menu"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-5 h-5 rounded flex items-center justify-center shrink-0" style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}>
              <span className="text-white font-bold text-[9px]">A</span>
            </div>
            <span className="text-sm font-semibold text-white truncate">
              {company?.name || "Arche GTM"}
            </span>
          </div>
          {pendingCount > 0 && (
            <Link href={`/dashboard/${companyId}/approval`}>
              <span className="text-xs px-2 py-0.5 rounded-full font-semibold shrink-0" style={{ background: "#6366f1", color: "#fff" }}>
                {pendingCount}
              </span>
            </Link>
          )}
        </div>

        {/* Backend connectivity warning */}
        {isNetworkError && (
          <div className="sticky top-0 z-40 bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-start gap-2 text-sm text-amber-900">
            <span className="shrink-0 mt-0.5">⚠️</span>
            <span>
              <strong>Backend API unreachable.</strong> Set the{" "}
              <code className="bg-amber-100 border border-amber-300 rounded px-1 font-mono text-xs">BACKEND_URL</code>{" "}
              environment variable in your Railway frontend service to your backend&apos;s Railway URL
              (e.g. <code className="bg-amber-100 border border-amber-300 rounded px-1 font-mono text-xs">https://your-backend.up.railway.app</code>).
              All generate and data features will be unavailable until this is configured.
            </span>
          </div>
        )}

        {children}
      </main>
    </div>
  );
}
