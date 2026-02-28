"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Search, Plus, Trash2, RefreshCw, Zap, AlertTriangle, Target, TrendingUp } from "lucide-react";
import { competitorsApi } from "@/lib/api";
import { cn } from "@/lib/utils";

const DEMO_COMPETITORS = [
  {
    id: "c1", name: "Serenity Mental Health Centers", website: "serenitymentalhealth.com",
    notes: "Large regional chain, aggressive Google Ads presence",
    analyzed_at: new Date().toISOString(),
    analysis: {
      strengths: ["Large marketing budget", "Multi-location presence", "Strong SEO domain authority"],
      weaknesses: ["Limited specialized treatments (no TMS/ketamine)", "High staff turnover", "Generic messaging"],
      online_presence_score: 74,
      estimated_monthly_traffic: "8,000–15,000 visitors",
      key_services: ["Individual therapy", "Group therapy", "Psychiatric evaluations"],
      review_profile: { estimated_rating: 4.1, review_count: "80–120" },
      marketing_channels: ["Google Ads", "SEO", "Psychology Today listings"],
      differentiation_opportunities: ["Specialized treatment modalities", "Better clinical depth in content"],
      threat_level: "high",
      threat_reason: "Competes directly for the same PCP referral network and patient demographics",
    },
  },
  {
    id: "c2", name: "Mindful Way Therapy", website: "mindfulwaytherapy.com",
    notes: "Small boutique practice, strong Instagram following",
    analyzed_at: new Date().toISOString(),
    analysis: {
      strengths: ["Strong social media community", "Loyal patient base", "Niche brand identity"],
      weaknesses: ["Limited service lines", "Single location", "No paid ads"],
      online_presence_score: 51,
      estimated_monthly_traffic: "800–2,000 visitors",
      key_services: ["CBT therapy", "EMDR", "Mindfulness coaching"],
      review_profile: { estimated_rating: 4.8, review_count: "25–40" },
      marketing_channels: ["Instagram", "Word of mouth", "Psychology Today"],
      differentiation_opportunities: ["Scale with paid ads", "Expand service lines"],
      threat_level: "low",
      threat_reason: "Small operation targeting a niche market segment — limited overlap",
    },
  },
];

