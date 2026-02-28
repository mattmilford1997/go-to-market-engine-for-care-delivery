"use client";
import { useParams, usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";
import { companiesApi, approvalApi } from "@/lib/api";
import { cn, healthColor } from "@/lib/utils";

const NAV = [
  { href: "", label: "Overview", icon: "⬡" },
  { href: "/campaigns", label: "Campaigns", icon: "📊" },
  { href: "/approval", label: "Approval Queue", icon: "✓" },
  { href: "/leads", label: "Leads", icon: "👥" },
  { href: "/budget", label: "Budget", icon: "💰" },
  { href: "/library", label: "Materials", icon: "📁" },
  { href: "/settings", label: "Settings & Credentials", icon: "⚙" },
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
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-60 bg-white border-r border-gray-200 flex flex-col shrink-0">
        {/* Logo */}
        <div className="px-5 py-4 border-b border-gray-100">
          <button onClick={() => router.push("/")} className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
              <span className="text-white font-bold text-xs">A</span>
            </div>
            <span className="font-semibold text-gray-800 text-sm">Arche GTM</span>
          </button>
        </div>

        {/* Company card */}
        {company && (
          <div className="px-4 py-3 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <div className={cn("w-2 h-2 rounded-full shrink-0", healthColor("green"))} />
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{company.name}</p>
                <p className="text-xs text-gray-400 truncate">{company.website_url?.replace(/^https?:\/\//, "")}</p>
              </div>
            </div>
            {company.is_pilot && (
              <span className="mt-1.5 inline-block text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">
                Pilot
              </span>
            )}
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 py-3 px-3 overflow-y-auto">
          {NAV.map((item) => {
            const href = base + item.href;
            const isActive = pathname === href || (item.href === "" && pathname === base);
            return (
              <Link
                key={item.href}
                href={href}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors mb-0.5",
                  isActive
                    ? "bg-blue-50 text-blue-700 font-medium"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                )}
              >
                <span className="text-base leading-none">{item.icon}</span>
                <span className="flex-1">{item.label}</span>
                {item.label === "Approval Queue" && pendingCount > 0 && (
                  <span className="bg-blue-600 text-white text-xs px-1.5 py-0.5 rounded-full font-medium">
                    {pendingCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Module quick-links */}
        <div className="px-3 py-3 border-t border-gray-100">
          <p className="text-xs text-gray-400 px-3 mb-2 uppercase tracking-wide font-medium">Modules</p>
          {[
            { label: "Paid Ads", color: "bg-orange-100 text-orange-700" },
            { label: "Referral", color: "bg-green-100 text-green-700" },
            { label: "Content", color: "bg-purple-100 text-purple-700" },
            { label: "SEO", color: "bg-blue-100 text-blue-700" },
            { label: "Profiles", color: "bg-pink-100 text-pink-700" },
          ].map((m) => (
            <span
              key={m.label}
              className={cn("inline-block text-xs px-2 py-0.5 rounded-full mr-1 mb-1 font-medium", m.color)}
            >
              {m.label}
            </span>
          ))}
        </div>

        {/* Portfolio link */}
        <div className="px-3 pb-4">
          <button
            onClick={() => router.push("/admin")}
            className="w-full text-xs text-gray-400 hover:text-gray-600 text-center py-2 border border-gray-100 rounded-lg transition-colors"
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
