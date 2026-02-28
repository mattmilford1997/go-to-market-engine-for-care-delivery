"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { FileText, RefreshCw, Zap, TrendingUp, AlertTriangle, CheckCircle, ArrowRight } from "lucide-react";
import { reportsApi } from "@/lib/api";
import { cn } from "@/lib/utils";

const PULSE_STYLES: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
  green: { bg: "bg-emerald-50 border-emerald-200", text: "text-emerald-700", icon: <CheckCircle className="w-5 h-5 text-emerald-500" /> },
  yellow: { bg: "bg-amber-50 border-amber-200", text: "text-amber-700", icon: <AlertTriangle className="w-5 h-5 text-amber-500" /> },
  red: { bg: "bg-rose-50 border-rose-200", text: "text-rose-700", icon: <AlertTriangle className="w-5 h-5 text-rose-500" /> },
};

const DEMO_REPORT = {
  headline: "Nova Mind — Weekly GTM Digest",
  week: "Feb 21 – Feb 28, 2026",
  pulse: "green",
  pulse_reason: "Referral pipeline growing steadily. Fax campaign outperforming benchmark by 41%.",
  highlights: [
    { icon: "👥", title: "12 new referral leads this week", detail: "Total pipeline: 847 providers" },
    { icon: "✅", title: "68 providers actively referring", detail: "Converted from new → referring status" },
    { icon: "📊", title: "3 active outreach campaigns", detail: "$4,250 total spend tracked" },
    { icon: "⏳", title: "7 items pending approval", detail: "Review and approve to keep pipeline moving" },
  ],
  this_week_wins: [
    "Added 12 new provider leads from NPPES auto-generation",
    "Fax campaign to Phoenix PCPs achieved 2.7% conversion rate (benchmark: 1.9%)",
    "Email sequence for Scottsdale therapists reaching Day 10 touchpoints",
    "TMS therapy blog post approved — ready for publishing",
  ],
  watch_list: [
    { issue: "Meta Ads CAC is $300 vs $110 industry benchmark", urgency: "high", suggested_action: "Pause Meta campaign and reallocate $1,200/month to fax volume" },
    { issue: "7 content pieces awaiting approval in queue", urgency: "medium", suggested_action: "Block 30 mins this week to review and approve — content has a 48hr publishing window" },
  ],
  next_week_priorities: [
    { rank: 1, action: "Increase fax volume to top 100 PCPs in Scottsdale ZIP codes", channel: "fax", expected_impact: "Est. 3–5 new referral inquiries" },
    { rank: 2, action: "Approve and schedule 4 pending email sequences", channel: "email", expected_impact: "Activate outreach for 200+ engaged leads" },
    { rank: 3, action: "Publish TMS blog post + share on LinkedIn", channel: "content", expected_impact: "+15% organic traffic to TMS landing page" },
    { rank: 4, action: "Pause Meta Ads — reinvest in fax + SEO", channel: "budget", expected_impact: "Save $1,200/mo, improve blended CAC by 40%" },
  ],
  metric_spotlight: {
    metric: "Referral Conversion Rate",
    value: "8.0%",
    trend: "up",
    commentary: "Up from 6.2% last month. Industry benchmark is 8–12%. On track to hit benchmark by Q2.",
  },
  generated_at: "2026-02-28",
};

const CHANNEL_COLORS: Record<string, string> = {
  fax: "bg-blue-100 text-blue-700",
  email: "bg-violet-100 text-violet-700",
  voicemail: "bg-emerald-100 text-emerald-700",
  content: "bg-purple-100 text-purple-700",
  seo: "bg-sky-100 text-sky-700",
  budget: "bg-orange-100 text-orange-700",
  google: "bg-red-100 text-red-700",
};

