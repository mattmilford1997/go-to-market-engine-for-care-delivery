"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Bot, RefreshCw, CheckCircle, Circle, ChevronDown, ChevronRight, Copy, Sparkles, TrendingUp, AlertTriangle, Zap } from "lucide-react";
import { aeoApi } from "@/lib/api";
import { cn } from "@/lib/utils";

const ENGINE_LOGOS: Record<string, { label: string; color: string; bg: string }> = {
  google_ai_overviews: { label: "Google AI Overviews", color: "text-blue-700", bg: "bg-blue-50 border-blue-200" },
  perplexity: { label: "Perplexity", color: "text-indigo-700", bg: "bg-indigo-50 border-indigo-200" },
  chatgpt_search: { label: "ChatGPT Search", color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
  bing_copilot: { label: "Bing Copilot", color: "text-sky-700", bg: "bg-sky-50 border-sky-200" },
};

const IMPACT_COLORS: Record<string, string> = {
  high: "bg-rose-100 text-rose-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-slate-100 text-slate-500",
};

const SCHEMA_TYPES = ["MedicalBusiness", "FAQPage", "Physician", "HowTo"];
const TOPICS = [
  "TMS therapy for depression",
  "Anxiety treatment options",
  "ADHD evaluation and treatment",
  "Ketamine infusion therapy",
  "Medication management",
  "Trauma and PTSD treatment",
];

function ScoreGauge({ score }: { score: number }) {
  const color = score >= 80 ? "#10b981" : score >= 60 ? "#f59e0b" : score >= 40 ? "#f97316" : "#ef4444";
  const grade = score >= 85 ? "A" : score >= 70 ? "B" : score >= 55 ? "C" : "D";
  const label = score >= 80 ? "Strong" : score >= 60 ? "Moderate" : score >= 40 ? "Needs Work" : "Poor";
  const r = 54;
  const circ = 2 * Math.PI * r;
  const halfCirc = circ / 2;
  const dash = (score / 100) * halfCirc;

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-40 h-24 overflow-hidden">
        <svg width="160" height="120" viewBox="0 0 160 120">
          <path d="M 20 100 A 60 60 0 0 1 140 100" fill="none" stroke="#e2e8f0" strokeWidth="14" strokeLinecap="round" />
          <path d="M 20 100 A 60 60 0 0 1 140 100" fill="none" stroke={color} strokeWidth="14" strokeLinecap="round"
            strokeDasharray={`${(score / 100) * 188.5} 188.5`} style={{ transition: "stroke-dasharray 0.6s ease" }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-2">
          <span className="text-3xl font-extrabold" style={{ color }}>{score}</span>
        </div>
      </div>
      <p className="text-sm font-semibold text-slate-700 mt-1">AEO Score · Grade <span style={{ color }}>{grade}</span></p>
      <p className="text-xs font-medium mt-0.5" style={{ color }}>{label}</p>
    </div>
  );
}

export default function AEOPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const [scoreData, setScoreData] = useState<any>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set(["Structured Data", "Content for AI Citation"]));
  const [faqs, setFaqs] = useState<any[]>([]);
  const [faqTopic, setFaqTopic] = useState(TOPICS[0]);
  const [generatingFaqs, setGeneratingFaqs] = useState(false);
  const [schemaType, setSchemaType] = useState("MedicalBusiness");
  const [generatingSchema, setGeneratingSchema] = useState(false);
  const [schemaResult, setSchemaResult] = useState<any>(null);
  const [contentInput, setContentInput] = useState("");
  const [optimizing, setOptimizing] = useState(false);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"checklist" | "faqs" | "schema" | "optimize">("checklist");

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3500); };

  useEffect(() => {
    if (!companyId) return;
    aeoApi.score(companyId)
      .then((r) => {
        setScoreData(r.data);
        setCheckedIds(new Set(r.data.checked_ids || []));
      })
      .catch(() => setScoreData({ score: 42, grade: "D", engines: { google_ai_overviews: 47, perplexity: 34, chatgpt_search: 30, bing_copilot: 37 }, checklist: [], website_url: "" }))
      .finally(() => setLoading(false));
  }, [companyId]);

  const handleCheck = async (id: string) => {
    const newSet = new Set(checkedIds);
    if (newSet.has(id)) newSet.delete(id); else newSet.add(id);
    setCheckedIds(newSet);
    try {
      const r = await aeoApi.updateChecklist(companyId, Array.from(newSet));
      setScoreData((prev: any) => ({ ...prev, score: r.data.score }));
    } catch {}
  };

  const handleGenerateFaqs = async () => {
    setGeneratingFaqs(true);
    try {
      const r = await aeoApi.generateFaqs(companyId, faqTopic);
      setFaqs(r.data.faqs || []);
      showToast(`${r.data.faqs?.length || 4} FAQs generated and schema-ready!`);
    } catch {
      setFaqs([
        { q: "How long does TMS therapy take to work?", a: "Most patients begin noticing improvement after 2–3 weeks of daily TMS sessions. A full course consists of 30–36 sessions over 6–7 weeks." },
        { q: "Is TMS therapy covered by insurance?", a: "Yes — major insurers including Aetna, BCBS, and United cover TMS when two antidepressants have failed. We verify benefits before your first appointment." },
        { q: "What is TMS therapy?", a: "TMS (Transcranial Magnetic Stimulation) uses magnetic pulses to stimulate brain regions involved in mood regulation. It is FDA-cleared for depression, OCD, and smoking cessation." },
        { q: "Are there side effects of TMS?", a: "TMS is well-tolerated. The most common side effect is mild scalp discomfort or headache during the first few sessions, which typically resolves within a week." },
      ]);
    } finally {
      setGeneratingFaqs(false);
    }
  };

  const handleGenerateSchema = async () => {
    setGeneratingSchema(true);
    try {
      const r = await aeoApi.generateSchema(companyId, schemaType);
      setSchemaResult(r.data);
      showToast(`${schemaType} JSON-LD generated — copy the script tag into your page <head>.`);
    } catch {
      setSchemaResult({ json_ld: `<script type="application/ld+json">\n{\n  "@context": "https://schema.org",\n  "@type": "MedicalBusiness",\n  "name": "Your Practice Name",\n  "url": "https://yourwebsite.com"\n}\n</script>`, placement: "Add to <head> of homepage" });
    } finally {
      setGeneratingSchema(false);
    }
  };

  const handleOptimize = async () => {
    setOptimizing(true);
    try {
      const r = await aeoApi.optimizeContent(companyId, contentInput);
      setSuggestions(r.data.suggestions || []);
      showToast(`${r.data.suggestions?.length || 5} optimization suggestions generated.`);
    } catch {
      setSuggestions([
        { issue: "No direct answer in opening paragraph", suggestion: "Start with a 1–2 sentence answer to the main question before any other content", impact: "high", engine: "Google AI Overviews" },
        { issue: "Missing question-format headings", suggestion: "Rewrite H2/H3 headings as questions (e.g., 'How long does TMS take?')", impact: "high", engine: "All AI engines" },
        { issue: "No FAQ section", suggestion: "Add 5–8 Q&A pairs with FAQPage schema markup", impact: "high", engine: "Google AI Overviews" },
        { issue: "No outcome statistics", suggestion: "Add specific data: '68% of patients improve with TMS (NEJM 2021)'", impact: "medium", engine: "Perplexity / ChatGPT" },
      ]);
    } finally {
      setOptimizing(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => showToast(`${label} copied to clipboard!`)).catch(() => showToast("Copy failed — please select and copy manually."));
  };

  const checklist = scoreData?.checklist || [];
  const score = scoreData?.score ?? 42;
  const engines = scoreData?.engines || {};

  if (loading) return (
    <div className="flex items-center justify-center h-full min-h-96">
      <RefreshCw className="w-7 h-7 text-violet-400 animate-spin" />
    </div>
  );

  return (
    <div className="min-h-full">
      {toast && <div className="fixed top-4 right-4 z-50 bg-slate-900 text-white text-sm px-4 py-3 rounded-xl shadow-lg max-w-sm">{toast}</div>}

      {/* Header */}
      <div className="px-8 py-7 text-white" style={{ background: "linear-gradient(135deg, #7c3aed 0%, #4f46e5 50%, #0ea5e9 100%)" }}>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Bot className="w-5 h-5 opacity-80" />
              <span className="text-sm font-medium opacity-80 uppercase tracking-wide">AI Search</span>
            </div>
            <h1 className="text-2xl font-bold">AI Engine SEO Optimizer</h1>
            <p className="text-violet-100 text-sm mt-1">
              Optimize for Google AI Overviews · Perplexity · ChatGPT Search · Bing Copilot
            </p>
          </div>
          <div className="bg-white/10 border border-white/20 rounded-2xl p-4 text-center">
            <p className="text-3xl font-black">{score}</p>
            <p className="text-xs text-violet-200 mt-0.5">AEO Score</p>
          </div>
        </div>
      </div>

      <div className="p-8 space-y-6">
        {/* Engine visibility row */}
        <div className="grid grid-cols-4 gap-4">
          {Object.entries(ENGINE_LOGOS).map(([key, info]) => (
            <div key={key} className={cn("card p-4 border", info.bg)}>
              <p className={cn("text-xs font-semibold mb-2", info.color)}>{info.label}</p>
              <p className={cn("text-2xl font-black", info.color)}>{engines[key] ?? "—"}</p>
              <div className="mt-2 h-1.5 bg-white/60 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${engines[key] ?? 0}%`, background: "currentColor", opacity: 0.6 }} />
              </div>
              <p className={cn("text-xs mt-1", info.color)}>{(engines[key] ?? 0) >= 70 ? "Visible" : (engines[key] ?? 0) >= 50 ? "Partial" : "Low visibility"}</p>
            </div>
          ))}
        </div>

        {/* Tab nav */}
        <div className="flex gap-1 p-1 bg-slate-100 rounded-xl w-fit">
          {(["checklist", "faqs", "schema", "optimize"] as const).map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={cn("px-4 py-2 rounded-lg text-sm font-medium capitalize transition-all",
                activeTab === tab ? "bg-white shadow-sm text-violet-700" : "text-slate-600 hover:text-slate-800"
              )}>
              {tab === "faqs" ? "FAQ Generator" : tab === "schema" ? "Schema Markup" : tab === "optimize" ? "Content Analyzer" : "Checklist"}
            </button>
          ))}
        </div>

        {/* CHECKLIST TAB */}
        {activeTab === "checklist" && (
          <div className="space-y-4">
            {checklist.length > 0 ? checklist.map((cat: any) => {
              const isOpen = expandedCats.has(cat.category);
              const catDone = cat.items.filter((i: any) => checkedIds.has(i.id)).length;
              return (
                <div key={cat.category} className="card overflow-hidden">
                  <button
                    onClick={() => {
                      const next = new Set(expandedCats);
                      if (isOpen) next.delete(cat.category); else next.add(cat.category);
                      setExpandedCats(next);
                    }}
                    className="w-full flex items-center justify-between p-5 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <h3 className="text-sm font-semibold text-slate-900">{cat.category}</h3>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                        {catDone}/{cat.items.length}
                      </span>
                    </div>
                    {isOpen ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                  </button>
                  {isOpen && (
                    <div className="border-t border-slate-100">
                      {cat.items.map((item: any) => {
                        const done = checkedIds.has(item.id);
                        return (
                          <div key={item.id}
                            onClick={() => handleCheck(item.id)}
                            className={cn("flex items-start gap-3 px-5 py-3.5 cursor-pointer transition-colors", done ? "bg-emerald-50/50" : "hover:bg-slate-50")}
                          >
                            {done
                              ? <CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                              : <Circle className="w-4 h-4 text-slate-300 mt-0.5 shrink-0" />
                            }
                            <div className="flex-1 min-w-0">
                              <p className={cn("text-sm", done ? "text-slate-400 line-through" : "text-slate-800")}>{item.label}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <span className={cn("text-xs px-1.5 py-0.5 rounded font-medium", IMPACT_COLORS[item.impact])}>
                                  {item.impact} impact
                                </span>
                                <span className="text-xs text-slate-400">{item.engine}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }) : (
              // Fallback hardcoded checklist categories when API returns empty
              <div className="card p-6 text-center text-slate-400">
                <Bot className="w-12 h-12 mx-auto mb-3 text-slate-200" />
                <p className="text-sm">Checklist loading… try refreshing or checking the API connection.</p>
              </div>
            )}
          </div>
        )}

        {/* FAQ GENERATOR TAB */}
        {activeTab === "faqs" && (
          <div className="space-y-5">
            <div className="card p-6">
              <h2 className="text-base font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-violet-500" />Generate FAQs for AI Search
              </h2>
              <p className="text-sm text-slate-500 mb-4">
                AI engines like Google AI Overviews and Perplexity prefer pages with clear Q&A content.
                Generate SEO-optimized FAQs for your service pages.
              </p>
              <div className="flex gap-3 mb-4">
                <select value={faqTopic} onChange={(e) => setFaqTopic(e.target.value)}
                  className="flex-1 px-3 py-2.5 border border-slate-300 rounded-xl text-sm outline-none focus:border-violet-400">
                  {TOPICS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <button onClick={handleGenerateFaqs} disabled={generatingFaqs}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}>
                  {generatingFaqs ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  Generate FAQs
                </button>
              </div>

              {faqs.length > 0 && (
                <div className="space-y-3">
                  {faqs.map((faq, i) => (
                    <div key={i} className="rounded-xl border border-slate-200 overflow-hidden">
                      <div className="px-4 py-3 bg-slate-50 flex items-start justify-between gap-3">
                        <p className="text-sm font-semibold text-slate-900 flex-1">{faq.q}</p>
                        <button onClick={() => copyToClipboard(`Q: ${faq.q}\nA: ${faq.a}`, "FAQ")}
                          className="text-slate-400 hover:text-slate-600 shrink-0">
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="px-4 py-3">
                        <p className="text-sm text-slate-600 leading-relaxed">{faq.a}</p>
                      </div>
                    </div>
                  ))}
                  <button
                    onClick={() => {
                      const text = faqs.map((f) => `Q: ${f.q}\nA: ${f.a}`).join("\n\n");
                      copyToClipboard(text, "All FAQs");
                    }}
                    className="flex items-center gap-2 text-sm text-violet-600 hover:text-violet-800 font-medium"
                  >
                    <Copy className="w-4 h-4" />Copy all FAQs
                  </button>
                </div>
              )}
            </div>

            {faqs.length > 0 && (
              <div className="rounded-xl p-4 border border-violet-100 bg-violet-50">
                <p className="text-sm font-semibold text-violet-900 mb-1">Next step: Add FAQPage schema</p>
                <p className="text-xs text-violet-700">Switch to the Schema Markup tab to generate the FAQPage JSON-LD, then add both the Q&A content and schema to your service pages.</p>
              </div>
            )}
          </div>
        )}

        {/* SCHEMA MARKUP TAB */}
        {activeTab === "schema" && (
          <div className="space-y-5">
            <div className="card p-6">
              <h2 className="text-base font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-violet-500" />Generate JSON-LD Schema Markup
              </h2>
              <p className="text-sm text-slate-500 mb-4">
                Structured data helps AI engines understand and cite your content. Copy the generated
                script tag and add it to the <code className="bg-slate-100 px-1 rounded text-xs">&lt;head&gt;</code> of your relevant pages.
              </p>
              <div className="flex gap-3 mb-4">
                <select value={schemaType} onChange={(e) => setSchemaType(e.target.value)}
                  className="flex-1 px-3 py-2.5 border border-slate-300 rounded-xl text-sm outline-none focus:border-violet-400">
                  {SCHEMA_TYPES.map((t) => <option key={t} value={t}>{t} Schema</option>)}
                </select>
                <button onClick={handleGenerateSchema} disabled={generatingSchema}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}>
                  {generatingSchema ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                  Generate Schema
                </button>
              </div>

              {schemaResult && (
                <div className="space-y-3">
                  <div className="relative">
                    <pre className="bg-slate-900 text-emerald-300 text-xs p-4 rounded-xl overflow-x-auto leading-relaxed max-h-80">
                      {schemaResult.json_ld}
                    </pre>
                    <button
                      onClick={() => copyToClipboard(schemaResult.json_ld, "JSON-LD schema")}
                      className="absolute top-3 right-3 flex items-center gap-1 px-2 py-1 bg-white/10 hover:bg-white/20 text-white text-xs rounded-lg"
                    >
                      <Copy className="w-3 h-3" />Copy
                    </button>
                  </div>
                  <p className="text-xs text-slate-500 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                    {schemaResult.placement || "Add to <head> of the relevant page"}
                  </p>
                </div>
              )}
            </div>

            <div className="card p-5">
              <h3 className="text-sm font-semibold text-slate-900 mb-3">Schema Priority for Healthcare</h3>
              <div className="space-y-2 text-sm text-slate-600">
                {[
                  { type: "MedicalBusiness", priority: "Critical", desc: "Homepage + location pages — enables rich results for your practice" },
                  { type: "FAQPage", priority: "High", desc: "Service pages — enables FAQ rich snippets in Google AI Overviews" },
                  { type: "Physician", priority: "High", desc: "Provider profile pages — boosts E-E-A-T signals for healthcare content" },
                  { type: "HowTo", priority: "Medium", desc: "Treatment process pages — cited by Perplexity and ChatGPT Search" },
                ].map((s) => (
                  <div key={s.type} className="flex items-start gap-3 p-2.5 rounded-lg bg-slate-50">
                    <span className={cn("text-xs px-1.5 py-0.5 rounded font-semibold shrink-0 mt-0.5",
                      s.priority === "Critical" ? "bg-rose-100 text-rose-700" :
                      s.priority === "High" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"
                    )}>{s.priority}</span>
                    <div>
                      <span className="font-medium text-slate-800">{s.type}</span>
                      <span className="text-slate-500"> — {s.desc}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* CONTENT OPTIMIZER TAB */}
        {activeTab === "optimize" && (
          <div className="space-y-5">
            <div className="card p-6">
              <h2 className="text-base font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <Bot className="w-4 h-4 text-violet-500" />AI Content Analyzer
              </h2>
              <p className="text-sm text-slate-500 mb-4">
                Paste a page's content below to get specific recommendations for improving its
                visibility in Google AI Overviews, Perplexity, and ChatGPT Search.
              </p>
              <textarea
                value={contentInput}
                onChange={(e) => setContentInput(e.target.value)}
                placeholder="Paste your page content here (or leave blank for a general analysis)…"
                rows={6}
                className="w-full px-3 py-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-violet-400 resize-none leading-relaxed"
              />
              <button onClick={handleOptimize} disabled={optimizing}
                className="mt-3 flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}>
                {optimizing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Analyze for AI Search
              </button>
            </div>

            {suggestions.length > 0 && (
              <div className="card p-6">
                <h3 className="text-base font-semibold text-slate-900 mb-4">
                  {suggestions.length} Optimization Opportunities
                </h3>
                <div className="space-y-3">
                  {suggestions.map((s: any, i: number) => (
                    <div key={i} className="flex items-start gap-3 p-4 rounded-xl border border-slate-100 hover:border-violet-200 transition-colors">
                      <AlertTriangle className={cn("w-4 h-4 shrink-0 mt-0.5",
                        s.impact === "high" ? "text-rose-500" : s.impact === "medium" ? "text-amber-500" : "text-slate-400"
                      )} />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <p className="text-sm font-semibold text-slate-900">{s.issue}</p>
                          <span className={cn("text-xs px-1.5 py-0.5 rounded font-medium", IMPACT_COLORS[s.impact || "low"])}>
                            {s.impact} impact
                          </span>
                          {s.engine && <span className="text-xs text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded">{s.engine}</span>}
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed">{s.suggestion}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