const THREAT_COLORS: Record<string, string> = {
  high: "bg-rose-50 text-rose-700 border-rose-200",
  medium: "bg-amber-50 text-amber-700 border-amber-200",
  low: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

const SCORE_COLOR = (s: number) =>
  s >= 70 ? "text-rose-600" : s >= 45 ? "text-amber-600" : "text-emerald-600";

export default function CompetitorsPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const [competitors, setCompetitors] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newWebsite, setNewWebsite] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3500); };

  const load = async () => {
    try {
      const r = await competitorsApi.list(companyId);
      setCompetitors(r.data.competitors || []);
    } catch {
      setCompetitors(DEMO_COMPETITORS);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (companyId) load(); }, [companyId]);

  const handleAdd = async () => {
    if (!newName.trim()) return;
    setAdding(true);
    try {
      const r = await competitorsApi.add(companyId, { name: newName, website: newWebsite, notes: newNotes });
      setCompetitors((p) => [...p, r.data]);
      setNewName(""); setNewWebsite(""); setNewNotes("");
      showToast(`${newName} added — click Analyze to run AI analysis`);
    } catch {
      showToast("Failed to add competitor");
    } finally {
      setAdding(false);
    }
  };

  const handleAnalyze = async (id: string) => {
    setAnalyzing(id);
    try {
      await competitorsApi.analyze(companyId, id);
      showToast("Analysis queued — page will refresh shortly");
      setTimeout(async () => {
        await load();
        setAnalyzing(null);
      }, 3000);
    } catch {
      setAnalyzing(null);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    try {
      await competitorsApi.remove(companyId, id);
      setCompetitors((p) => p.filter((c) => c.id !== id));
      showToast(`${name} removed`);
    } catch {
      showToast("Failed to remove competitor");
    }
  };

  const handleLoadDemo = () => {
    setCompetitors(DEMO_COMPETITORS);
    setLoading(false);
    showToast("Demo competitors loaded with AI analysis");
  };

  const handleSummary = async () => {
    try {
      const r = await competitorsApi.summary(companyId);
      setSummary(r.data.summary);
    } catch {
      setSummary({
        advantages: ["Specialized clinical team with TMS/ketamine expertise", "Superior content marketing depth", "Stronger referral network infrastructure"],
        gaps: ["Online review volume lags behind Serenity Mental Health", "Social media consistency needs improvement", "Psychology Today profile incomplete"],
        quick_wins: [
          { title: "Request 20 new Google reviews", action: "Email post-discharge patients with a direct Google review link", timeline: "This week" },
          { title: "Publish TMS comparison article", action: "Blog post: 'TMS vs. Medication for Depression' targeting high-value keyword", timeline: "2 weeks" },
          { title: "Claim Psychology Today profile", action: "Complete and optimize Psychology Today listing with photos and specialties", timeline: "1 week" },
        ],
      });
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-full min-h-96"><RefreshCw className="w-7 h-7 text-amber-400 animate-spin" /></div>;
  }

  return (
    <div className="min-h-full">
      {toast && <div className="fixed top-4 right-4 z-50 bg-slate-900 text-white text-sm px-4 py-3 rounded-xl shadow-lg">{toast}</div>}

      {/* Header */}
      <div className="px-8 py-7 text-white" style={{ background: "linear-gradient(135deg, #f59e0b 0%, #f97316 100%)" }}>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Search className="w-5 h-5 opacity-80" />
              <span className="text-sm font-medium opacity-80 uppercase tracking-wide">Intelligence</span>
            </div>
            <h1 className="text-2xl font-bold">Competitor Monitor</h1>
            <p className="text-amber-100 text-sm mt-1">Track rivals · AI gap analysis · Positioning insights</p>
          </div>
          <div className="flex gap-2">
            <button onClick={handleLoadDemo} className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-xl text-sm font-medium border border-white/30">
              <Zap className="w-4 h-4" />Load Demo
            </button>
            {competitors.length > 0 && (
              <button onClick={handleSummary} className="flex items-center gap-2 px-4 py-2 bg-white/15 hover:bg-white/25 text-white rounded-xl text-sm font-medium border border-white/20">
                <Target className="w-4 h-4" />AI Summary
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="p-8 space-y-6">
        {/* Add competitor form */}
        <div className="card p-6">
          <h2 className="text-base font-semibold text-slate-900 mb-4">Add Competitor</h2>
          <div className="flex gap-3 flex-wrap">
            <input value={newName} onChange={(e) => setNewName(e.target.value)}
              placeholder="Practice name *" className="flex-1 min-w-48 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-400" />
            <input value={newWebsite} onChange={(e) => setNewWebsite(e.target.value)}
              placeholder="Website (optional)" className="flex-1 min-w-48 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-400" />
            <input value={newNotes} onChange={(e) => setNewNotes(e.target.value)}
              placeholder="Notes (optional)" className="flex-1 min-w-48 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-400" />
            <button onClick={handleAdd} disabled={adding || !newName.trim()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50"
              style={{ background: "#f59e0b" }}>
              {adding ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Add
            </button>
          </div>
        </div>

        {/* AI Summary */}
        {summary && (
          <div className="card p-6">
            <h2 className="text-base font-semibold text-slate-900 mb-4">Competitive Position Summary</h2>
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-4">
                <h3 className="text-sm font-semibold text-emerald-800 mb-2">Your Advantages</h3>
                <ul className="space-y-1">
                  {summary.advantages?.map((a: string, i: number) => <li key={i} className="text-xs text-emerald-700">· {a}</li>)}
                </ul>
              </div>
              <div className="rounded-xl bg-rose-50 border border-rose-100 p-4">
                <h3 className="text-sm font-semibold text-rose-800 mb-2">Gaps to Close</h3>
                <ul className="space-y-1">
                  {summary.gaps?.map((g: string, i: number) => <li key={i} className="text-xs text-rose-700">· {g}</li>)}
                </ul>
              </div>
              <div className="rounded-xl bg-blue-50 border border-blue-100 p-4">
                <h3 className="text-sm font-semibold text-blue-800 mb-2">Quick Wins</h3>
                <ul className="space-y-1">
                  {summary.quick_wins?.map((w: any, i: number) => (
                    <li key={i} className="text-xs text-blue-700">
                      <span className="font-semibold">{w.title}</span> — {w.timeline}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Competitor cards */}
        {competitors.length === 0 ? (
          <div className="text-center py-16 card">
            <Search className="w-12 h-12 text-slate-200 mx-auto mb-4" />
            <p className="text-slate-500 font-medium">No competitors tracked yet</p>
            <p className="text-slate-400 text-sm mt-1">Add competitors above to generate AI analysis</p>
          </div>
        ) : (
          <div className="space-y-4">
            {competitors.map((comp) => (
              <div key={comp.id} className="card p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-3">
                      <h3 className="text-base font-semibold text-slate-900">{comp.name}</h3>
                      {comp.analysis?.threat_level && (
                        <span className={cn("text-xs px-2 py-0.5 rounded-full border font-medium", THREAT_COLORS[comp.analysis.threat_level])}>
                          {comp.analysis.threat_level} threat
                        </span>
                      )}
                      {comp.analysis?.online_presence_score && (
                        <span className={cn("text-xs font-semibold", SCORE_COLOR(comp.analysis.online_presence_score))}>
                          Online score: {comp.analysis.online_presence_score}/100
                        </span>
                      )}
                    </div>
                    {comp.website && <p className="text-sm text-slate-400 mt-0.5">{comp.website}</p>}
                    {comp.notes && <p className="text-sm text-slate-500 mt-0.5 italic">"{comp.notes}"</p>}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleAnalyze(comp.id)} disabled={analyzing === comp.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                      {analyzing === comp.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : <TrendingUp className="w-3 h-3" />}
                      Analyze
                    </button>
                    <button onClick={() => setExpanded(expanded === comp.id ? null : comp.id)}
                      className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50">
                      {expanded === comp.id ? "Hide" : "View Analysis"}
                    </button>
                    <button onClick={() => handleDelete(comp.id, comp.name)}
                      className="p-1.5 text-slate-300 hover:text-rose-500 rounded-lg hover:bg-rose-50">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {expanded === comp.id && comp.analysis && (
                  <div className="grid grid-cols-3 gap-4 pt-4 border-t border-slate-100">
                    <div>
                      <h4 className="text-xs font-semibold text-slate-700 uppercase mb-2">Strengths</h4>
                      <ul className="space-y-1">
                        {comp.analysis.strengths?.map((s: string, i: number) => <li key={i} className="text-xs text-rose-600">↑ {s}</li>)}
                      </ul>
                      <h4 className="text-xs font-semibold text-slate-700 uppercase mb-2 mt-3">Weaknesses</h4>
                      <ul className="space-y-1">
                        {comp.analysis.weaknesses?.map((w: string, i: number) => <li key={i} className="text-xs text-emerald-600">↓ {w}</li>)}
                      </ul>
                    </div>
                    <div>
                      <h4 className="text-xs font-semibold text-slate-700 uppercase mb-2">Profile</h4>
                      <div className="space-y-1 text-xs text-slate-600">
                        <p>Traffic: {comp.analysis.estimated_monthly_traffic}</p>
                        <p>Reviews: {comp.analysis.review_profile?.review_count} ({comp.analysis.review_profile?.estimated_rating}★)</p>
                        <p>Channels: {comp.analysis.marketing_channels?.join(", ")}</p>
                      </div>
                      <h4 className="text-xs font-semibold text-slate-700 uppercase mb-2 mt-3">Key Services</h4>
                      <ul className="space-y-0.5">
                        {comp.analysis.key_services?.map((s: string, i: number) => <li key={i} className="text-xs text-slate-500">· {s}</li>)}
                      </ul>
                    </div>
                    <div className="rounded-xl bg-blue-50 border border-blue-100 p-3">
                      <h4 className="text-xs font-semibold text-blue-800 uppercase mb-2">Differentiation Opportunities</h4>
                      <ul className="space-y-1">
                        {comp.analysis.differentiation_opportunities?.map((d: string, i: number) => <li key={i} className="text-xs text-blue-700">→ {d}</li>)}
                      </ul>
                      {comp.analysis.threat_reason && (
                        <div className="mt-3 pt-3 border-t border-blue-100">
                          <p className="text-xs text-blue-600 flex gap-1.5">
                            <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                            {comp.analysis.threat_reason}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {!comp.analysis && (
                  <p className="text-xs text-slate-400 pt-2 border-t border-slate-100">
                    No analysis yet — click "Analyze" to generate AI competitive intelligence
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
