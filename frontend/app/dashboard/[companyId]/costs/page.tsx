"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  DollarSign, TrendingUp, Bot, RefreshCw, Calculator,
  ChevronDown, ArrowUp, ArrowDown,
} from "lucide-react";
import { costsApi } from "@/lib/api";
import { cn } from "@/lib/utils";

const fmt = (n: number) =>
  n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(2)}`;
const fmtFull = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

const CHANNELS = [
  { value: "fax",         label: "E-Fax" },
  { value: "email",       label: "Email Outreach" },
  { value: "voicemail",   label: "Ringless Voicemail" },
  { value: "mail",        label: "Direct Mail" },
  { value: "google_ads",  label: "Google Ads" },
  { value: "meta_ads",    label: "Meta Ads" },
  { value: "tiktok_ads",  label: "TikTok Ads" },
  { value: "linkedin_ads",label: "LinkedIn Ads" },
];

const AI_PROVIDERS = [
  { value: "anthropic", label: "Claude (Anthropic)" },
  { value: "openai",    label: "ChatGPT (OpenAI)" },
  { value: "gemini",    label: "Gemini (Google)" },
];

const STATUS_COLORS: Record<string, string> = {
  active:    "bg-emerald-50 text-emerald-700",
  completed: "bg-blue-50 text-blue-700",
  scheduled: "bg-amber-50 text-amber-700",
};

const CH_COLORS: Record<string, string> = {
  fax: "#3b82f6", email: "#8b5cf6", voicemail: "#10b981",
  mail: "#f59e0b", google_ads: "#ef4444", meta_ads: "#1877f2",
  tiktok_ads: "#010101", linkedin_ads: "#0077b5",
};

function KPICard({ icon, label, value, sub, trend, accent }: {
  icon: React.ReactNode; label: string; value: string;
  sub?: string; trend?: "up" | "down" | "neutral"; accent: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-start gap-4">
      <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center shrink-0", accent)}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-2xl font-bold text-gray-900 leading-none">{value}</p>
        <p className="text-sm font-medium text-gray-700 mt-0.5">{label}</p>
        {sub && (
          <div className="flex items-center gap-1 mt-1">
            {trend === "up"   && <ArrowUp   className="w-3 h-3 text-emerald-500" />}
            {trend === "down" && <ArrowDown className="w-3 h-3 text-rose-500" />}
            <span className="text-xs text-gray-400">{sub}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function CostsPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const [tab, setTab] = useState<"overview" | "campaigns" | "history" | "estimator">("overview");

  // Summary
  const [summary, setSummary] = useState<any>(null);

  // History
  const [histView, setHistView]       = useState<"weekly" | "monthly">("weekly");
  const [histPeriods, setHistPeriods] = useState(12);
  const [histData, setHistData]       = useState<any[]>([]);
  const [histTotals, setHistTotals]   = useState<any>(null);
  const [loadingHist, setLoadingHist] = useState(false);

  // Campaigns
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [campTotals, setCampTotals] = useState<any>(null);

  // Estimator
  const [estChannel,    setEstChannel]    = useState("fax");
  const [estVolume,     setEstVolume]     = useState("10000");
  const [estProvider,   setEstProvider]   = useState("anthropic");
  const [estIncludeTts, setEstIncludeTts] = useState(true);
  const [estimating,    setEstimating]    = useState(false);
  const [estimate,      setEstimate]      = useState<any>(null);

  const [loading, setLoading] = useState(true);

  // Initial load
  useEffect(() => {
    if (!companyId) return;
    Promise.allSettled([
      costsApi.summary(companyId),
      costsApi.byCampaign(companyId),
    ]).then(([s, c]) => {
      if (s.status === "fulfilled") setSummary(s.value.data);
      if (c.status === "fulfilled") {
        setCampaigns(c.value.data.campaigns || []);
        setCampTotals(c.value.data.totals || null);
      }
    }).finally(() => setLoading(false));
  }, [companyId]);

  // Load history when tab changes to history or view/period changes
  useEffect(() => {
    if (tab !== "history" && tab !== "overview") return;
    if (!companyId) return;
    setLoadingHist(true);
    costsApi.history(companyId, histView, histPeriods)
      .then((r) => {
        setHistData(r.data.data || []);
        setHistTotals(r.data.totals || null);
      })
      .catch(() => {})
      .finally(() => setLoadingHist(false));
  }, [companyId, histView, histPeriods, tab]);

  async function handleEstimate() {
    if (!companyId) return;
    setEstimating(true);
    setEstimate(null);
    try {
      const r = await costsApi.estimate(companyId, {
        channel: estChannel,
        volume: parseInt(estVolume) || 1000,
        ai_provider: estProvider,
        include_tts: estIncludeTts,
      });
      setEstimate(r.data);
    } catch {
      setEstimate(null);
    } finally {
      setEstimating(false);
    }
  }

  const TABS = [
    { key: "overview",  label: "Overview" },
    { key: "history",   label: "Cost History" },
    { key: "campaigns", label: "By Campaign" },
    { key: "estimator", label: "Cost Estimator" },
  ] as const;

  return (
    <div className="min-h-full">
      {/* Header */}
      <div className="px-8 py-7 text-white" style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)" }}>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="w-5 h-5 opacity-80" />
              <span className="text-sm font-medium opacity-80 uppercase tracking-wide">Finance</span>
            </div>
            <h1 className="text-2xl font-bold">Campaign Costs</h1>
            <p className="text-slate-400 text-sm mt-1">Ad spend · AI API costs · Channel fees · Cost estimator</p>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 mt-6">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                tab === t.key
                  ? "bg-white/15 text-white"
                  : "text-slate-400 hover:text-white hover:bg-white/10"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-8 space-y-6">
        {/* ── OVERVIEW TAB ─────────────────────────────────────────────────── */}
        {tab === "overview" && (
          <>
            {loading ? (
              <div className="flex justify-center py-16">
                <RefreshCw className="w-7 h-7 text-indigo-400 animate-spin" />
              </div>
            ) : (
              <>
                {/* KPI cards */}
                <div className="grid grid-cols-4 gap-4">
                  <KPICard
                    icon={<DollarSign className="w-5 h-5 text-slate-600" />}
                    label="Total Historical Spend"
                    value={fmtFull(summary?.total_historical || 0)}
                    sub="All campaigns, all time"
                    accent="bg-slate-100"
                  />
                  <KPICard
                    icon={<TrendingUp className="w-5 h-5 text-indigo-600" />}
                    label="This Month"
                    value={fmtFull(summary?.this_month || 0)}
                    sub={summary?.mom_change_pct != null ? `${summary.mom_change_pct > 0 ? "+" : ""}${summary.mom_change_pct}% vs last month` : ""}
                    trend={summary?.mom_change_pct > 0 ? "up" : "down"}
                    accent="bg-indigo-50"
                  />
                  <KPICard
                    icon={<Bot className="w-5 h-5 text-violet-600" />}
                    label="AI API Cost (month)"
                    value={fmtFull(summary?.total_ai_cost || 0)}
                    sub="Content & copy generation"
                    accent="bg-violet-50"
                  />
                  <KPICard
                    icon={<Calculator className="w-5 h-5 text-emerald-600" />}
                    label="Blended CAC"
                    value={fmtFull(summary?.blended_cac || 0)}
                    sub={`${summary?.total_referrals || 0} referrals this month`}
                    accent="bg-emerald-50"
                  />
                </div>

                {/* Mini history chart */}
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="font-semibold text-gray-900">Spend Over Time</h2>
                    <div className="flex gap-1">
                      {(["weekly", "monthly"] as const).map((v) => (
                        <button
                          key={v}
                          onClick={() => setHistView(v)}
                          className={cn(
                            "px-3 py-1 rounded-lg text-xs font-medium transition-colors",
                            histView === v ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                          )}
                        >
                          {v === "weekly" ? "Weekly" : "Monthly"}
                        </button>
                      ))}
                    </div>
                  </div>
                  {loadingHist ? (
                    <div className="flex justify-center py-12">
                      <RefreshCw className="w-5 h-5 text-indigo-400 animate-spin" />
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <AreaChart data={histData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                        <defs>
                          <linearGradient id="adGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="chGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                        <Tooltip formatter={(v: number | undefined) => v != null ? fmtFull(v) : ""} />
                        <Legend iconSize={8} wrapperStyle={{ fontSize: "11px" }} />
                        <Area type="monotone" dataKey="ad_spend" name="Ad Spend" stroke="#6366f1" fill="url(#adGrad)" strokeWidth={2} />
                        <Area type="monotone" dataKey="channel_spend" name="Channel Fees" stroke="#10b981" fill="url(#chGrad)" strokeWidth={2} />
                        <Area type="monotone" dataKey="ai_cost" name="AI Cost" stroke="#f59e0b" fill="none" strokeWidth={1.5} strokeDasharray="4 2" />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>

                {/* Cost breakdown by type */}
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { label: "Ad Spend", value: fmtFull(summary?.total_ad_spend || 0), desc: "Paid media: Google, Meta, TikTok, LinkedIn", color: "border-indigo-200 bg-indigo-50" },
                    { label: "Channel Fees", value: fmtFull(summary?.total_channel_fees || 0), desc: "Fax, email platform, voicemail, direct mail", color: "border-emerald-200 bg-emerald-50" },
                    { label: "AI Generation", value: fmtFull(summary?.total_ai_cost || 0), desc: "LLM tokens for copy, scripts & sequences", color: "border-violet-200 bg-violet-50" },
                  ].map((item) => (
                    <div key={item.label} className={cn("rounded-xl border p-5", item.color)}>
                      <p className="text-2xl font-bold text-gray-900">{item.value}</p>
                      <p className="text-sm font-semibold text-gray-800 mt-0.5">{item.label}</p>
                      <p className="text-xs text-gray-500 mt-1">{item.desc}</p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {/* ── HISTORY TAB ──────────────────────────────────────────────────── */}
        {tab === "history" && (
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <div className="flex gap-1">
                {(["weekly", "monthly"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setHistView(v)}
                    className={cn(
                      "px-4 py-1.5 rounded-lg text-sm font-medium transition-colors",
                      histView === v ? "bg-indigo-600 text-white" : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
                    )}
                  >
                    {v === "weekly" ? "Weekly" : "Monthly"}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">Periods:</span>
                <select
                  value={histPeriods}
                  onChange={(e) => setHistPeriods(Number(e.target.value))}
                  className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-indigo-400"
                >
                  {histView === "weekly"
                    ? [4, 8, 12, 16, 26].map((p) => <option key={p} value={p}>{p} weeks</option>)
                    : [3, 6, 12].map((p) => <option key={p} value={p}>{p} months</option>)
                  }
                </select>
              </div>
              {histTotals && (
                <div className="ml-auto text-sm text-gray-500">
                  Period total: <span className="font-semibold text-gray-900">{fmtFull(histTotals.total)}</span>
                </div>
              )}
            </div>

            {loadingHist ? (
              <div className="flex justify-center py-16">
                <RefreshCw className="w-7 h-7 text-indigo-400 animate-spin" />
              </div>
            ) : (
              <>
                {/* Stacked bar chart */}
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                  <h2 className="font-semibold text-gray-900 mb-4">
                    Cost Breakdown — {histView === "weekly" ? "Week by Week" : "Month by Month"}
                  </h2>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={histData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} angle={histView === "weekly" ? -35 : 0} textAnchor={histView === "weekly" ? "end" : "middle"} height={histView === "weekly" ? 50 : 30} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                      <Tooltip formatter={(v: number | undefined) => v != null ? fmtFull(v) : ""} />
                      <Legend iconSize={8} wrapperStyle={{ fontSize: "11px" }} />
                      <Bar dataKey="ad_spend"      name="Ad Spend"      fill="#6366f1" stackId="a" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="channel_spend" name="Channel Fees"  fill="#10b981" stackId="a" />
                      <Bar dataKey="ai_cost"       name="AI Cost"       fill="#f59e0b" stackId="a" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Data table */}
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50">
                        <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">Period</th>
                        <th className="text-right px-5 py-3 text-xs font-medium text-gray-500 uppercase">Ad Spend</th>
                        <th className="text-right px-5 py-3 text-xs font-medium text-gray-500 uppercase">Channel Fees</th>
                        <th className="text-right px-5 py-3 text-xs font-medium text-gray-500 uppercase">AI Cost</th>
                        <th className="text-right px-5 py-3 text-xs font-medium text-gray-500 uppercase">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {histData.map((row, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-5 py-3 font-medium text-gray-800">{row.label}</td>
                          <td className="px-5 py-3 text-right text-gray-600">{fmtFull(row.ad_spend)}</td>
                          <td className="px-5 py-3 text-right text-gray-600">{fmtFull(row.channel_spend)}</td>
                          <td className="px-5 py-3 text-right text-gray-600">{fmtFull(row.ai_cost)}</td>
                          <td className="px-5 py-3 text-right font-semibold text-gray-900">{fmtFull(row.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                    {histTotals && (
                      <tfoot>
                        <tr className="bg-gray-50 border-t border-gray-200 font-semibold">
                          <td className="px-5 py-3 text-gray-900">Total</td>
                          <td className="px-5 py-3 text-right text-gray-900">{fmtFull(histTotals.ad_spend)}</td>
                          <td className="px-5 py-3 text-right text-gray-900">{fmtFull(histTotals.channel_spend)}</td>
                          <td className="px-5 py-3 text-right text-gray-900">{fmtFull(histTotals.ai_cost)}</td>
                          <td className="px-5 py-3 text-right text-indigo-700">{fmtFull(histTotals.total)}</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── BY CAMPAIGN TAB ──────────────────────────────────────────────── */}
        {tab === "campaigns" && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">Campaign</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">Channel</th>
                    <th className="text-center px-5 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="text-right px-5 py-3 text-xs font-medium text-gray-500 uppercase">Volume</th>
                    <th className="text-right px-5 py-3 text-xs font-medium text-gray-500 uppercase">Ad Spend</th>
                    <th className="text-right px-5 py-3 text-xs font-medium text-gray-500 uppercase">AI Cost</th>
                    <th className="text-right px-5 py-3 text-xs font-medium text-gray-500 uppercase">Total</th>
                    <th className="text-right px-5 py-3 text-xs font-medium text-gray-500 uppercase">Referrals</th>
                    <th className="text-right px-5 py-3 text-xs font-medium text-gray-500 uppercase">CAC</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {campaigns.map((c) => (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3">
                        <div className="font-medium text-gray-900">{c.name}</div>
                        <div className="text-xs text-gray-400 mt-0.5">{c.launched}</div>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ background: CH_COLORS[c.channel] || "#94a3b8" }}
                          />
                          <span className="text-gray-600">{c.channel.replace("_", " ")}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-center">
                        <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", STATUS_COLORS[c.status] || "bg-gray-100 text-gray-600")}>
                          {c.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right text-gray-600">{c.volume.toLocaleString()}</td>
                      <td className="px-5 py-3 text-right text-gray-600">{fmtFull(c.ad_spend || 0)}</td>
                      <td className="px-5 py-3 text-right text-violet-600">{fmtFull((c.ai_cost || 0) + (c.tts_cost || 0))}</td>
                      <td className="px-5 py-3 text-right font-semibold text-gray-900">{fmtFull(c.total_cost)}</td>
                      <td className="px-5 py-3 text-right text-gray-600">{c.referrals_generated}</td>
                      <td className="px-5 py-3 text-right">
                        {c.cac > 0 ? (
                          <span className="font-semibold text-gray-900">{fmtFull(c.cac)}</span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {campTotals && (
                  <tfoot>
                    <tr className="bg-gray-50 border-t border-gray-200 font-semibold">
                      <td colSpan={4} className="px-5 py-3 text-gray-900">Totals</td>
                      <td className="px-5 py-3 text-right text-gray-900">{fmtFull(campTotals.ad_spend)}</td>
                      <td className="px-5 py-3 text-right text-violet-700">{fmtFull(campTotals.ai_cost)}</td>
                      <td className="px-5 py-3 text-right text-indigo-700">{fmtFull(campTotals.total)}</td>
                      <td className="px-5 py-3 text-right text-gray-900">{campTotals.referrals}</td>
                      <td className="px-5 py-3 text-right text-gray-400">—</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            <p className="text-xs text-gray-400">
              AI Cost includes LLM generation and TTS (ElevenLabs) where applicable. Platform subscription fees (Instantly $97/mo) shown as channel fees, not AI cost.
            </p>
          </div>
        )}

        {/* ── ESTIMATOR TAB ────────────────────────────────────────────────── */}
        {tab === "estimator" && (
          <div className="grid grid-cols-5 gap-6">
            {/* Controls */}
            <div className="col-span-2 space-y-4">
              <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
                <h2 className="font-semibold text-gray-900">Configure Campaign</h2>

                <div>
                  <label className="text-xs font-medium text-gray-700 mb-1.5 block">Channel</label>
                  <div className="relative">
                    <select
                      value={estChannel}
                      onChange={(e) => setEstChannel(e.target.value)}
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400 appearance-none"
                    >
                      {CHANNELS.map((ch) => (
                        <option key={ch.value} value={ch.value}>{ch.label}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2.5 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-gray-700 mb-1.5 block">
                    Volume{" "}
                    <span className="font-normal text-gray-400">
                      ({["google_ads", "meta_ads", "tiktok_ads", "linkedin_ads"].includes(estChannel) ? "clicks" : estChannel === "email" ? "emails" : estChannel === "voicemail" ? "drops" : "pieces"})
                    </span>
                  </label>
                  <input
                    type="number"
                    value={estVolume}
                    onChange={(e) => setEstVolume(e.target.value)}
                    min="1"
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400"
                    placeholder="e.g. 10000"
                  />
                  <div className="flex gap-1.5 mt-1.5 flex-wrap">
                    {[500, 1000, 5000, 10000, 50000].map((v) => (
                      <button
                        key={v}
                        onClick={() => setEstVolume(String(v))}
                        className="text-xs px-2 py-1 rounded-md bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors"
                      >
                        {v.toLocaleString()}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-gray-700 mb-1.5 block">AI Provider</label>
                  <div className="relative">
                    <select
                      value={estProvider}
                      onChange={(e) => setEstProvider(e.target.value)}
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400 appearance-none"
                    >
                      {AI_PROVIDERS.map((p) => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2.5 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                </div>

                {estChannel === "voicemail" && (
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="tts"
                      checked={estIncludeTts}
                      onChange={(e) => setEstIncludeTts(e.target.checked)}
                      className="rounded"
                    />
                    <label htmlFor="tts" className="text-sm text-gray-700">Include ElevenLabs TTS cost</label>
                  </div>
                )}

                <button
                  onClick={handleEstimate}
                  disabled={estimating}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  {estimating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Calculator className="w-4 h-4" />}
                  Calculate Estimate
                </button>
              </div>

              {/* Rate reference */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="text-sm font-semibold text-gray-800 mb-3">AI Token Rates</h3>
                <div className="space-y-2 text-xs text-gray-600">
                  <div className="flex justify-between"><span>Claude Sonnet</span><span className="font-medium">$3 / $15 per M</span></div>
                  <div className="flex justify-between"><span>GPT-4o</span><span className="font-medium">$2.50 / $10 per M</span></div>
                  <div className="flex justify-between"><span>Gemini 2.0 Flash</span><span className="font-medium">$0.075 / $0.30 per M</span></div>
                </div>
              </div>
            </div>

            {/* Results */}
            <div className="col-span-3 space-y-4">
              {!estimate && !estimating && (
                <div className="bg-white rounded-xl border border-dashed border-gray-200 p-12 text-center">
                  <Calculator className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 text-sm">Configure your campaign on the left and click <strong>Calculate Estimate</strong>.</p>
                  <p className="text-gray-400 text-xs mt-1">Example: 10,000 faxes with Claude Anthropic.</p>
                </div>
              )}

              {estimating && (
                <div className="bg-white rounded-xl border border-gray-200 p-12 flex justify-center">
                  <RefreshCw className="w-7 h-7 text-indigo-400 animate-spin" />
                </div>
              )}

              {estimate && (
                <>
                  {/* Total cost range */}
                  <div className="bg-white rounded-xl border border-gray-200 p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h2 className="font-semibold text-gray-900">
                          {estimate.volume?.toLocaleString()} {estimate.channel_label} — Estimated Cost
                        </h2>
                        <p className="text-xs text-gray-400 mt-0.5">{estimate.media_label} · {estimate.ai_provider_label}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3 mb-6">
                      {[
                        { label: "Low estimate", value: estimate.totals?.low, color: "bg-emerald-50 border-emerald-200 text-emerald-700" },
                        { label: "Mid estimate", value: estimate.totals?.mid, color: "bg-indigo-50 border-indigo-300 text-indigo-700" },
                        { label: "High estimate", value: estimate.totals?.high, color: "bg-rose-50 border-rose-200 text-rose-700" },
                      ].map((t) => (
                        <div key={t.label} className={cn("rounded-xl border p-4 text-center", t.color)}>
                          <p className="text-xl font-bold">{fmtFull(t.value)}</p>
                          <p className="text-xs font-medium mt-0.5">{t.label}</p>
                        </div>
                      ))}
                    </div>

                    {/* Breakdown */}
                    <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2">Cost Breakdown</h3>
                    <div className="space-y-2">
                      {/* Media */}
                      <div className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg text-sm">
                        <span className="text-gray-700">
                          {estimate.breakdown?.media_cost?.label || "Media cost"}
                        </span>
                        <div className="text-right">
                          <span className="font-semibold text-gray-900">{fmtFull(estimate.breakdown?.media_cost?.mid)}</span>
                          <span className="text-xs text-gray-400 ml-1">(mid)</span>
                        </div>
                      </div>

                      {/* AI */}
                      <div className="flex items-center justify-between px-3 py-2 bg-violet-50 rounded-lg text-sm">
                        <span className="text-gray-700">
                          AI generation — {(estimate.breakdown?.ai_cost?.tokens_input || 0).toLocaleString()} in / {(estimate.breakdown?.ai_cost?.tokens_output || 0).toLocaleString()} out tokens
                        </span>
                        <span className="font-semibold text-violet-700">{fmtFull(estimate.breakdown?.ai_cost?.value)}</span>
                      </div>

                      {/* TTS */}
                      {estimate.breakdown?.tts_cost && (
                        <div className="flex items-center justify-between px-3 py-2 bg-amber-50 rounded-lg text-sm">
                          <span className="text-gray-700">
                            ElevenLabs TTS — {estimate.breakdown.tts_cost.characters?.toLocaleString()} chars
                          </span>
                          <span className="font-semibold text-amber-700">{fmtFull(estimate.breakdown.tts_cost.subtotal)}</span>
                        </div>
                      )}

                      {/* Platform fee */}
                      {estimate.breakdown?.platform_fee?.value > 0 && (
                        <div className="flex items-center justify-between px-3 py-2 bg-emerald-50 rounded-lg text-sm">
                          <span className="text-gray-700">{estimate.breakdown.platform_fee.label} monthly subscription</span>
                          <span className="font-semibold text-emerald-700">{fmtFull(estimate.breakdown.platform_fee.value)}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ROI estimate */}
                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <h3 className="text-sm font-semibold text-gray-900 mb-3">Expected Returns</h3>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="text-center p-3 bg-gray-50 rounded-lg">
                        <p className="text-xl font-bold text-gray-900">{estimate.estimates?.referrals_expected_mid}</p>
                        <p className="text-xs text-gray-500 mt-0.5">Est. referrals (mid)</p>
                      </div>
                      <div className="text-center p-3 bg-gray-50 rounded-lg">
                        <p className="text-xl font-bold text-gray-900">{fmtFull(estimate.estimates?.cac_benchmark)}</p>
                        <p className="text-xs text-gray-500 mt-0.5">CAC benchmark</p>
                      </div>
                      <div className="text-center p-3 bg-gray-50 rounded-lg">
                        <p className="text-xl font-bold text-gray-900">{fmtFull(estimate.estimates?.cost_per_referral_mid)}</p>
                        <p className="text-xs text-gray-500 mt-0.5">Your est. CAC</p>
                      </div>
                    </div>
                  </div>

                  {/* Notes */}
                  {estimate.notes?.length > 0 && (
                    <div className="bg-white rounded-xl border border-gray-200 p-5">
                      <h3 className="text-sm font-semibold text-gray-900 mb-3">Pricing Notes</h3>
                      <ul className="space-y-1.5">
                        {estimate.notes.map((note: string, i: number) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                            <span className="mt-1 w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
                            {note}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
