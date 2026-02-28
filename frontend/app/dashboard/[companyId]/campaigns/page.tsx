"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  referralApi,
  contentApi,
  paidAdsApi,
  seoApi,
  profilesApi,
} from "@/lib/api";
import { cn, statusColor, formatCurrency, formatNumber } from "@/lib/utils";

type Tab = "referral" | "paid_ads" | "content" | "seo" | "profiles";

export default function CampaignsPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const [activeTab, setActiveTab] = useState<Tab>("referral");
  const [referralCampaigns, setReferralCampaigns] = useState<any[]>([]);
  const [contentItems, setContentItems] = useState<any[]>([]);
  const [seoReport, setSeoReport] = useState<any>(null);
  const [scorecard, setScorecard] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    Promise.allSettled([
      referralApi.campaigns(companyId),
      contentApi.items(companyId, { status: "published", limit: "20" }),
      seoApi.latestReport(companyId).catch(() => null),
      profilesApi.scorecard(companyId),
    ]).then(([rc, ci, sr, sc]) => {
      if (rc.status === "fulfilled") setReferralCampaigns(rc.value.data);
      if (ci.status === "fulfilled") setContentItems(ci.value.data.items);
      if (sr.status === "fulfilled" && sr.value) setSeoReport(sr.value.data);
      if (sc.status === "fulfilled") setScorecard(sc.value.data);
    });
  }, [companyId]);

  async function handleGenerate(type: string) {
    setLoading(true);
    try {
      if (type === "google") await paidAdsApi.generateAllGoogle(companyId);
      if (type === "meta") await paidAdsApi.generateAllMeta(companyId);
      if (type === "content") await contentApi.generateFullCalendar(companyId);
      if (type === "seo") await seoApi.runAudit(companyId);
      if (type === "profiles") await profilesApi.generateContent(companyId, "all");
      if (type === "referral_collateral") await referralApi.generateAllCollateral(companyId);
      alert(`${type} generation started — check Approval Queue`);
    } finally {
      setLoading(false);
    }
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: "paid_ads", label: "Paid Ads" },
    { id: "referral", label: "Referral" },
    { id: "content", label: "Content" },
    { id: "seo", label: "SEO" },
    { id: "profiles", label: "Profiles" },
  ];

  return (
    <div className="p-6 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Campaign Performance</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          Unified view across all active channels.
        </p>
      </div>

      {/* Module tabs */}
      <div className="flex gap-1 mb-6">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
              activeTab === t.id
                ? "bg-blue-600 text-white"
                : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Paid Ads */}
      {activeTab === "paid_ads" && (
        <div className="space-y-4">
          <div className="flex gap-3">
            <button
              onClick={() => handleGenerate("google")}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
            >
              Generate Google Ads
            </button>
            <button
              onClick={() => handleGenerate("meta")}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
            >
              Generate Meta Ads
            </button>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-gray-500">
            <p className="text-lg font-medium text-gray-700 mb-1">Google Ads + Meta Ads</p>
            <p className="text-sm mb-4">Connect your API keys in Settings to activate live campaign deployment.</p>
            <p className="text-xs text-gray-400">
              Generate ad copy now → review in Approval Queue → deploy when API keys are connected.
            </p>
          </div>
        </div>
      )}

      {/* Referral */}
      {activeTab === "referral" && (
        <div className="space-y-4">
          <div className="flex gap-3">
            <button
              onClick={() => handleGenerate("referral_collateral")}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
            >
              Generate All Collateral
            </button>
          </div>
          {referralCampaigns.length === 0 ? (
            <EmptyState
              title="No referral campaigns yet"
              desc="Generate leads from NPPES, then launch a multi-channel 30-day sequence."
              href={`/dashboard/${companyId}/leads`}
              ctaLabel="Go to Leads"
            />
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">Campaign</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="text-right px-5 py-3 text-xs font-medium text-gray-500 uppercase">Impressions</th>
                    <th className="text-right px-5 py-3 text-xs font-medium text-gray-500 uppercase">Clicks</th>
                    <th className="text-right px-5 py-3 text-xs font-medium text-gray-500 uppercase">Conversions</th>
                  </tr>
                </thead>
                <tbody>
                  {referralCampaigns.map((c: any) => (
                    <tr key={c.id} className="border-b border-gray-50">
                      <td className="px-5 py-3 font-medium text-gray-800">{c.name}</td>
                      <td className="px-5 py-3">
                        <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", statusColor(c.status))}>
                          {c.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right text-gray-600">{formatNumber(c.impressions || 0)}</td>
                      <td className="px-5 py-3 text-right text-gray-600">{formatNumber(c.clicks || 0)}</td>
                      <td className="px-5 py-3 text-right text-gray-600">{c.form_submissions || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Content */}
      {activeTab === "content" && (
        <div className="space-y-4">
          <button
            onClick={() => handleGenerate("content")}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
          >
            Generate 12-Week Content Calendar
          </button>
          {contentItems.length === 0 ? (
            <EmptyState
              title="No published content yet"
              desc="Generate and approve blog posts, social media posts, and more."
              href={`/dashboard/${companyId}/approval`}
              ctaLabel="Go to Approval Queue"
            />
          ) : (
            <div className="space-y-2">
              {contentItems.map((item: any) => (
                <div key={item.id} className="bg-white rounded-xl border border-gray-200 p-4 flex justify-between items-center">
                  <div>
                    <p className="font-medium text-gray-800 text-sm">{item.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{item.content_type?.replace(/_/g, " ")} · {item.target_keyword}</p>
                  </div>
                  <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", statusColor(item.status))}>
                    {item.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SEO */}
      {activeTab === "seo" && (
        <div className="space-y-4">
          <button
            onClick={() => handleGenerate("seo")}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
          >
            Run SEO Audit
          </button>
          {!seoReport ? (
            <EmptyState
              title="No SEO audit yet"
              desc="Run an audit to get PageSpeed scores, keyword gaps, and technical recommendations."
              href="#"
              ctaLabel=""
            />
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 mb-1">Mobile Score</p>
                  <p className={cn("text-3xl font-bold", seoReport.pagespeed_mobile >= 70 ? "text-green-600" : "text-red-500")}>
                    {seoReport.pagespeed_mobile ?? "—"}
                  </p>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 mb-1">Desktop Score</p>
                  <p className={cn("text-3xl font-bold", seoReport.pagespeed_desktop >= 70 ? "text-green-600" : "text-red-500")}>
                    {seoReport.pagespeed_desktop ?? "—"}
                  </p>
                </div>
              </div>
              <h3 className="font-medium text-gray-800 mb-2 text-sm">Top Recommendations</h3>
              <ul className="space-y-1">
                {(seoReport.recommendations || []).slice(0, 5).map((r: any, i: number) => (
                  <li key={i} className="text-sm text-gray-600 flex gap-2">
                    <span className="text-gray-300">·</span>
                    {r.action || r.issue || JSON.stringify(r)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Profiles */}
      {activeTab === "profiles" && (
        <div className="space-y-4">
          <button
            onClick={() => handleGenerate("profiles")}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
          >
            Generate All Profile Content
          </button>
          {scorecard && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-semibold text-gray-800">Directory Presence Scorecard</h3>
                <span className="text-sm text-gray-500">
                  {scorecard.claimed_profiles} / {scorecard.total_platforms} claimed
                </span>
              </div>
              <div className="divide-y divide-gray-50">
                {scorecard.platforms?.map((p: any) => (
                  <div key={p.platform} className="px-5 py-3 flex items-center gap-4">
                    <div className="w-40 text-sm font-medium text-gray-700">{p.platform_name}</div>
                    <div className="flex-1">
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-2 bg-blue-400 rounded-full"
                          style={{ width: `${p.completeness_score}%` }}
                        />
                      </div>
                    </div>
                    <div className="w-12 text-right text-xs text-gray-500">{p.completeness_score}%</div>
                    <div className="w-24 text-right">
                      <span className={cn(
                        "text-xs px-2 py-0.5 rounded-full font-medium",
                        p.is_claimed ? "bg-green-50 text-green-700" : "bg-gray-50 text-gray-500"
                      )}>
                        {p.is_claimed ? "Claimed" : "Unclaimed"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EmptyState({ title, desc, href, ctaLabel }: {
  title: string; desc: string; href: string; ctaLabel: string;
}) {
  return (
    <div className="text-center py-12 bg-white rounded-xl border border-dashed border-gray-200">
      <p className="font-medium text-gray-700 mb-1">{title}</p>
      <p className="text-gray-500 text-sm mb-3">{desc}</p>
      {ctaLabel && href && (
        <a href={href} className="text-blue-600 text-sm hover:underline">{ctaLabel} →</a>
      )}
    </div>
  );
}
