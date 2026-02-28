"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { TrendingUp, DollarSign, Users, RefreshCw, Zap, Target, ArrowUp, ArrowDown } from "lucide-react";
import { roiApi } from "@/lib/api";
import { formatCurrency, formatNumber, cn } from "@/lib/utils";

// ── Demo fallback ────────────────────────────────────────────────────────────
const DEMO_SUMMARY = {
  total_leads: 847,
  referring_providers: 68,
  total_spend: 4_250,
  pipeline_value: 217_600,
  blended_cac: 62.5,
  roi_percent: 4018,
  active_campaigns: 3,
  estimated_ltv_per_referral: 3_200,
};

const DEMO_CHANNELS = [
  { channel: "fax",       label: "Fax Campaign",    color: "#3b82f6", spend: 380,  impressions: 847, conversions: 23, cac: 16.5, benchmark_cac: 28, cvr_percent: 2.7, efficiency: "above" },
  { channel: "email",     label: "Email Sequence",  color: "#8b5cf6", spend: 97,   impressions: 412, conversions: 11, cac: 8.8,  benchmark_cac: 12, cvr_percent: 2.7, efficiency: "above" },
  { channel: "voicemail", label: "Voicemail Drop",  color: "#10b981", spend: 240,  impressions: 300, conversions: 6,  cac: 40.0, benchmark_cac: 35, cvr_percent: 2.0, efficiency: "below" },
  { channel: "mail",      label: "Direct Mail",     color: "#f59e0b", spend: 450,  impressions: 300, conversions: 6,  cac: 75.0, benchmark_cac: 65, cvr_percent: 2.0, efficiency: "below" },
  { channel: "google",    label: "Google Ads",      color: "#ef4444", spend: 1800, impressions: 4200, conversions: 18, cac: 100.0, benchmark_cac: 140, cvr_percent: 0.4, efficiency: "above" },
  { channel: "meta",      label: "Meta Ads",        color: "#6366f1", spend: 1200, impressions: 8700, conversions: 4,  cac: 300.0, benchmark_cac: 110, cvr_percent: 0.05, efficiency: "below" },
  { channel: "seo",       label: "SEO / Organic",   color: "#14b8a6", spend: 83,   impressions: 920, conversions: 0,  cac: null,  benchmark_cac: 45, cvr_percent: 0, efficiency: "no_data" },
];

const DEMO_RECS = {
  recommendations: [
    { title: "Scale fax campaigns 3x", impact: "high", effort: "low", description: "Fax has your best CAC at $16.50 — well below the $28 benchmark. Increase volume to top 200 PCPs.", metric: "Est. +15 referrers/mo" },
    { title: "Pause Meta Ads temporarily", impact: "high", effort: "low", description: "Meta CAC is $300 vs $110 benchmark. Reallocate that $1,200/mo budget to fax and email.", metric: "Save $1,200/mo" },
    { title: "Add retargeting to Google Ads", impact: "medium", effort: "medium", description: "Your Google CVR of 0.4% is decent. Adding retargeting audiences can double conversion rate.", metric: "Est. 2x CVR" },
    { title: "Launch voicemail nurture sequence", impact: "medium", effort: "low", description: "Voicemail CAC is $40 vs $35 benchmark — close. Adding a follow-up email after each VM drop bridges the gap.", metric: "Reduce CAC to <$30" },
    { title: "Invest in SEO content", impact: "high", effort: "medium", description: "SEO has zero spend and zero tracked conversions — but it compounds over time. 2 blog posts/month adds organic leads.", metric: "Free leads in 90 days" },
  ],
};

// ── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, sub, accent, trend }: {
  icon: React.ReactNode; label: string; value: string | number;
  sub?: string; accent: string; trend?: "up" | "down";
}) {
  return (
    <div className="card card-hover p-5 flex items-start gap-4">
      <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center shrink-0", accent)}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="stat-number">{value}</div>
        <div className="text-sm font-medium text-slate-700 mt-0.5">{label}</div>
        {sub && (
          <div className="flex items-center gap-1 mt-0.5">
            {trend === "up" && <ArrowUp className="w-3 h-3 text-emerald-500" />}
            {trend === "down" && <ArrowDown className="w-3 h-3 text-rose-500" />}
            <span className="text-xs text-slate-400">{sub}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ROIPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const [summary, setSummary] = useState<any>(null);
  const [channels, setChannels] = useState<any[]>([]);
  const [recs, setRecs] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadingRecs, setLoadingRecs] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) return;
    Promise.allSettled([
      roiApi.summary(companyId),
      roiApi.byChannel(companyId),
    ]).then(([s, c]) => {
      const sumData = s.status === "fulfilled" ? s.value.data : DEMO_SUMMARY;
      const chData = c.status === "fulfilled" ? c.value.data.channels : DEMO_CHANNELS;
      setSummary(Object.keys(sumData).length ? sumData : DEMO_SUMMARY);
      setChannels(chData?.length ? chData : DEMO_CHANNELS);
    }).finally(() => setLoading(false));
  }, [companyId]);

  const handleLoadDemo = () => {
    setSummary(DEMO_SUMMARY);
    setChannels(DEMO_CHANNELS);
    setLoading(false);
    setToast("Demo ROI data loaded — showing example attribution metrics");
    setTimeout(() => setToast(null), 3500);
  };

  const handleGetRecs = async () => {
    setLoadingRecs(true);
    try {
      const r = await roiApi.recommendations(companyId);
      setRecs(r.data);
    } catch {
      setRecs(DEMO_RECS);
    } finally {
      setLoadingRecs(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-96">
        <RefreshCw className="w-7 h-7 text-orange-400 animate-spin" />
      </div>
    );
  }

  const totalSpend = channels.reduce((s, c) => s + (c.spend || 0), 0);
  const totalConversions = channels.reduce((s, c) => s + (c.conversions || 0), 0);
  const spendByChannel = channels.filter((c) => c.spend > 0).map((c) => ({
    name: c.label,
    spend: c.spend,
    conversions: c.conversions,
    fill: c.color,
  }));

  const IMPACT_COLORS: Record<string, string> = {
    high: "bg-rose-50 text-rose-700 border-rose-200",
    medium: "bg-amber-50 text-amber-700 border-amber-200",
    low: "bg-slate-50 text-slate-600 border-slate-200",
  };

  return (
    <div className="min-h-full">
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-slate-900 text-white text-sm px-4 py-3 rounded-xl shadow-lg">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="px-8 py-7 text-white" style={{ background: "linear-gradient(135deg, #f97316 0%, #ef4444 100%)" }}>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-5 h-5 opacity-80" />
              <span className="text-sm font-medium opacity-80 uppercase tracking-wide">Marketing Intelligence</span>
            </div>
            <h1 className="text-2xl font-bold">ROI Attribution</h1>
            <p className="text-orange-100 text-sm mt-1">Channel performance · CAC analysis · Strategic recommendations</p>
          </div>
          <div className="flex gap-2">
            <button onClick={handleLoadDemo}
              className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-xl text-sm font-medium border border-white/30">
              <Zap className="w-4 h-4" />Load Demo
            </button>
            <button onClick={handleGetRecs} disabled={loadingRecs}
              className="flex items-center gap-2 px-4 py-2 bg-white/15 hover:bg-white/25 text-white rounded-xl text-sm font-medium border border-white/20 disabled:opacity-50">
              {loadingRecs ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Target className="w-4 h-4" />}
              AI Recommendations
            </button>
          </div>
        </div>
      </div>

      <div className="p-8 space-y-8">
        {/* Top KPIs */}
        <div className="grid grid-cols-4 gap-4">
          <StatCard icon={<DollarSign className="w-5 h-5 text-orange-600" />} label="Total Spend" value={formatCurrency(summary?.total_spend || totalSpend)} sub="All channels" accent="bg-orange-50" />
          <StatCard icon={<Users className="w-5 h-5 text-emerald-600" />} label="Referring Providers" value={formatNumber(summary?.referring_providers || totalConversions)} sub="Actively sending patients" accent="bg-emerald-50" trend="up" />
          <StatCard icon={<TrendingUp className="w-5 h-5 text-blue-600" />} label="Pipeline Value" value={formatCurrency(summary?.pipeline_value || 0)} sub={`@ $${(summary?.estimated_ltv_per_referral || 3200).toLocaleString()} avg LTV`} accent="bg-blue-50" trend="up" />
          <StatCard icon={<Target className="w-5 h-5 text-violet-600" />} label="Blended ROI" value={`${(summary?.roi_percent || 0).toLocaleString()}%`} sub="Return on ad spend" accent="bg-violet-50" trend="up" />
        </div>

        {/* Channel performance table + spend pie */}
        <div className="grid grid-cols-5 gap-6">
          {/* Channel table */}
          <div className="card p-6 col-span-3">
            <h2 className="text-base font-semibold text-slate-900 mb-4">Channel Performance vs. Benchmark</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left pb-3 text-xs font-medium text-slate-500 uppercase">Channel</th>
                    <th className="text-right pb-3 text-xs font-medium text-slate-500 uppercase">Spend</th>
                    <th className="text-right pb-3 text-xs font-medium text-slate-500 uppercase">Conversions</th>
                    <th className="text-right pb-3 text-xs font-medium text-slate-500 uppercase">Your CAC</th>
                    <th className="text-right pb-3 text-xs font-medium text-slate-500 uppercase">Benchmark</th>
                    <th className="text-center pb-3 text-xs font-medium text-slate-500 uppercase">Rating</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {channels.map((ch) => (
                    <tr key={ch.channel} className="hover:bg-slate-50">
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ background: ch.color }} />
                          <span className="font-medium text-slate-800">{ch.label}</span>
                        </div>
                      </td>
                      <td className="py-3 text-right text-slate-600">{ch.spend > 0 ? formatCurrency(ch.spend) : "—"}</td>
                      <td className="py-3 text-right text-slate-600">{ch.conversions}</td>
                      <td className={cn("py-3 text-right font-semibold", ch.efficiency === "above" ? "text-emerald-600" : ch.efficiency === "below" ? "text-rose-600" : "text-slate-400")}>
                        {ch.cac ? `$${ch.cac.toFixed(0)}` : "—"}
                      </td>
                      <td className="py-3 text-right text-slate-400">${ch.benchmark_cac}</td>
                      <td className="py-3 text-center">
                        {ch.efficiency === "above" && <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-medium">Efficient</span>}
                        {ch.efficiency === "below" && <span className="text-xs bg-rose-50 text-rose-700 px-2 py-0.5 rounded-full font-medium">High CAC</span>}
                        {ch.efficiency === "no_data" && <span className="text-xs bg-slate-50 text-slate-500 px-2 py-0.5 rounded-full">No data</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Spend allocation pie */}
          <div className="card p-6 col-span-2">
            <h2 className="text-base font-semibold text-slate-900 mb-4">Spend Allocation</h2>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={spendByChannel} dataKey="spend" nameKey="name" cx="50%" cy="50%" outerRadius={75} label={false}>
                  {spendByChannel.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Legend iconSize={8} iconType="circle" wrapperStyle={{ fontSize: "11px" }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Spend vs Conversions bar */}
        <div className="card p-6">
          <h2 className="text-base font-semibold text-slate-900 mb-4">Spend vs. Conversions by Channel</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={channels} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar yAxisId="left" dataKey="spend" name="Spend ($)" radius={[4, 4, 0, 0]}>
                {channels.map((ch, i) => <Cell key={i} fill={ch.color} />)}
              </Bar>
              <Bar yAxisId="right" dataKey="conversions" name="Conversions" fill="#10b981" radius={[4, 4, 0, 0]} opacity={0.5} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* AI Recommendations */}
        {recs && recs.recommendations?.length > 0 && (
          <div className="card p-6">
            <h2 className="text-base font-semibold text-slate-900 mb-4">AI-Generated ROI Recommendations</h2>
            <div className="grid grid-cols-1 gap-3">
              {recs.recommendations.map((rec: any, i: number) => (
                <div key={i} className="flex items-start gap-4 p-4 rounded-xl bg-slate-50 border border-slate-100">
                  <div className="w-7 h-7 rounded-full bg-white border border-slate-200 flex items-center justify-center text-sm font-bold text-slate-600 shrink-0">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-slate-900 text-sm">{rec.title}</span>
                      <span className={cn("text-xs px-2 py-0.5 rounded-full border font-medium", IMPACT_COLORS[rec.impact] || "bg-slate-50 text-slate-600 border-slate-200")}>
                        {rec.impact} impact
                      </span>
                    </div>
                    <p className="text-sm text-slate-600">{rec.description}</p>
                    {rec.metric && <p className="text-xs text-emerald-600 font-medium mt-1">{rec.metric}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
