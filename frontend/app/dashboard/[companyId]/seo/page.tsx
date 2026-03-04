"use client";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { seoApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line,
} from "recharts";
import {
  Search, Zap, AlertTriangle, CheckCircle, TrendingUp,
  RefreshCw, ArrowUp, ArrowDown, Minus, Globe, Shield,
  Clock, Activity,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────
interface SEOReport {
  id?: string;
  pagespeed_mobile?: number;
  pagespeed_desktop?: number;
  core_web_vitals?: {
    lcp?: number;
    fid?: number;
    cls?: number;
    inp?: number;
  };
  crawl_errors?: number | Array<{ url?: string; issue?: string; severity?: string; [key: string]: unknown }>;
  meta_issues?: number | Array<{ url?: string; issue?: string; severity?: string; [key: string]: unknown }>;
  schema_issues?: number | Array<{ [key: string]: unknown }>;
  ranking_keywords?: Array<{ keyword: string; position: number; volume: number; change?: number }>;
  keyword_opportunities?: Array<{ keyword: string; volume?: number; difficulty?: number; opportunity_score?: number; intent?: string; recommended_format?: string; [key: string]: unknown }>;
  recommendations?: Array<{ issue?: string; action?: string; priority: string; fix?: string; category?: string; impact?: string; expected_impact?: string; effort?: string; [key: string]: unknown }>;
  nap_consistency?: number;
  created_at?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────
function scoreColor(score: number): string {
  if (score >= 90) return "#10b981";
  if (score >= 50) return "#f59e0b";
  return "#ef4444";
}

function scoreLabel(score: number): string {
  if (score >= 90) return "Good";
  if (score >= 50) return "Needs Work";
  return "Poor";
}

function cwvStatus(metric: string, value: number): "good" | "needs_improvement" | "poor" {
  const thresholds: Record<string, [number, number]> = {
    lcp: [2500, 4000],
    fid: [100, 300],
    cls: [0.1, 0.25],
    inp: [200, 500],
  };
  const [good, poor] = thresholds[metric] || [100, 200];
  if (value <= good) return "good";
  if (value <= poor) return "needs_improvement";
  return "poor";
}

function CWVStatusBadge({ status }: { status: "good" | "needs_improvement" | "poor" }) {
  const map = {
    good: "bg-emerald-50 text-emerald-700 border-emerald-200",
    needs_improvement: "bg-amber-50 text-amber-700 border-amber-200",
    poor: "bg-rose-50 text-rose-700 border-rose-200",
  };
  const label = {
    good: "Good",
    needs_improvement: "Needs Work",
    poor: "Poor",
  };
  return <span className={cn("badge border", map[status])}>{label[status]}</span>;
}

function PriorityBadge({ priority }: { priority: string }) {
  const map: Record<string, string> = {
    high: "bg-rose-50 text-rose-700",
    medium: "bg-amber-50 text-amber-700",
    low: "bg-slate-100 text-slate-600",
    critical: "bg-rose-100 text-rose-800 font-semibold",
  };
  return <span className={cn("badge capitalize", map[priority] || "bg-slate-100 text-slate-600")}>{priority}</span>;
}

// Circular Score Ring
function ScoreRing({ score, label }: { score: number; label: string }) {
  const color = scoreColor(score);
  const r = 36;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-24 h-24">
        <svg width="96" height="96" viewBox="0 0 96 96">
          <circle cx="48" cy="48" r={r} fill="none" stroke="#f1f5f9" strokeWidth="8" />
          <circle
            cx="48" cy="48" r={r} fill="none"
            stroke={color} strokeWidth="8"
            strokeDasharray={`${dash} ${circ - dash}`}
            strokeLinecap="round"
            transform="rotate(-90 48 48)"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-slate-900">{score}</span>
        </div>
      </div>
      <div className="text-center">
        <p className="text-sm font-semibold text-slate-700">{label}</p>
        <p className="text-xs font-medium" style={{ color }}>{scoreLabel(score)}</p>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, sub, accent }: { icon: React.ReactNode; label: string; value: string | number; sub?: string; accent: string }) {
  return (
    <div className="card card-hover p-5 flex items-start gap-4">
      <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center shrink-0", accent)}>{icon}</div>
      <div>
        <div className="stat-number">{value}</div>
        <div className="text-sm font-medium text-slate-700 mt-0.5">{label}</div>
        {sub && <div className="text-xs text-slate-400 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

// ─── Demo Data ───────────────────────────────────────────────────
const DEMO_REPORT: SEOReport = {
  pagespeed_mobile: 71,
  pagespeed_desktop: 94,
  core_web_vitals: { lcp: 2100, fid: 65, cls: 0.04, inp: 175 },
  crawl_errors: 3,
  meta_issues: 7,
  schema_issues: 2,
  nap_consistency: 78,
  ranking_keywords: [
    { keyword: "TMS therapy Phoenix", position: 4, volume: 1300, change: 2 },
    { keyword: "TMS therapy success rate", position: 2, volume: 1800, change: 1 },
    { keyword: "TMS vs ECT therapy", position: 3, volume: 590, change: 5 },
    { keyword: "mental health clinic Scottsdale", position: 6, volume: 720, change: 0 },
    { keyword: "treatment resistant depression help", position: 9, volume: 1100, change: 2 },
    { keyword: "psychiatrist Phoenix accepting new patients", position: 5, volume: 590, change: 0 },
    { keyword: "ketamine treatment Arizona", position: 7, volume: 880, change: -1 },
    { keyword: "insurance covered mental health", position: 12, volume: 3300, change: 4 },
    { keyword: "depression treatment center Phoenix", position: 11, volume: 2400, change: 3 },
    { keyword: "TMS therapy near me", position: 14, volume: 8100, change: 1 },
    { keyword: "anxiety treatment without medication", position: 16, volume: 4400, change: 3 },
    { keyword: "ketamine infusion therapy cost", position: 18, volume: 2200, change: -2 },
  ],
  recommendations: [
    { issue: "Missing H1 tags on 4 service pages", priority: "high", fix: "Add descriptive H1 tags to each service page including TMS, Ketamine, and Depression Treatment pages", category: "On-Page", impact: "+8–12 positions for target keywords" },
    { issue: "Mobile PageSpeed below 75", priority: "high", fix: "Optimize images with WebP format, defer non-critical JavaScript, and enable browser caching for static assets", category: "Technical", impact: "+15 mobile score points" },
    { issue: "3 broken internal links found", priority: "high", fix: "Update or remove broken links on the blog archive, services navigation, and footer", category: "Technical", impact: "Fixes all 3 crawl errors" },
    { issue: "Ketamine pages lack E-E-A-T signals", priority: "high", fix: "Add physician credentials, peer-reviewed citations, and patient outcome statistics to all ketamine therapy pages", category: "Content", impact: "+authority score, better rankings" },
    { issue: "No schema markup on provider profiles", priority: "medium", fix: "Add MedicalBusiness and Physician JSON-LD schema to all provider profile and location pages", category: "Schema", impact: "Rich snippet eligibility in SERPs" },
    { issue: "7 pages missing meta descriptions", priority: "medium", fix: "Write unique 155–160 character meta descriptions for all service and location pages", category: "On-Page", impact: "+10–20% CTR improvement" },
    { issue: "No Google Business Profile posts in 30 days", priority: "medium", fix: "Publish weekly Google Business Profile posts linking to new blog content and service updates", category: "Local SEO", impact: "+local pack visibility" },
    { issue: "Missing alt text on 12 images", priority: "low", fix: "Add descriptive alt text to all content images including staff photos, treatment facility images, and infographics", category: "Accessibility", impact: "Image search indexing" },
  ],
};

// ─── Main Page ───────────────────────────────────────────────────
export default function SEOPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const [report, setReport] = useState<SEOReport | null>(null);
  const [keywords, setKeywords] = useState<any[]>([]);
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningAudit, setRunningAudit] = useState(false);
  const [runningPagespeed, setRunningPagespeed] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) return;
    Promise.all([
      seoApi.latestReport(companyId).catch(() => ({ data: null })),
      seoApi.keywords(companyId).catch(() => ({ data: { keywords: [], opportunities: [] } })),
      seoApi.recommendations(companyId).catch(() => ({ data: { recommendations: [] } })),
    ]).then(([r, k, rec]) => {
      setReport(r.data);
      setKeywords(k.data.keywords || []);
      setRecommendations(rec.data.recommendations || []);
    }).finally(() => setLoading(false));
  }, [companyId]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const loadDemoData = () => {
    setReport(DEMO_REPORT);
    setKeywords(DEMO_REPORT.ranking_keywords || []);
    setRecommendations(DEMO_REPORT.recommendations || []);
    setLoading(false);
    showToast("Demo SEO report loaded — explore scores, vitals, keywords, and recommendations!");
  };

  const handleAudit = async () => {
    setRunningAudit(true);
    try {
      await seoApi.runAudit(companyId);
      showToast("SEO audit started — results will be ready in 1–2 minutes.");
      setTimeout(async () => {
        const r = await seoApi.latestReport(companyId).catch(() => ({ data: null }));
        setReport(r.data);
        const rec = await seoApi.recommendations(companyId).catch(() => ({ data: { recommendations: [] } }));
        setRecommendations(rec.data.recommendations || []);
      }, 5000);
    } catch {
      showToast("Audit failed — check backend connection.");
    } finally {
      setRunningAudit(false);
    }
  };

  const handlePagespeed = async () => {
    setRunningPagespeed(true);
    try {
      await seoApi.runPagespeed(companyId);
      showToast("PageSpeed check complete — report updated.");
      const r = await seoApi.latestReport(companyId).catch(() => ({ data: null }));
      setReport(r.data);
    } catch {
      showToast("PageSpeed check failed — check backend connection.");
    } finally {
      setRunningPagespeed(false);
    }
  };

  const mobile = report?.pagespeed_mobile ?? 0;
  const desktop = report?.pagespeed_desktop ?? 0;
  const cwv = report?.core_web_vitals || {};
  const rankingKws = report?.ranking_keywords || keywords;
  const recs = report?.recommendations || recommendations;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-96">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 text-blue-400 animate-spin mx-auto mb-3" />
          <p className="text-slate-500 text-sm">Loading SEO Dashboard…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full">
      {toast && (
        <div className="fixed top-4 right-4 z-50 fade-in bg-slate-900 text-white text-sm px-4 py-3 rounded-xl shadow-lg max-w-sm">
          {toast}
        </div>
      )}

      {/* Hero Header */}
      <div className="gradient-seo px-8 py-7 text-white">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Search className="w-5 h-5 opacity-80" />
              <span className="text-sm font-medium opacity-80 uppercase tracking-wide">Module 4</span>
            </div>
            <h1 className="text-2xl font-bold">SEO Dashboard</h1>
            <p className="text-blue-100 text-sm mt-1">Technical audit · PageSpeed · Keyword rankings · Recommendations</p>
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
              onClick={handlePagespeed}
              disabled={runningPagespeed || runningAudit}
              className="flex items-center gap-2 px-4 py-2 bg-white/15 hover:bg-white/25 text-white rounded-xl text-sm font-medium transition-all border border-white/20 disabled:opacity-50"
            >
              {runningPagespeed ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              Check PageSpeed
            </button>
            <button
              onClick={handleAudit}
              disabled={runningAudit || runningPagespeed}
              className="flex items-center gap-2 px-4 py-2 bg-white/15 hover:bg-white/25 text-white rounded-xl text-sm font-medium transition-all border border-white/20 disabled:opacity-50"
            >
              {runningAudit ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />}
              Run Full Audit
            </button>
          </div>
        </div>
      </div>

      <div className="p-8 space-y-8">
        {/* Stats Row */}
        <div className="grid grid-cols-4 gap-4">
          <StatCard icon={<Globe className="w-5 h-5 text-blue-600" />} label="Mobile Score" value={report ? mobile : "—"} sub={report ? scoreLabel(mobile) : "Run audit first"} accent="bg-blue-50" />
          <StatCard icon={<Activity className="w-5 h-5 text-indigo-600" />} label="Desktop Score" value={report ? desktop : "—"} sub={report ? scoreLabel(desktop) : "Run audit first"} accent="bg-indigo-50" />
          <StatCard icon={<TrendingUp className="w-5 h-5 text-emerald-600" />} label="Ranking Keywords" value={rankingKws.length} sub="Tracked positions" accent="bg-emerald-50" />
          <StatCard icon={<AlertTriangle className="w-5 h-5 text-amber-600" />} label="Open Issues" value={(Array.isArray(report?.crawl_errors) ? report.crawl_errors.length : (report?.crawl_errors || 0)) + (Array.isArray(report?.meta_issues) ? report.meta_issues.length : (report?.meta_issues || 0))} sub="Technical fixes needed" accent="bg-amber-50" />
        </div>

        {!report ? (
          /* No Report State */
          <div className="card p-12 text-center">
            <Search className="w-14 h-14 text-slate-200 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-slate-700">No SEO Audit Yet</h2>
            <p className="text-slate-500 text-sm mt-2 max-w-md mx-auto">
              Run a full SEO audit to get PageSpeed scores, Core Web Vitals, technical issues, keyword rankings, and actionable recommendations.
            </p>
            <button
              onClick={handleAudit}
              disabled={runningAudit}
              className="mt-6 inline-flex items-center gap-2 px-6 py-3 text-white rounded-xl text-sm font-semibold"
              style={{ background: "#3b82f6" }}
            >
              {runningAudit ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />}
              Run Full SEO Audit
            </button>
          </div>
        ) : (
          <>
            {/* PageSpeed + Core Web Vitals */}
            <div className="grid grid-cols-2 gap-6">
              {/* PageSpeed Scores */}
              <div className="card p-6">
                <h2 className="text-base font-semibold text-slate-900 mb-6">PageSpeed Scores</h2>
                <div className="flex justify-around">
                  <ScoreRing score={mobile} label="Mobile" />
                  <div className="w-px bg-slate-100" />
                  <ScoreRing score={desktop} label="Desktop" />
                </div>
                <div className="mt-6 pt-4 border-t border-slate-100">
                  <div className="flex justify-between text-xs text-slate-500">
                    <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-rose-400 inline-block" /> 0–49 Poor</span>
                    <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /> 50–89 Needs Work</span>
                    <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" /> 90–100 Good</span>
                  </div>
                </div>
              </div>

              {/* Core Web Vitals */}
              <div className="card p-6">
                <h2 className="text-base font-semibold text-slate-900 mb-4">Core Web Vitals</h2>
                <div className="space-y-3">
                  {[
                    { key: "lcp", label: "Largest Contentful Paint", unit: "ms", good: 2500, desc: "Loading performance" },
                    { key: "fid", label: "First Input Delay", unit: "ms", good: 100, desc: "Interactivity" },
                    { key: "cls", label: "Cumulative Layout Shift", unit: "", good: 0.1, desc: "Visual stability" },
                    { key: "inp", label: "Interaction to Next Paint", unit: "ms", good: 200, desc: "Responsiveness" },
                  ].map(({ key, label, unit, good, desc }) => {
                    const val = cwv[key as keyof typeof cwv] as number | undefined;
                    const status = val !== undefined ? cwvStatus(key, val) : "good";
                    return (
                      <div key={key} className="flex items-center justify-between p-3 rounded-xl" style={{ background: "#f8fafc" }}>
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{label}</p>
                          <p className="text-xs text-slate-500">{desc} · target: ≤{good}{unit}</p>
                        </div>
                        <div className="text-right">
                          {val !== undefined ? (
                            <>
                              <p className="text-sm font-bold text-slate-900">{val}{unit}</p>
                              <CWVStatusBadge status={status} />
                            </>
                          ) : (
                            <span className="text-xs text-slate-400">Pending</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Technical Issues */}
            {(() => {
              const crawlCount = Array.isArray(report.crawl_errors) ? report.crawl_errors.length : (report.crawl_errors || 0);
              const metaCount = Array.isArray(report.meta_issues) ? report.meta_issues.length : (report.meta_issues || 0);
              const schemaCount = Array.isArray(report.schema_issues) ? report.schema_issues.length : (report.schema_issues || 0);
              return (crawlCount > 0 || metaCount > 0 || schemaCount > 0) ? (
              <div className="card p-6">
                <h2 className="text-base font-semibold text-slate-900 mb-4">Technical Issues Found</h2>
                <div className="grid grid-cols-3 gap-4">
                  <div className="rounded-xl p-4 border border-rose-100 bg-rose-50">
                    <p className="text-2xl font-bold text-rose-700">{crawlCount}</p>
                    <p className="text-sm text-rose-700 font-medium mt-1">Crawl Errors</p>
                    <p className="text-xs text-rose-500 mt-0.5">Pages returning 4xx/5xx errors</p>
                  </div>
                  <div className="rounded-xl p-4 border border-amber-100 bg-amber-50">
                    <p className="text-2xl font-bold text-amber-700">{metaCount}</p>
                    <p className="text-sm text-amber-700 font-medium mt-1">Meta Tag Issues</p>
                    <p className="text-xs text-amber-500 mt-0.5">Missing/duplicate title, description</p>
                  </div>
                  <div className="rounded-xl p-4 border border-blue-100 bg-blue-50">
                    <p className="text-2xl font-bold text-blue-700">{schemaCount}</p>
                    <p className="text-sm text-blue-700 font-medium mt-1">Schema Errors</p>
                    <p className="text-xs text-blue-500 mt-0.5">Structured data validation issues</p>
                  </div>
                </div>
              </div>
              ) : null;
            })()}

            {/* Keywords */}
            {rankingKws.length > 0 && (
              <div className="card p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">Keyword Rankings</h2>
                    <p className="text-sm text-slate-500 mt-0.5">Tracked positions in Google Search</p>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Keyword</th>
                        <th>Position</th>
                        <th>Search Volume</th>
                        <th>Change</th>
                        <th>Opportunity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rankingKws.slice(0, 20).map((kw: any, i: number) => (
                        <tr key={i}>
                          <td className="font-medium text-slate-900">{kw.keyword}</td>
                          <td>
                            <span className={cn("text-sm font-bold", kw.position <= 3 ? "text-emerald-600" : kw.position <= 10 ? "text-blue-600" : "text-slate-500")}>
                              #{kw.position}
                            </span>
                          </td>
                          <td className="text-slate-600">{kw.volume?.toLocaleString() || "—"}/mo</td>
                          <td>
                            {kw.change !== undefined && kw.change !== 0 ? (
                              <span className={cn("flex items-center gap-1 text-xs font-semibold", kw.change > 0 ? "text-emerald-600" : "text-rose-600")}>
                                {kw.change > 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                                {Math.abs(kw.change)}
                              </span>
                            ) : (
                              <span className="text-slate-300"><Minus className="w-3 h-3" /></span>
                            )}
                          </td>
                          <td>
                            {kw.position > 10 && kw.position <= 20 ? (
                              <span className="badge bg-amber-50 text-amber-700">Page 2 Opportunity</span>
                            ) : kw.position <= 3 ? (
                              <span className="badge bg-emerald-50 text-emerald-700">Top 3</span>
                            ) : (
                              <span className="badge bg-slate-50 text-slate-500">Monitor</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Recommendations */}
            {recs.length > 0 && (
              <div className="card p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">Recommendations</h2>
                    <p className="text-sm text-slate-500 mt-0.5">{recs.length} actionable improvements identified</p>
                  </div>
                </div>
                <div className="space-y-3">
                  {recs.map((rec: any, i: number) => (
                    <div key={i} className="flex items-start gap-4 p-4 rounded-xl border border-slate-100 hover:border-blue-200 transition-colors">
                      <div className="mt-0.5">
                        {rec.priority === "high" || rec.priority === "critical" ? (
                          <AlertTriangle className="w-4 h-4 text-rose-500" />
                        ) : rec.priority === "medium" ? (
                          <Clock className="w-4 h-4 text-amber-500" />
                        ) : (
                          <CheckCircle className="w-4 h-4 text-slate-400" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-slate-900">{rec.issue || rec.action}</p>
                          <PriorityBadge priority={rec.priority} />
                          {rec.category && (
                            <span className="badge bg-blue-50 text-blue-600">{rec.category}</span>
                          )}
                          {rec.effort && (
                            <span className="badge bg-slate-50 text-slate-500">Effort: {rec.effort}</span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-1 leading-relaxed">{rec.fix || rec.action}</p>
                        {(rec.impact || rec.expected_impact) && (
                          <p className="text-xs text-emerald-600 font-medium mt-1">Impact: {rec.impact || rec.expected_impact}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
