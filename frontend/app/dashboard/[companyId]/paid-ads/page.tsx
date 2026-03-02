"use client";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { paidAdsApi, approvalApi } from "@/lib/api";
import { formatCurrency, cn } from "@/lib/utils";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";
import {
  Zap, Target, DollarSign, Clock, TrendingUp,
  RefreshCw, ChevronRight, CheckCircle, AlertCircle, Star,
} from "lucide-react";
import ProgressBanner from "@/components/ProgressBanner";

// ─── Types ──────────────────────────────────────────────────────
interface BudgetRec {
  location: string;
  google_recommended: number;
  meta_recommended: number;
}
interface ApprovalItem {
  id: string;
  title: string;
  item_type: string;
  status: string;
  preview_data: Record<string, any>;
  created_at: string;
}
interface Audience {
  id: string;
  name: string;
  description: string;
  size_estimate: string;
  targeting: Record<string, string[]>;
}

// ─── Sub-components ─────────────────────────────────────────────
function StatCard({ icon, label, value, sub, accent }: { icon: React.ReactNode; label: string; value: string | number; sub?: string; accent: string }) {
  return (
    <div className="card card-hover p-5 flex items-start gap-4">
      <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center shrink-0", accent)}>
        {icon}
      </div>
      <div>
        <div className="stat-number">{value}</div>
        <div className="text-sm font-medium text-slate-700 mt-0.5">{label}</div>
        {sub && <div className="text-xs text-slate-400 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-amber-50 text-amber-700 border border-amber-200",
    approved: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    rejected: "bg-rose-50 text-rose-700 border border-rose-200",
  };
  return (
    <span className={cn("badge", map[status] || "bg-slate-50 text-slate-600 border border-slate-200")}>
      {status}
    </span>
  );
}

function SectionHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between mb-4">
      <div>
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

const AUDIENCE_COLORS = ["#f97316", "#fb923c", "#fdba74"];

// ─── Demo Data ───────────────────────────────────────────────────
const DEMO_BUDGET_RECS: BudgetRec[] = [
  { location: "Phoenix, AZ", google_recommended: 4200, meta_recommended: 2800 },
  { location: "Scottsdale, AZ", google_recommended: 3100, meta_recommended: 1900 },
  { location: "Tempe, AZ", google_recommended: 2600, meta_recommended: 1600 },
  { location: "Mesa, AZ", google_recommended: 2900, meta_recommended: 1700 },
  { location: "Chandler, AZ", google_recommended: 2400, meta_recommended: 1400 },
];
const DEMO_AUDIENCES: Audience[] = [
  { id: "a1", name: "Depression & Anxiety Seekers", description: "Adults actively researching depression treatment and anxiety therapy", size_estimate: "2.1M–4.8M", targeting: { interests: ["Mental Health", "Anxiety", "Depression"], behaviors: ["Health Content Engaged"] } },
  { id: "a2", name: "TMS Treatment Considerers", description: "Adults interested in non-medication depression treatments", size_estimate: "480K–1.2M", targeting: { interests: ["TMS Therapy", "Brain Health"], behaviors: ["Medical Research"] } },
  { id: "a3", name: "Provider Referral Network", description: "PCPs and therapists within 25 miles of practice locations", size_estimate: "12K–45K", targeting: { interests: ["Healthcare Professionals"], behaviors: ["Business Decision Maker"] } },
];
const DEMO_QUEUE_ITEMS: ApprovalItem[] = [
  { id: "q1", title: "Google Ad — TMS Therapy Phoenix", item_type: "google_keyword_cluster", status: "approved", preview_data: { keyword_cluster: "TMS therapy near me", headline_1: "TMS Therapy in Phoenix — No Medication Required" }, created_at: "2026-02-27T10:00:00Z" },
  { id: "q2", title: "Google Ad — Depression Treatment", item_type: "google_ad_copy", status: "pending", preview_data: { keyword_cluster: "depression treatment specialist", headline_1: "Compassionate Depression Care — 90%+ Success Rate" }, created_at: "2026-02-27T10:01:00Z" },
  { id: "q3", title: "Google Ad — Ketamine Clinic", item_type: "google_keyword_cluster", status: "pending", preview_data: { keyword_cluster: "ketamine treatment center AZ", headline_1: "Ketamine Infusion Therapy — Rapid Relief" }, created_at: "2026-02-27T10:02:00Z" },
  { id: "q4", title: "Google Ad — Mental Health Clinic", item_type: "google_ad_copy", status: "approved", preview_data: { keyword_cluster: "mental health clinic Phoenix", headline_1: "Award-Winning Mental Health Clinic in Phoenix" }, created_at: "2026-02-27T10:03:00Z" },
  { id: "q5", title: "Google Ad — Insurance Accepted", item_type: "google_ad_copy", status: "pending", preview_data: { keyword_cluster: "insurance accepted therapist", headline_1: "Most Insurance Accepted — Free Consultation" }, created_at: "2026-02-27T10:04:00Z" },
  { id: "q6", title: "Meta Ad — Depression Seekers", item_type: "meta_ad_copy", status: "approved", preview_data: { primary_text: "Struggling with depression? TMS therapy has helped thousands find relief without medication. Covered by most insurance." }, created_at: "2026-02-27T10:05:00Z" },
  { id: "q7", title: "Meta Ad — TMS Awareness", item_type: "meta_audience", status: "pending", preview_data: { primary_text: "There's a breakthrough treatment for depression that doesn't require medication. TMS therapy uses targeted magnetic pulses." }, created_at: "2026-02-27T10:06:00Z" },
  { id: "q8", title: "Meta Ad — Provider Outreach", item_type: "meta_ad_copy", status: "approved", preview_data: { primary_text: "Partner with us to offer your patients TMS therapy. We handle all insurance verification and co-management support." }, created_at: "2026-02-27T10:07:00Z" },
];

const ALL_PLATFORMS = [
  { id: "google", name: "Google Ads", icon: "G", color: "#4285f4", bg: "bg-blue-50 border-blue-200", desc: "Search & Display", formats: "RSA · PMax · Display", best_for: "High-intent patients", avg_cpc: "$8–$22" },
  { id: "meta", name: "Meta Ads", icon: "f", color: "#1877f2", bg: "bg-indigo-50 border-indigo-200", desc: "Facebook + Instagram", formats: "Feed · Stories · Reels · Lead Gen", best_for: "Awareness + retargeting", avg_cpc: "$2–$8" },
  { id: "reddit", name: "Reddit Ads", icon: "R", color: "#ff4500", bg: "bg-orange-50 border-orange-200", desc: "Community targeting", formats: "Promoted Post · Video", best_for: "r/depression · r/anxiety · r/mentalhealth", avg_cpc: "$1–$4" },
  { id: "microsoft", name: "Microsoft / Bing", icon: "M", color: "#00a4ef", bg: "bg-sky-50 border-sky-200", desc: "Bing + LinkedIn network", formats: "RSA · Dynamic Search", best_for: "Older adults, higher income", avg_cpc: "$5–$15" },
  { id: "quora", name: "Quora Ads", icon: "Q", color: "#b92b27", bg: "bg-red-50 border-red-200", desc: "Question-intent targeting", formats: "Promoted Answer · Image", best_for: "Research-phase patients", avg_cpc: "$2–$6" },
  { id: "tiktok", name: "TikTok Ads", icon: "T", color: "#010101", bg: "bg-slate-100 border-slate-300", desc: "Short-form video", formats: "In-Feed · TopView · Spark Ads", best_for: "Gen Z + Millennial audiences", avg_cpc: "$1–$3" },
  { id: "linkedin", name: "LinkedIn Ads", icon: "in", color: "#0077b5", bg: "bg-blue-50 border-blue-300", desc: "Professional targeting", formats: "Sponsored Content · Message", best_for: "PCPs · therapists · HR / EAP", avg_cpc: "$8–$20" },
  { id: "pinterest", name: "Pinterest Ads", icon: "P", color: "#e60023", bg: "bg-rose-50 border-rose-200", desc: "Visual discovery", formats: "Promoted Pin · Video Pin", best_for: "Women 25–54, wellness content", avg_cpc: "$1–$3" },
];

// ─── Main Page ───────────────────────────────────────────────────
export default function PaidAdsPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const [tab, setTab] = useState<string>("google");
  const [budgetRecs, setBudgetRecs] = useState<BudgetRec[]>([]);
  const [audiences, setAudiences] = useState<Audience[]>([]);
  const [queueItems, setQueueItems] = useState<ApprovalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) return;
    Promise.all([
      paidAdsApi.budgetRecs(companyId).catch(() => ({ data: { recommendations: [] } })),
      paidAdsApi.audiences(companyId).catch(() => ({ data: { audiences: [] } })),
      approvalApi.queue(companyId, "paid_ads").catch(() => ({ data: [] })),
    ]).then(([budget, aud, queue]) => {
      setBudgetRecs(budget.data.recommendations || []);
      setAudiences(aud.data.audiences || []);
      setQueueItems(Array.isArray(queue.data) ? queue.data : []);
    }).finally(() => setLoading(false));
  }, [companyId]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const loadDemoData = () => {
    setBudgetRecs(DEMO_BUDGET_RECS);
    setAudiences(DEMO_AUDIENCES);
    setQueueItems(DEMO_QUEUE_ITEMS);
    setLoading(false);
    showToast("Demo data loaded — all visualizations are now populated!");
  };

  const handleGenerate = async (type: string) => {
    setGenerating(type);
    const delayMs: Record<string, number> = { google: 45000, meta: 35000 };
    try {
      if (type === "google") await paidAdsApi.generateAllGoogle(companyId);
      else if (type === "meta") await paidAdsApi.generateAllMeta(companyId);
      else await paidAdsApi.generatePlatform(companyId, type);
      const plat = ALL_PLATFORMS.find((p) => p.id === type);
      showToast(`${plat?.name || type} ads queued for generation — check Approval Queue shortly.`);
      // Wait for background generation to complete before refetching
      await new Promise((r) => setTimeout(r, delayMs[type] ?? 20000));
      const q = await approvalApi.queue(companyId, "paid_ads").catch(() => ({ data: [] }));
      setQueueItems(Array.isArray(q.data) ? q.data : []);
    } catch (err: any) {
      const msg = err?.isNetworkError
        ? "Cannot reach backend API — set BACKEND_URL in Railway to your backend service URL."
        : "Generation failed — ensure ANTHROPIC_API_KEY is set on the backend.";
      showToast(msg);
    } finally {
      setGenerating(null);
    }
  };

  const googleItems = queueItems.filter((i) => i.item_type?.includes("google") || i.item_type?.includes("keyword"));
  const metaItems = queueItems.filter((i) => i.item_type?.includes("meta") || i.item_type?.includes("audience"));
  const platformItems = (platform: string) => queueItems.filter((i) => i.item_type?.includes(platform));
  const pendingCount = queueItems.filter((i) => i.status === "pending").length;

  const chartData = budgetRecs.map((r) => ({
    name: r.location?.length > 15 ? r.location.slice(0, 12) + "…" : r.location,
    Google: r.google_recommended,
    Meta: r.meta_recommended,
  }));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-96">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 text-orange-400 animate-spin mx-auto mb-3" />
          <p className="text-slate-500 text-sm">Loading Paid Ads…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 fade-in bg-slate-900 text-white text-sm px-4 py-3 rounded-xl shadow-lg max-w-sm">
          {toast}
        </div>
      )}

      {/* Hero Header */}
      <div className="gradient-paid-ads px-4 sm:px-8 py-5 sm:py-7 text-white">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Target className="w-5 h-5 opacity-80" />
              <span className="text-sm font-medium opacity-80 uppercase tracking-wide">Module 1</span>
            </div>
            <h1 className="text-2xl font-bold">Paid Ads Manager</h1>
            <p className="text-orange-100 text-sm mt-1">Google Ads keyword clusters · Meta audience targeting · RSA copy</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={loadDemoData}
              className="flex items-center gap-2 px-3 py-2 bg-white/20 hover:bg-white/30 text-white rounded-xl text-sm font-medium transition-all border border-white/30"
            >
              <Zap className="w-4 h-4" />
              Load Demo
            </button>
            <button
              onClick={() => handleGenerate("google")}
              disabled={!!generating}
              className="flex items-center gap-2 px-3 py-2 bg-white/15 hover:bg-white/25 text-white rounded-xl text-sm font-medium transition-all border border-white/20 disabled:opacity-50"
            >
              {generating === "google" ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              Google Ads
            </button>
            <button
              onClick={() => handleGenerate("meta")}
              disabled={!!generating}
              className="flex items-center gap-2 px-3 py-2 bg-white/15 hover:bg-white/25 text-white rounded-xl text-sm font-medium transition-all border border-white/20 disabled:opacity-50"
            >
              {generating === "meta" ? <RefreshCw className="w-4 h-4 animate-spin" /> : <TrendingUp className="w-4 h-4" />}
              Meta Ads
            </button>
          </div>
        </div>
      </div>

      {/* Progress banners — placed after header so they're always in view */}
      <ProgressBanner
        active={generating === "google"}
        label="Generating Google Ads"
        estimatedSeconds={20}
        steps={["Building keyword clusters…", "Writing RSA headlines…", "Crafting ad descriptions…", "Saving to Approval Queue…"]}
        color="orange"
      />
      <ProgressBanner
        active={generating === "meta"}
        label="Generating Meta Ads"
        estimatedSeconds={20}
        steps={["Defining audience segments…", "Writing ad copy…", "Crafting primary text…", "Saving to Approval Queue…"]}
        color="orange"
      />
      {generating !== null && generating !== "google" && generating !== "meta" && (
        <ProgressBanner
          active={!!generating}
          label={`Generating ${ALL_PLATFORMS.find((p) => p.id === generating)?.name ?? generating} Ads`}
          estimatedSeconds={20}
          steps={["Analysing platform requirements…", "Writing ad copy…", "Tailoring to audience…", "Saving to Approval Queue…"]}
          color="orange"
        />
      )}

      <div className="p-4 sm:p-8 space-y-6 sm:space-y-8">
        {/* Stats Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <StatCard icon={<Target className="w-5 h-5 text-orange-600" />} label="Keyword Clusters" value={googleItems.length > 0 ? "6" : "0"} sub="Top clusters ready" accent="bg-orange-50" />
          <StatCard icon={<Zap className="w-5 h-5 text-amber-600" />} label="Ad Copies Generated" value={googleItems.filter((i) => i.item_type?.includes("copy") || i.item_type?.includes("ad")).length} sub="RSA + Meta copies" accent="bg-amber-50" />
          <StatCard icon={<TrendingUp className="w-5 h-5 text-blue-600" />} label="Meta Audiences" value={audiences.length} sub="Audience templates" accent="bg-blue-50" />
          <StatCard icon={<Clock className="w-5 h-5 text-violet-600" />} label="Pending Approval" value={pendingCount} sub="Awaiting review" accent="bg-violet-50" />
        </div>

        {/* How it Works Note */}
        <div className="rounded-xl p-4 flex items-start gap-3" style={{ background: "#fff7ed", border: "1px solid #fed7aa" }}>
          <AlertCircle className="w-4 h-4 text-orange-500 mt-0.5 shrink-0" />
          <p className="text-sm text-orange-800">
            <span className="font-semibold">Build-First Model:</span> All ad assets are generated and sent to the Approval Queue before any campaign goes live. Connect your Google Ads and Meta credentials in Settings to deploy approved assets.
          </p>
        </div>

        {/* Platform Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {ALL_PLATFORMS.map((p) => {
            const pItems = p.id === "google" ? googleItems : p.id === "meta" ? metaItems : platformItems(p.id);
            return (
              <div
                key={p.id}
                onClick={() => setTab(p.id)}
                className={cn(
                  "card border p-4 cursor-pointer transition-all",
                  p.bg,
                  tab === p.id ? "ring-2 ring-offset-1" : "hover:scale-[1.01]"
                )}
                style={tab === p.id ? { ringColor: p.color } as React.CSSProperties : {}}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0"
                    style={{ background: p.color }}>
                    {p.icon}
                  </div>
                  <p className="text-xs font-semibold text-slate-900 leading-tight">{p.name}</p>
                </div>
                <p className="text-xs text-slate-500 leading-snug mb-2">{p.desc}</p>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">{p.avg_cpc} CPC</span>
                  {pItems.length > 0 && (
                    <span className="text-xs font-medium text-emerald-600">{pItems.length} ads</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Google Ads Tab */}
        {tab === "google" && (
          <div className="space-y-6 fade-in">
            {/* Budget Recommendations */}
            {budgetRecs.length > 0 && (
              <div className="card p-6">
                <SectionHeader
                  title="Budget Recommendations by Location"
                  subtitle="Smart allocation based on your practice locations"
                />
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} />
                      <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: "#64748b" }} />
                      <Tooltip formatter={(v: number | undefined) => v != null ? formatCurrency(v) : ""} />
                      <Bar dataKey="Google" fill="#f97316" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Meta" fill="#fb923c" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-4 overflow-x-auto">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Location</th>
                        <th>Google Recommended</th>
                        <th>Meta Recommended</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {budgetRecs.map((r, i) => (
                        <tr key={i}>
                          <td className="font-medium">{r.location}</td>
                          <td className="text-emerald-600 font-semibold">{formatCurrency(r.google_recommended)}</td>
                          <td className="text-blue-600 font-semibold">{formatCurrency(r.meta_recommended)}</td>
                          <td className="font-semibold">{formatCurrency(r.google_recommended + r.meta_recommended)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Generated Google Ads */}
            <div className="card p-6">
              <SectionHeader
                title="Generated Google Ads"
                subtitle="Keyword clusters with RSA copy — ready for approval"
                action={
                  <button
                    onClick={() => handleGenerate("google")}
                    disabled={!!generating}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                  >
                    <Zap className="w-3 h-3" />
                    Regenerate
                  </button>
                }
              />
              {googleItems.length === 0 ? (
                <div className="text-center py-12">
                  <Target className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                  <p className="text-slate-500 text-sm font-medium">No Google Ads generated yet</p>
                  <p className="text-slate-400 text-xs mt-1">Click "Generate Google Ads" to create keyword clusters and RSA copy</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {googleItems.map((item) => (
                    <div key={item.id} className="border border-slate-100 rounded-xl p-4 hover:border-orange-200 transition-colors">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                          {item.preview_data?.keyword_cluster && (
                            <p className="text-xs text-slate-500 mt-0.5">Cluster: {item.preview_data.keyword_cluster}</p>
                          )}
                          {item.preview_data?.headline_1 && (
                            <p className="text-xs text-slate-400 mt-1 font-mono">"{item.preview_data.headline_1}"</p>
                          )}
                        </div>
                        <StatusBadge status={item.status} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Keyword Strategy Guide */}
            <div className="card p-6">
              <SectionHeader title="Keyword Strategy" subtitle="High-intent clusters for mental health practices" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { cluster: "TMS Therapy Near Me", intent: "High", volume: "8,100/mo", competition: "Medium" },
                  { cluster: "Ketamine Treatment Center", intent: "High", volume: "5,400/mo", competition: "Medium" },
                  { cluster: "Depression Treatment Specialist", intent: "High", volume: "12,100/mo", competition: "High" },
                  { cluster: "Mental Health Clinic [City]", intent: "Medium", volume: "6,600/mo", competition: "Low" },
                  { cluster: "TMS vs ECT Therapy", intent: "Research", volume: "2,900/mo", competition: "Low" },
                  { cluster: "Insurance Accepted Therapist", intent: "High", volume: "4,400/mo", competition: "Medium" },
                ].map((kw) => (
                  <div key={kw.cluster} className="p-3 rounded-xl" style={{ background: "#fff7ed", border: "1px solid #fed7aa" }}>
                    <p className="text-sm font-semibold text-orange-900">{kw.cluster}</p>
                    <div className="flex gap-3 mt-2">
                      <span className="text-xs text-orange-700"><span className="font-medium">Intent:</span> {kw.intent}</span>
                      <span className="text-xs text-orange-700"><span className="font-medium">Vol:</span> {kw.volume}</span>
                      <span className="text-xs text-orange-700"><span className="font-medium">Comp:</span> {kw.competition}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Meta Ads Tab */}
        {tab === "meta" && (
          <div className="space-y-6 fade-in">
            {/* Audience Cards */}
            <div className="card p-6">
              <SectionHeader
                title="Audience Templates"
                subtitle="Pre-built healthcare audience targeting for Facebook & Instagram"
                action={
                  <button
                    onClick={() => handleGenerate("meta")}
                    disabled={!!generating}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                    style={{ background: "#3b82f6" }}
                  >
                    <TrendingUp className="w-3 h-3" />
                    Generate All Meta
                  </button>
                }
              />
              {audiences.length === 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[
                    {
                      name: "Depression & Anxiety Seekers",
                      description: "Users actively researching depression treatment, anxiety therapy, and mental health resources",
                      size: "2.1M – 4.8M",
                      interests: ["Mental Health", "Anxiety", "Depression", "Therapy"],
                      behaviors: ["Health & Wellness Content Engaged", "Recently Searched Mental Health"],
                    },
                    {
                      name: "TMS Treatment Considerers",
                      description: "Adults who have shown interest in non-medication depression treatment options",
                      size: "480K – 1.2M",
                      interests: ["TMS Therapy", "Alternative Medicine", "Brain Health"],
                      behaviors: ["Medical Treatment Research", "Health Insurance Engaged"],
                    },
                    {
                      name: "Provider Referral Network",
                      description: "Primary care physicians and therapists within 25 miles of practice locations",
                      size: "12K – 45K",
                      interests: ["Healthcare Professionals", "Medical News"],
                      behaviors: ["Healthcare Provider", "Business Decision Maker"],
                    },
                  ].map((aud, i) => (
                    <div key={aud.name} className="rounded-xl border border-slate-200 p-5 hover:border-blue-300 transition-colors">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold" style={{ background: AUDIENCE_COLORS[i] }}>
                          A{i + 1}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-900 leading-tight">{aud.name}</p>
                          <p className="text-xs text-slate-500">{aud.size} reach</p>
                        </div>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed mb-3">{aud.description}</p>
                      <div className="space-y-2">
                        <div>
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Interests</p>
                          <div className="flex flex-wrap gap-1">
                            {aud.interests.map((i) => (
                              <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">{i}</span>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Behaviors</p>
                          <div className="flex flex-wrap gap-1">
                            {aud.behaviors.map((b) => (
                              <span key={b} className="text-xs px-2 py-0.5 rounded-full bg-orange-50 text-orange-700">{b}</span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {audiences.map((aud, i) => (
                    <div key={aud.id} className="rounded-xl border border-slate-200 p-5">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold" style={{ background: AUDIENCE_COLORS[i % 3] }}>
                          A{i + 1}
                        </div>
                        <p className="text-sm font-semibold text-slate-900">{aud.name}</p>
                      </div>
                      <p className="text-xs text-slate-600 mb-2">{aud.description}</p>
                      <p className="text-xs text-slate-400">Est. reach: {aud.size_estimate}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Generated Meta Ads */}
            <div className="card p-6">
              <SectionHeader title="Generated Meta Ad Copy" subtitle="Approved copy ready for deployment to Facebook & Instagram" />
              {metaItems.length === 0 ? (
                <div className="text-center py-12">
                  <TrendingUp className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                  <p className="text-slate-500 text-sm font-medium">No Meta Ads generated yet</p>
                  <p className="text-slate-400 text-xs mt-1">Click "Generate All Meta" to create ad copy for all 3 audience templates</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {metaItems.map((item) => (
                    <div key={item.id} className="border border-slate-100 rounded-xl p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                          {item.preview_data?.primary_text && (
                            <p className="text-xs text-slate-500 mt-1 leading-relaxed line-clamp-2">{item.preview_data.primary_text}</p>
                          )}
                        </div>
                        <StatusBadge status={item.status} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Meta Ad Specs */}
            <div className="card p-6">
              <SectionHeader title="Ad Format Guide" subtitle="Best practices for healthcare Meta advertising" />
              <div className="grid grid-cols-3 gap-4">
                {[
                  { format: "Feed Image", size: "1080×1080", note: "Square — highest engagement", color: "bg-blue-50 text-blue-900" },
                  { format: "Story / Reel", size: "1080×1920", note: "Vertical — mobile-first", color: "bg-violet-50 text-violet-900" },
                  { format: "Carousel", size: "1080×1080", note: "Multiple images — showcase services", color: "bg-orange-50 text-orange-900" },
                ].map((f) => (
                  <div key={f.format} className={cn("rounded-xl p-4", f.color)}>
                    <p className="text-sm font-semibold">{f.format}</p>
                    <p className="text-xs font-mono mt-1 opacity-70">{f.size}</p>
                    <p className="text-xs mt-1 opacity-80">{f.note}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Generic Platform Tabs (Reddit, Microsoft, Quora, TikTok, LinkedIn, Pinterest) */}
        {!["google", "meta"].includes(tab) && (() => {
          const plat = ALL_PLATFORMS.find((p) => p.id === tab);
          if (!plat) return null;
          const items = platformItems(tab);
          return (
            <div className="space-y-6 fade-in">
              {/* Platform Overview */}
              <div className={cn("card border p-6", plat.bg)}>
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white text-xl font-black shrink-0"
                      style={{ background: plat.color }}>
                      {plat.icon}
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-slate-900">{plat.name}</h2>
                      <p className="text-sm text-slate-600 mt-0.5">{plat.desc}</p>
                      <div className="flex flex-wrap gap-3 mt-3 text-xs">
                        <span className="flex gap-1.5"><span className="font-semibold text-slate-700">Formats:</span><span className="text-slate-600">{plat.formats}</span></span>
                        <span className="flex gap-1.5"><span className="font-semibold text-slate-700">Best for:</span><span className="text-slate-600">{plat.best_for}</span></span>
                        <span className="flex gap-1.5"><span className="font-semibold text-slate-700">Avg CPC:</span><span className="text-slate-600">{plat.avg_cpc}</span></span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleGenerate(tab)}
                    disabled={!!generating}
                    className="flex items-center gap-2 px-5 py-2.5 text-white rounded-xl text-sm font-semibold disabled:opacity-50 shrink-0"
                    style={{ background: plat.color }}
                  >
                    {generating === tab ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                    Generate {plat.name} Ads
                  </button>
                </div>
              </div>

              {/* Generated ads for this platform */}
              <div className="card p-6">
                <SectionHeader
                  title={`Generated ${plat.name} Ads`}
                  subtitle={`AI-generated copy tailored for ${plat.name} — pending approval before launch`}
                />
                {items.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center text-white text-2xl font-black opacity-20"
                      style={{ background: plat.color }}>
                      {plat.icon}
                    </div>
                    <p className="text-slate-500 text-sm font-medium">No {plat.name} ads generated yet</p>
                    <p className="text-slate-400 text-xs mt-1 mb-4">Click "Generate {plat.name} Ads" to create platform-specific copy</p>
                    <button
                      onClick={() => handleGenerate(tab)}
                      disabled={!!generating}
                      className="inline-flex items-center gap-2 px-5 py-2.5 text-white rounded-xl text-sm font-semibold disabled:opacity-50"
                      style={{ background: plat.color }}
                    >
                      {generating === tab ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                      Generate Now
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {items.map((item) => (
                      <div key={item.id} className="border border-slate-100 rounded-xl p-4">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                            {item.preview_data?.body && (
                              <p className="text-xs text-slate-500 mt-1 leading-relaxed line-clamp-3">{item.preview_data.body}</p>
                            )}
                          </div>
                          <StatusBadge status={item.status} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Platform-specific tips */}
              <div className="card p-6">
                <SectionHeader title={`${plat.name} Best Practices`} subtitle="Healthcare advertising guidelines for this platform" />
                <div className="grid grid-cols-2 gap-3">
                  {tab === "reddit" && [
                    { tip: "Lead with value, not the sell", detail: "Reddit users immediately recognize ads. Start with genuinely useful information before mentioning your clinic." },
                    { tip: "Match the subreddit's tone", detail: "r/depression posts are raw and honest. r/mentalhealth is more supportive. Adapt your copy accordingly." },
                    { tip: "Disclose it's an ad", detail: "Reddit's promoted posts are labeled, but extra transparency ('Promoted by [clinic name]') builds trust." },
                    { tip: "Target mental health communities", detail: "Subreddits: r/depression, r/anxiety, r/mentalhealth, r/TMS, r/bipolar, r/ADHD, r/therapy." },
                  ].map((t, i) => (
                    <div key={i} className="p-3 rounded-xl bg-orange-50 border border-orange-100">
                      <p className="text-xs font-semibold text-orange-900">{t.tip}</p>
                      <p className="text-xs text-orange-700 mt-1">{t.detail}</p>
                    </div>
                  ))}
                  {tab === "microsoft" && [
                    { tip: "Import from Google Ads", detail: "Microsoft lets you import existing Google campaigns directly — start there to save time." },
                    { tip: "LinkedIn profile targeting", detail: "Unique to Microsoft: target by LinkedIn job title, company, or industry within Bing search." },
                    { tip: "Older demographic advantage", detail: "Bing users skew 45+ with higher income — great fit for premium mental health services." },
                    { tip: "Lower competition", detail: "CPC is typically 30–50% lower than Google for the same keywords." },
                  ].map((t, i) => (
                    <div key={i} className="p-3 rounded-xl bg-sky-50 border border-sky-100">
                      <p className="text-xs font-semibold text-sky-900">{t.tip}</p>
                      <p className="text-xs text-sky-700 mt-1">{t.detail}</p>
                    </div>
                  ))}
                  {tab === "quora" && [
                    { tip: "Answer the question first", detail: "Quora users are in research mode. A helpful 3-sentence answer before mentioning your clinic performs best." },
                    { tip: "Target specific questions", detail: "e.g., 'What is TMS therapy?', 'How to find a psychiatrist who accepts insurance', 'Does TMS work for anxiety?'" },
                    { tip: "Add credentials", detail: "Mention provider qualifications in the answer — Quora users trust authoritative, expert-sounding responses." },
                    { tip: "Topic targeting", detail: "Target topics: Depression, Anxiety Disorders, ADHD, Mental Health Treatment, Psychiatry." },
                  ].map((t, i) => (
                    <div key={i} className="p-3 rounded-xl bg-red-50 border border-red-100">
                      <p className="text-xs font-semibold text-red-900">{t.tip}</p>
                      <p className="text-xs text-red-700 mt-1">{t.detail}</p>
                    </div>
                  ))}
                  {tab === "tiktok" && [
                    { tip: "Hook within 2 seconds", detail: "If you don't stop the scroll in the first 2 seconds, users swipe away. Lead with your most compelling visual or text." },
                    { tip: "Sound-off captions required", detail: "~85% of TikTok ads are watched without sound. Every key message must be readable on screen." },
                    { tip: "Avoid polished corporate video", detail: "Authentic, slightly unpolished content outperforms studio-quality ads on TikTok by 2–3x." },
                    { tip: "HIPAA note", detail: "Never use real patient footage without written consent. Use actors + disclaimers: 'Actor portrayal.'" },
                  ].map((t, i) => (
                    <div key={i} className="p-3 rounded-xl bg-slate-100 border border-slate-200">
                      <p className="text-xs font-semibold text-slate-900">{t.tip}</p>
                      <p className="text-xs text-slate-600 mt-1">{t.detail}</p>
                    </div>
                  ))}
                  {tab === "linkedin" && [
                    { tip: "B2B referral focus", detail: "Target PCPs, therapists, social workers, and HR managers for referral partnership ads — not consumer-facing." },
                    { tip: "Message Ads for warm outreach", detail: "InMail-style messages to therapists and PCPs work well for introducing TMS co-treatment programs." },
                    { tip: "Professional tone + clinical credibility", detail: "Cite outcome statistics, board certifications, and peer-reviewed protocols." },
                    { tip: "EAP targeting", detail: "Target HR Benefits Managers and EAP (Employee Assistance Program) coordinators for corporate mental health partnerships." },
                  ].map((t, i) => (
                    <div key={i} className="p-3 rounded-xl bg-blue-50 border border-blue-100">
                      <p className="text-xs font-semibold text-blue-900">{t.tip}</p>
                      <p className="text-xs text-blue-700 mt-1">{t.detail}</p>
                    </div>
                  ))}
                  {tab === "pinterest" && [
                    { tip: "Women 25–54 dominant audience", detail: "Pinterest skews heavily female and is strong for wellness, self-care, and mental health content." },
                    { tip: "Long-form visual content works", detail: "Pinterest users save content for later. Infographics and educational posts about mental health perform well." },
                    { tip: "Keyword + interest targeting", detail: "Target: mental health, therapy, anxiety relief, self-care, depression help, mindfulness." },
                    { tip: "Link to blog content first", detail: "Pinterest users are in inspiration/research mode — link to an educational blog post before asking for a consultation." },
                  ].map((t, i) => (
                    <div key={i} className="p-3 rounded-xl bg-rose-50 border border-rose-100">
                      <p className="text-xs font-semibold text-rose-900">{t.tip}</p>
                      <p className="text-xs text-rose-700 mt-1">{t.detail}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
