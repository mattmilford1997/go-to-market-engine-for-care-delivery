"use client";
import { useParams, usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";
import { companiesApi, approvalApi } from "@/lib/api";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "", label: "Overview", icon: "⬡" },
  { href: "/approval", label: "Approval Queue", icon: "✓" },
  { href: "/campaigns", label: "Campaigns", icon: "📊" },
  { href: "/leads", label: "Leads", icon: "👥" },
  { href: "/budget", label: "Budget", icon: "💰" },
  { href: "/library", label: "Materials", icon: "📁" },
  { href: "/settings", label: "Settings & Credentials", icon: "⚙" },
];

const MODULES = [
  { href: "/paid-ads", label: "Paid Ads", color: "text-orange-400 hover:text-orange-300", bg: "hover:bg-orange-500/10", dot: "bg-orange-400" },
  { href: "/referral", label: "Referral", color: "text-emerald-400 hover:text-emerald-300", bg: "hover:bg-emerald-500/10", dot: "bg-emerald-400" },
  { href: "/content", label: "Content", color: "text-violet-400 hover:text-violet-300", bg: "hover:bg-violet-500/10", dot: "bg-violet-400" },
  { href: "/seo", label: "SEO", color: "text-sky-400 hover:text-sky-300", bg: "hover:bg-sky-500/10", dot: "bg-sky-400" },
  { href: "/profiles", label: "Profiles", color: "text-pink-400 hover:text-pink-300", bg: "hover:bg-pink-500/10", dot: "bg-pink-400" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { companyId } = useParams<{ companyId: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const [company, setCompany] = useState<any>(null);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (!companyId) return;
    companiesApi.get(companyId).then((r) => setCompany(r.data)).catch(() => {});
    approvalApi.count(companyId).then((r) => setPendingCount(r.data.pending)).catch(() => {});
  }, [companyId]);

  const base = `/dashboard/${companyId}`;

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "#f8fafc" }}>
      {/* Sidebar */}
      <aside
        className="w-60 flex flex-col shrink-0 overflow-y-auto"
        style={{ background: "#0f172a", borderRight: "1px solid #1e293b" }}
      >
        {/* Logo */}
        <div className="px-5 py-4" style={{ borderBottom: "1px solid #1e293b" }}>
          <button
            onClick={() => router.push("/")}
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
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all mb-0.5",
                  isActive
                    ? "text-white font-medium"
                    : "font-normal"
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
        <div className="px-3 py-3 mt-auto" style={{ borderTop: "1px solid #1e293b" }}>
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
            onClick={() => router.push("/admin")}
            className="w-full text-xs py-2 rounded-lg transition-colors text-center"
            style={{ color: "#475569", border: "1px solid #1e293b" }}
            onMouseEnter={(e) => { (e.target as HTMLElement).style.color = "#94a3b8"; }}
            onMouseLeave={(e) => { (e.target as HTMLElement).style.color = "#475569"; }}
          >
            ← Portfolio Overview
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