export default function ReportsPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3500); };

  useEffect(() => {
    if (!companyId) return;
    reportsApi.weekly(companyId)
      .then((r) => { if (r.data.report) setReport(r.data.report); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [companyId]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await reportsApi.generate(companyId);
      showToast("Generating report — this takes 15–30 seconds…");
      setTimeout(async () => {
        const r = await reportsApi.weekly(companyId).catch(() => ({ data: {} as any }));
        if (r.data.report) setReport(r.data.report);
        setGenerating(false);
        showToast("Weekly digest ready!");
      }, 5000);
    } catch {
      setGenerating(false);
    }
  };

  const handleLoadDemo = () => {
    setReport(DEMO_REPORT);
    setLoading(false);
    showToast("Demo weekly digest loaded");
  };

  if (loading) {
    return <div className="flex items-center justify-center h-full min-h-96"><RefreshCw className="w-7 h-7 text-indigo-400 animate-spin" /></div>;
  }

  const displayReport = report || null;

  return (
    <div className="min-h-full">
      {toast && <div className="fixed top-4 right-4 z-50 bg-slate-900 text-white text-sm px-4 py-3 rounded-xl shadow-lg">{toast}</div>}

      {/* Header */}
      <div className="px-8 py-7 text-white" style={{ background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)" }}>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <FileText className="w-5 h-5 opacity-80" />
              <span className="text-sm font-medium opacity-80 uppercase tracking-wide">Strategy</span>
            </div>
            <h1 className="text-2xl font-bold">Weekly GTM Digest</h1>
            <p className="text-indigo-100 text-sm mt-1">AI-powered performance summary · Wins · Priorities · Recommendations</p>
          </div>
          <div className="flex gap-2">
            <button onClick={handleLoadDemo} className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-xl text-sm font-medium border border-white/30">
              <Zap className="w-4 h-4" />Load Demo
            </button>
            <button onClick={handleGenerate} disabled={generating}
              className="flex items-center gap-2 px-4 py-2 bg-white/15 hover:bg-white/25 text-white rounded-xl text-sm font-medium border border-white/20 disabled:opacity-50">
              {generating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
              Generate Digest
            </button>
          </div>
        </div>
      </div>

      <div className="p-8">
        {!displayReport ? (
          <div className="text-center py-20 card">
            <FileText className="w-14 h-14 text-slate-200 mx-auto mb-4" />
            <p className="text-slate-600 font-semibold text-lg mb-2">No digest generated yet</p>
            <p className="text-slate-400 text-sm mb-6">Generate your first weekly digest — AI will summarize your GTM performance and prioritize next actions.</p>
            <div className="flex justify-center gap-3">
              <button onClick={handleLoadDemo} className="flex items-center gap-2 px-5 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50">
                <Zap className="w-4 h-4" />View Demo Digest
              </button>
              <button onClick={handleGenerate} disabled={generating}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-50"
                style={{ background: "#6366f1" }}>
                {generating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                Generate This Week's Digest
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-6 max-w-4xl">
            {/* Header bar */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-900">{displayReport.headline}</h2>
                <p className="text-sm text-slate-400 mt-0.5">Week of {displayReport.week} · Generated {displayReport.generated_at}</p>
              </div>
              <div className={cn("flex items-center gap-2 px-4 py-2 rounded-xl border", PULSE_STYLES[displayReport.pulse]?.bg)}>
                {PULSE_STYLES[displayReport.pulse]?.icon}
                <span className={cn("text-sm font-semibold", PULSE_STYLES[displayReport.pulse]?.text)}>
                  {displayReport.pulse === "green" ? "On Track" : displayReport.pulse === "yellow" ? "Attention Needed" : "Action Required"}
                </span>
              </div>
            </div>

            {/* Pulse reason */}
            <div className={cn("rounded-xl p-4 border", PULSE_STYLES[displayReport.pulse]?.bg)}>
              <p className={cn("text-sm font-medium", PULSE_STYLES[displayReport.pulse]?.text)}>{displayReport.pulse_reason}</p>
            </div>

            {/* Highlights grid */}
            <div className="grid grid-cols-2 gap-3">
              {displayReport.highlights?.map((h: any, i: number) => (
                <div key={i} className="card p-4 flex items-start gap-3">
                  <span className="text-xl leading-none">{h.icon}</span>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{h.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{h.detail}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Wins + Watch List */}
            <div className="grid grid-cols-2 gap-6">
              <div className="card p-6">
                <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-500" />This Week's Wins
                </h3>
                <ul className="space-y-2">
                  {displayReport.this_week_wins?.map((w: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                      <span className="text-emerald-400 mt-0.5">✓</span>{w}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="card p-6">
                <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />Watch List
                </h3>
                <ul className="space-y-3">
                  {displayReport.watch_list?.map((w: any, i: number) => (
                    <li key={i}>
                      <div className="flex items-start gap-2">
                        <span className={cn("text-xs px-1.5 py-0.5 rounded font-semibold shrink-0 mt-0.5", w.urgency === "high" ? "bg-rose-100 text-rose-600" : "bg-amber-100 text-amber-600")}>
                          {w.urgency}
                        </span>
                        <div>
                          <p className="text-sm text-slate-700">{w.issue}</p>
                          <p className="text-xs text-slate-400 mt-0.5">→ {w.suggested_action}</p>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Next week priorities */}
            <div className="card p-6">
              <h3 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-indigo-500" />Next Week's Top Priorities
              </h3>
              <div className="space-y-3">
                {displayReport.next_week_priorities?.map((p: any, i: number) => (
                  <div key={i} className="flex items-start gap-4 p-3 rounded-xl bg-slate-50 border border-slate-100">
                    <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-sm font-bold shrink-0">
                      {p.rank}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-sm font-medium text-slate-900">{p.action}</p>
                        <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium shrink-0", CHANNEL_COLORS[p.channel] || "bg-slate-100 text-slate-600")}>
                          {p.channel}
                        </span>
                      </div>
                      <p className="text-xs text-emerald-600">{p.expected_impact}</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-300 shrink-0 mt-1" />
                  </div>
                ))}
              </div>
            </div>

            {/* Metric spotlight */}
            {displayReport.metric_spotlight && (
              <div className="rounded-xl p-5 border border-indigo-100" style={{ background: "linear-gradient(135deg, #eef2ff, #f5f3ff)" }}>
                <p className="text-xs font-semibold text-indigo-600 uppercase mb-1">Metric Spotlight</p>
                <div className="flex items-center gap-3">
                  <p className="text-3xl font-bold text-indigo-900">{displayReport.metric_spotlight.value}</p>
                  <div>
                    <p className="text-sm font-semibold text-indigo-800">{displayReport.metric_spotlight.metric}</p>
                    <p className="text-xs text-indigo-600">{displayReport.metric_spotlight.commentary}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
