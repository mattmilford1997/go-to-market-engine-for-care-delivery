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

// ─── Main Page ───────────────────────────────────────────────────
export default function PaidAdsPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const [tab, setTab] = useState<"google" | "meta">("google");
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
      approvalApi.queue(companyId, "paid_ads").catch(() => ({ data: { items: [] } })),
    ]).then(([budget, aud, queue]) => {
      setBudgetRecs(budget.data.recommendations || []);
      setAudiences(aud.data.audiences || []);
      setQueueItems(queue.data.items || []);
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

  const handleGenerate = async (type: "google" | "meta") => {
    setGenerating(type);
    try {
      if (type === "google") {
        await paidAdsApi.generateAllGoogle(companyId);
        showToast("Google Ads assets queued for generation — check Approval Queue shortly.");
      } else {
        await paidAdsApi.generateAllMeta(companyId);
        showToast("Meta Ads assets queued for generation — check Approval Queue shortly.");
      }
      // Re-fetch queue
      const q = await approvalApi.queue(companyId, "paid_ads").catch(() => ({ data: { items: [] } }));
      setQueueItems(q.data.items || []);
    } catch {
      showToast("Generation failed — ensure ANTHROPIC_API_KEY is set.");
    } finally {
      setGenerating(null);
    }
  };

  const googleItems = queueItems.filter((i) => i.item_type?.includes("google") || i.item_type?.includes("keyword"));
  const metaItems = queueItems.filter((i) => i.item_type?.includes("meta") || i.item_type?.includes("audience"));
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
      <div className="gradient-paid-ads px-8 py-7 text-white">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Target className="w-5 h-5 opacity-80" />
              <span className="text-sm font-medium opacity-80 uppercase tracking-wide">Module 1</span>
            </div>
            <h1 className="text-2xl font-bold">Paid Ads Manager</h1>
            <p className="text-orange-100 text-sm mt-1">Google Ads keyword clusters · Meta audience targeting · RSA copy</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={loadDemoData}
              className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-xl text-sm font-medium transition-all border border-white/30"
            >
              <Zap className="w-4 h-4" />
              Load Demo
            </button>
            <button
              onClick={() => handleGenerate("google")}
              disabled={!!generating}
              className="flex items-center gap-2 px-4 py-2 bg-white/15 hover:bg-white/25 text-white rounded-xl text-sm font-medium transition-all border border-white/20 disabled:opacity-50"
            >
              {generating === "google" ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              Generate Google Ads
            </button>
            <button
              onClick={() => handleGenerate("meta")}
              disabled={!!generating}
              className="flex items-center gap-2 px-4 py-2 bg-white/15 hover:bg-white/25 text-white rounded-xl text-sm font-medium transition-all border border-white/20 disabled:opacity-50"
            >
              {generating === "meta" ? <RefreshCw className="w-4 h-4 animate-spin" /> : <TrendingUp className="w-4 h-4" />}
              Generate Meta Ads
            </button>
          </div>
        </div>
      </div>

      <div className="p-8 space-y-8">
        {/* Stats Row */}
        <div className="grid grid-cols-4 gap-4">
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

        {/* Tab Navigation */}
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
          {(["google", "meta"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "px-5 py-2 rounded-lg text-sm font-medium transition-all",
                tab === t ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              {t === "google" ? "🔍 Google Ads" : "📘 Meta Ads"}
            </button>
          ))}
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
                      <Tooltip formatter={(v: number) => formatCurrency(v)} />
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
              <div className="grid grid-cols-2 gap-3">
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
                <div className="grid grid-cols-3 gap-4">
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
                <div className="grid grid-cols-3 gap-4">
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
      </div>
    </div>
  );
}
