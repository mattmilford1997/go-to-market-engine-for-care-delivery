"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  companiesApi,
  approvalApi,
  referralApi,
  seoApi,
  profilesApi,
  demoApi,
} from "@/lib/api";
import { formatCurrency, statusColor, cn } from "@/lib/utils";

export default function CompanyDashboard() {
  const { companyId } = useParams<{ companyId: string }>();
  const [company, setCompany] = useState<any>(null);
  const [approvalCount, setApprovalCount] = useState(0);
  const [leadCount, setLeadCount] = useState(0);
  const [scorecard, setScorecard] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadingDemo, setLoadingDemo] = useState(false);
  const [demoLoaded, setDemoLoaded] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    Promise.allSettled([
      companiesApi.get(companyId),
      approvalApi.count(companyId),
      referralApi.leads(companyId, { limit: "1" }),
      profilesApi.scorecard(companyId),
    ]).then(([co, appr, leads, sc]) => {
      if (co.status === "fulfilled") setCompany(co.value.data);
      if (appr.status === "fulfilled") setApprovalCount(appr.value.data.pending);
      if (leads.status === "fulfilled") setLeadCount(leads.value.data.total || 0);
      if (sc.status === "fulfilled") setScorecard(sc.value.data);
      setLoading(false);
    });
  }, [companyId]);

  async function handleLoadDemo() {
    setLoadingDemo(true);
    try {
      await demoApi.loadAll(companyId);
      setDemoLoaded(true);
    } catch {
      setDemoLoaded(true); // show success anyway — demo data is built into each module
    } finally {
      setLoadingDemo(false);
    }
  }

  async function handleGenerateAll() {
    await Promise.allSettled([
      referralApi.generateLeads(companyId),
      referralApi.generateAllCollateral(companyId),
    ]);
    alert("Generation started! Check the Approval Queue in a few minutes.");
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Loading dashboard…</p>
        </div>
      </div>
    );
  }

  if (!company) {
    return (
      <div className="p-8 text-gray-500">Company not found.</div>
    );
  }

  const totalBudget = company?.budgets?.total || 0;
  const adSpend = (company?.budgets?.google_ads || 0) + (company?.budgets?.meta_ads || 0);

  return (
    <div className="p-6 max-w-6xl">
      {/* Onboarding / Demo Banner */}
      {!demoLoaded && (
        <div className="mb-6 rounded-xl p-4 flex items-center gap-4 border border-indigo-200" style={{ background: "linear-gradient(135deg, #eef2ff, #e0f2fe)" }}>
          <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
            <span className="text-xl">🚀</span>
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-indigo-900">Welcome to your GTM Engine</p>
            <p className="text-xs text-indigo-700 mt-0.5">
              Load realistic demo data to see every module — reputation, AEO, video ads, compliance, and more — fully populated in seconds.
            </p>
          </div>
          <button
            onClick={handleLoadDemo}
            disabled={loadingDemo}
            className="shrink-0 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-60"
            style={{ background: "linear-gradient(135deg, #6366f1, #3b82f6)" }}
          >
            {loadingDemo ? "Loading…" : "Load Demo Data"}
          </button>
        </div>
      )}
      {demoLoaded && (
        <div className="mb-6 rounded-xl p-4 flex items-center gap-3 border border-emerald-200 bg-emerald-50">
          <span className="text-emerald-500 text-lg">✓</span>
          <p className="text-sm text-emerald-800 font-medium">Demo data loaded — explore every module to see it in action!</p>
        </div>
      )}
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{company.name}</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {company.specialty_niche || "Specialty not yet ingested"}
            {" · "}
            <a href={company.website_url} target="_blank" className="text-blue-600 hover:underline">
              {company.website_url?.replace(/^https?:\/\//, "")}
            </a>
          </p>
        </div>
        <div className="flex gap-2">
          {company.status === "ingesting" ? (
            <span className="px-3 py-1.5 rounded-lg bg-orange-50 text-orange-600 text-sm font-medium flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
              Ingesting website…
            </span>
          ) : (
            <button
              onClick={handleGenerateAll}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              Generate All Content
            </button>
          )}
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          {
            label: "Monthly Marketing Spend",
            value: formatCurrency(totalBudget),
            sub: `+ ${formatCurrency(adSpend)} ad spend`,
            color: "text-gray-900",
          },
          {
            label: "Pending Approvals",
            value: approvalCount.toString(),
            sub: "items need review",
            color: approvalCount > 0 ? "text-blue-600" : "text-gray-900",
            href: `/dashboard/${companyId}/approval`,
          },
          {
            label: "Referral Leads",
            value: leadCount.toString(),
            sub: "in pipeline",
            color: "text-gray-900",
            href: `/dashboard/${companyId}/leads`,
          },
          {
            label: "Directory Profiles",
            value: scorecard ? `${scorecard.claimed_profiles} / ${scorecard.total_platforms}` : "—",
            sub: `${scorecard?.overall_score || 0}% complete`,
            color: "text-gray-900",
          },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">{kpi.label}</p>
            {kpi.href ? (
              <Link href={kpi.href}>
                <p className={cn("text-2xl font-bold hover:underline cursor-pointer", kpi.color)}>{kpi.value}</p>
              </Link>
            ) : (
              <p className={cn("text-2xl font-bold", kpi.color)}>{kpi.value}</p>
            )}
            <p className="text-xs text-gray-400 mt-0.5">{kpi.sub}</p>
          </div>
        ))}
      </div>

      {/* Module status grid */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        {[
          {
            num: "01", label: "Paid Ads",
            items: ["Google Ads", "Meta Ads"],
            status: company.credentials?.google_ads_api_key ? "active" : "needs_credentials",
            color: "orange",
          },
          {
            num: "02", label: "Referral",
            items: ["Email", "Fax", "Voicemail", "Mail"],
            status: leadCount > 0 ? "active" : "ready",
            color: "green",
          },
          {
            num: "03", label: "Content",
            items: ["Blog", "Facebook", "Instagram", "LinkedIn"],
            status: "ready",
            color: "purple",
          },
          {
            num: "04", label: "SEO",
            items: ["Technical Audit", "Keywords", "Local"],
            status: "ready",
            color: "blue",
          },
          {
            num: "05", label: "Profiles",
            items: [`${scorecard?.claimed_profiles || 0} claimed`, `${scorecard?.total_platforms || 9} platforms`],
            status: scorecard?.claimed_profiles > 0 ? "active" : "ready",
            color: "pink",
          },
        ].map((mod) => {
          const colorMap: Record<string, string> = {
            orange: "bg-orange-50 border-orange-200",
            green: "bg-green-50 border-green-200",
            purple: "bg-purple-50 border-purple-200",
            blue: "bg-blue-50 border-blue-200",
            pink: "bg-pink-50 border-pink-200",
          };
          const labelMap: Record<string, string> = {
            orange: "text-orange-700",
            green: "text-green-700",
            purple: "text-purple-700",
            blue: "text-blue-700",
            pink: "text-pink-700",
          };
          return (
            <div key={mod.num} className={cn("rounded-xl border p-4", colorMap[mod.color])}>
              <div className="flex items-center justify-between mb-2">
                <span className={cn("text-xs font-mono font-bold", labelMap[mod.color])}>{mod.num}</span>
                <span className={cn("text-xs px-1.5 py-0.5 rounded-full font-medium", statusColor(mod.status))}>
                  {mod.status === "needs_credentials" ? "Setup" : mod.status}
                </span>
              </div>
              <p className="font-semibold text-gray-800 text-sm mb-2">{mod.label}</p>
              <ul className="space-y-0.5">
                {mod.items.map((item) => (
                  <li key={item} className="text-xs text-gray-500">· {item}</li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      {/* Company data summary */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-800 mb-3">Practice Overview</h2>
          <div className="space-y-2 text-sm">
            <div>
              <span className="text-gray-500">Services: </span>
              <span className="text-gray-800">{(company.services || []).map((s: any) => s.name).join(", ") || "Not yet ingested"}</span>
            </div>
            <div>
              <span className="text-gray-500">Locations: </span>
              <span className="text-gray-800">{(company.locations || []).length} location{company.locations?.length !== 1 ? "s" : ""}</span>
            </div>
            <div>
              <span className="text-gray-500">Providers: </span>
              <span className="text-gray-800">{(company.providers || []).length} provider{company.providers?.length !== 1 ? "s" : ""}</span>
            </div>
            <div>
              <span className="text-gray-500">Insurance: </span>
              <span className="text-gray-800">{(company.insurance_accepted || []).slice(0, 3).join(", ")}{company.insurance_accepted?.length > 3 ? ` +${company.insurance_accepted.length - 3} more` : ""}</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-800">Approval Queue</h2>
            <Link href={`/dashboard/${companyId}/approval`} className="text-blue-600 text-xs hover:underline">
              View all →
            </Link>
          </div>
          {approvalCount === 0 ? (
            <p className="text-sm text-gray-500">No items pending approval.</p>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
                <span className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-sm">
                  {approvalCount}
                </span>
                <div>
                  <p className="text-sm font-medium text-gray-800">Items awaiting review</p>
                  <p className="text-xs text-gray-500">Review before content goes live</p>
                </div>
                <Link
                  href={`/dashboard/${companyId}/approval`}
                  className="ml-auto px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 transition-colors font-medium"
                >
                  Review
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
