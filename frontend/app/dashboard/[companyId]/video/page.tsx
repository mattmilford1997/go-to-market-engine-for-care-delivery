"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Film, RefreshCw, Plus, Sparkles, Copy, Trash2, ChevronDown, ChevronRight, PlayCircle } from "lucide-react";
import { videoApi } from "@/lib/api";
import { cn } from "@/lib/utils";

const PLATFORM_COLORS: Record<string, string> = {
  youtube_preroll: "bg-red-100 text-red-700 border-red-200",
  meta_reels: "bg-indigo-100 text-indigo-700 border-indigo-200",
  tiktok: "bg-slate-900 text-white border-slate-800",
  ctv: "bg-sky-100 text-sky-700 border-sky-200",
  google_display_video: "bg-amber-100 text-amber-700 border-amber-200",
  linkedin_video: "bg-blue-100 text-blue-700 border-blue-200",
};

const LENGTH_OPTIONS = ["6s (Bumper)", "15s", "30s", "60s"];

const DEMO_CONCEPTS = [
  {
    title: "The Scroll Stop",
    hook: "Text on black: 'What if you could feel like yourself again?'",
    concept: "Quick-cut montage of daily life moments (morning coffee, laughing with family) intercut with before/after emotional states. Ends with clinic name and phone number.",
    best_platform: "Meta Reels / TikTok",
    length: "15s",
    emotional_driver: "Hope",
  },
  {
    title: "The Expert",
    hook: "Provider on camera: 'I've treated depression for 15 years. Here's what actually works.'",
    concept: "30-second talking-head style video. Establishes credibility, explains one key treatment benefit in plain language, ends with 'Most insurance accepted — call today.'",
    best_platform: "YouTube Pre-Roll / LinkedIn",
    length: "30s",
    emotional_driver: "Trust",
  },
  {
    title: "The Statistic Shock",
    hook: "Large text: '1 in 3 people with depression don't respond to medication.'",
    concept: "Data-driven opening. Transitions to TMS/alternative treatment explanation. Ends with social proof stat and clear CTA. B-roll of welcoming clinic space.",
    best_platform: "CTV / YouTube",
    length: "30s",
    emotional_driver: "Urgency + Authority",
  },
];

export default function VideoPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const [platforms, setPlatforms] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [ads, setAds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"library" | "create" | "concepts">("library");

  // Create form state
  const [platform, setPlatform] = useState("youtube_preroll");
  const [topic, setTopic] = useState("");
  const [length, setLength] = useState("30s");
  const [templateId, setTemplateId] = useState("tpl-problem-solution");
  const [generating, setGenerating] = useState(false);
  const [generatingConcepts, setGeneratingConcepts] = useState(false);
  const [concepts, setConcepts] = useState<any[]>([]);
  const [expandedAd, setExpandedAd] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3500); };

  useEffect(() => {
    if (!companyId) return;
    Promise.all([
      videoApi.platforms(),
      videoApi.ads(companyId).catch(() => ({ data: { ads: [] } })),
    ]).then(([p, a]) => {
      setPlatforms(p.data.platforms || []);
      setTemplates(p.data.templates || []);
      setAds(a.data.ads || []);
    }).finally(() => setLoading(false));
  }, [companyId]);

  const handleGenerate = async () => {
    if (!topic.trim()) { showToast("Please enter a topic for the ad."); return; }
    setGenerating(true);
    try {
      const r = await videoApi.generateScript(companyId, { platform, topic, length: length.split(" ")[0], template_id: templateId });
      setAds((prev) => [r.data, ...prev]);
      setExpandedAd(r.data.id);
      setActiveTab("library");
      showToast(`"${r.data.name}" script generated!`);
      setTopic("");
    } catch {
      showToast("Script generation failed — check connection.");
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerateConcepts = async () => {
    if (!topic.trim()) { showToast("Enter a topic to generate concepts."); return; }
    setGeneratingConcepts(true);
    try {
      const r = await videoApi.generateConcepts(companyId, topic);
      setConcepts(r.data.concepts || DEMO_CONCEPTS);
      showToast("3 video concepts generated!");
    } catch {
      setConcepts(DEMO_CONCEPTS);
      showToast("3 demo concepts loaded!");
    } finally {
      setGeneratingConcepts(false);
    }
  };

  const handleDelete = async (id: string) => {
    setAds((prev) => prev.filter((a) => a.id !== id));
    try { await videoApi.deleteAd(companyId, id); } catch {}
  };

  const copyScript = (ad: any) => {
    const scenes = ad.script?.scenes || [];
    const text = scenes.map((s: any) => `[${s.time}]\nVisual: ${s.visual}\nAudio: ${s.audio}${s.text_overlay ? `\nText: ${s.text_overlay}` : ""}`).join("\n\n");
    navigator.clipboard.writeText(text).then(() => showToast("Script copied!")).catch(() => showToast("Copy failed."));
  };

  if (loading) return (
    <div className="flex items-center justify-center h-full min-h-96">
      <RefreshCw className="w-7 h-7 text-pink-400 animate-spin" />
    </div>
  );

  return (
    <div className="min-h-full">
      {toast && <div className="fixed top-4 right-4 z-50 bg-slate-900 text-white text-sm px-4 py-3 rounded-xl shadow-lg max-w-sm">{toast}</div>}

      {/* Header */}
      <div className="px-8 py-7 text-white" style={{ background: "linear-gradient(135deg, #be185d 0%, #7c3aed 50%, #4f46e5 100%)" }}>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Film className="w-5 h-5 opacity-80" />
              <span className="text-sm font-medium opacity-80 uppercase tracking-wide">AI Creative</span>
            </div>
            <h1 className="text-2xl font-bold">AI Video Ad Generator</h1>
            <p className="text-pink-100 text-sm mt-1">
              Generate scripts, storyboards & concepts for YouTube, Meta, TikTok, CTV, and more
            </p>
          </div>
          <button
            onClick={() => setActiveTab("create")}
            className="flex items-center gap-2 px-4 py-2 bg-white/15 hover:bg-white/25 text-white rounded-xl text-sm font-medium border border-white/20"
          >
            <Plus className="w-4 h-4" />New Ad
          </button>
        </div>
      </div>

      {/* Platform badges */}
      <div className="px-8 py-4 flex gap-2 flex-wrap border-b border-slate-100 bg-white">
        {(platforms.length ? platforms : [
          { id: "youtube_preroll", name: "YouTube Pre-Roll", length: "15–30s", format: "16:9" },
          { id: "meta_reels", name: "Meta Reels", length: "15–30s", format: "9:16" },
          { id: "tiktok", name: "TikTok", length: "15–60s", format: "9:16" },
          { id: "ctv", name: "Connected TV", length: "30–60s", format: "16:9" },
          { id: "google_display_video", name: "Google Video", length: "6–30s", format: "16:9" },
          { id: "linkedin_video", name: "LinkedIn", length: "15–30s", format: "1:1" },
        ]).map((p: any) => (
          <span key={p.id} className={cn("text-xs px-2.5 py-1 rounded-full border font-medium", PLATFORM_COLORS[p.id] || "bg-slate-100 text-slate-600 border-slate-200")}>
            {p.name} · {p.length} · {p.format}
          </span>
        ))}
      </div>

      <div className="p-8 space-y-6">
        {/* Tab nav */}
        <div className="flex gap-1 p-1 bg-slate-100 rounded-xl w-fit">
          {(["library", "create", "concepts"] as const).map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={cn("px-4 py-2 rounded-lg text-sm font-medium capitalize transition-all",
                activeTab === tab ? "bg-white shadow-sm text-pink-700" : "text-slate-600 hover:text-slate-800"
              )}>
              {tab === "library" ? `Ad Library (${ads.length})` : tab === "create" ? "Generate Script" : "Concept Generator"}
            </button>
          ))}
        </div>

        {/* AD LIBRARY TAB */}
        {activeTab === "library" && (
          <div className="space-y-4">
            {ads.length === 0 ? (
              <div className="card p-12 text-center">
                <PlayCircle className="w-14 h-14 text-slate-200 mx-auto mb-4" />
                <h2 className="text-base font-semibold text-slate-700">No video ads yet</h2>
                <p className="text-sm text-slate-500 mt-1 mb-4">Generate your first AI-powered video ad script in seconds.</p>
                <button onClick={() => setActiveTab("create")} className="inline-flex items-center gap-2 px-5 py-2.5 text-white rounded-xl text-sm font-medium"
                  style={{ background: "linear-gradient(135deg, #be185d, #7c3aed)" }}>
                  <Plus className="w-4 h-4" />Generate First Ad
                </button>
              </div>
            ) : (
              ads.map((ad) => {
                const isOpen = expandedAd === ad.id;
                const platformInfo = platforms.find((p) => p.id === ad.platform);
                return (
                  <div key={ad.id} className="card overflow-hidden">
                    <div className="flex items-center justify-between p-5">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <button onClick={() => setExpandedAd(isOpen ? null : ad.id)}>
                          {isOpen ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                        </button>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-semibold text-slate-900 truncate">{ad.name}</h3>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={cn("text-xs px-2 py-0.5 rounded-full border font-medium", PLATFORM_COLORS[ad.platform] || "bg-slate-100 text-slate-600")}>
                              {ad.platform_name || ad.platform}
                            </span>
                            <span className="text-xs text-slate-400">{ad.length}</span>
                            {ad.template && <span className="text-xs text-slate-400">· {ad.template}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button onClick={() => copyScript(ad)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100">
                          <Copy className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(ad.id)} className="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-rose-50">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {isOpen && ad.script && (
                      <div className="border-t border-slate-100">
                        {/* Scenes */}
                        <div className="p-5 space-y-3">
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Scene Breakdown</p>
                          {(ad.script.scenes || []).map((scene: any, i: number) => (
                            <div key={i} className="grid grid-cols-[80px_1fr_1fr] gap-3 text-xs">
                              <div className="font-semibold text-slate-700 bg-slate-50 rounded-lg px-2 py-2 text-center">{scene.time}</div>
                              <div>
                                <p className="font-medium text-slate-600 mb-0.5">Visual</p>
                                <p className="text-slate-700 leading-relaxed">{scene.visual}</p>
                              </div>
                              <div>
                                <p className="font-medium text-slate-600 mb-0.5">Audio</p>
                                <p className="text-slate-700 leading-relaxed">{scene.audio}</p>
                                {scene.text_overlay && <p className="mt-1 px-2 py-0.5 bg-amber-50 border border-amber-100 rounded text-amber-700 font-medium">{scene.text_overlay}</p>}
                              </div>
                            </div>
                          ))}
                        </div>
                        {/* CTA + Notes */}
                        {(ad.script.cta || ad.script.notes) && (
                          <div className="border-t border-slate-100 px-5 py-4 flex gap-4 bg-slate-50">
                            {ad.script.cta && (
                              <div>
                                <p className="text-xs font-semibold text-slate-500 uppercase mb-1">CTA</p>
                                <p className="text-sm font-medium text-emerald-700">{ad.script.cta}</p>
                              </div>
                            )}
                            {ad.script.notes && (
                              <div className="flex-1">
                                <p className="text-xs font-semibold text-slate-500 uppercase mb-1">Notes</p>
                                <p className="text-xs text-slate-600">{ad.script.notes}</p>
                              </div>
                            )}
                          </div>
                        )}
                        <div className="border-t border-slate-100 px-5 py-3 flex justify-end">
                          <button onClick={() => copyScript(ad)}
                            className="flex items-center gap-1.5 text-xs font-medium text-pink-600 hover:text-pink-800">
                            <Copy className="w-3.5 h-3.5" />Copy Full Script
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* CREATE TAB */}
        {activeTab === "create" && (
          <div className="grid grid-cols-2 gap-6">
            <div className="card p-6 space-y-4">
              <h2 className="text-base font-semibold text-slate-900">Generate Video Ad Script</h2>

              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1.5">Topic / Service</label>
                <input type="text" value={topic} onChange={(e) => setTopic(e.target.value)}
                  placeholder="e.g., TMS therapy for depression, anxiety treatment, ADHD evaluation…"
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm outline-none focus:border-pink-400" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1.5">Platform</label>
                <select value={platform} onChange={(e) => setPlatform(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm outline-none focus:border-pink-400">
                  {(platforms.length ? platforms : [
                    { id: "youtube_preroll", name: "YouTube Pre-Roll" },
                    { id: "meta_reels", name: "Meta Reels / Stories" },
                    { id: "tiktok", name: "TikTok" },
                    { id: "ctv", name: "Connected TV (CTV)" },
                    { id: "google_display_video", name: "Google Display Video" },
                    { id: "linkedin_video", name: "LinkedIn Video Ad" },
                  ]).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1.5">Ad Length</label>
                <div className="flex gap-2">
                  {LENGTH_OPTIONS.map((l) => (
                    <button key={l} onClick={() => setLength(l)}
                      className={cn("flex-1 py-2 rounded-xl text-sm font-medium border transition-all",
                        length === l ? "bg-pink-50 border-pink-300 text-pink-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                      )}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1.5">Ad Template</label>
                <div className="space-y-2">
                  {(templates.length ? templates : [
                    { id: "tpl-problem-solution", name: "Problem → Solution", description: "Opens with patient struggle, positions clinic as the answer" },
                    { id: "tpl-social-proof", name: "Testimonial / Social Proof", description: "Real patient story or provider voiceover with statistics" },
                    { id: "tpl-education", name: "Education / Explainer", description: "Explains treatment in plain language, builds trust" },
                    { id: "tpl-urgency", name: "Awareness + Urgency", description: "Creates urgency, targets high-intent searchers" },
                    { id: "tpl-bumper", name: "6-Second Bumper", description: "Ultra-short brand awareness — one message, one CTA" },
                  ]).map((t: any) => (
                    <div key={t.id} onClick={() => setTemplateId(t.id)}
                      className={cn("flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all",
                        templateId === t.id ? "bg-pink-50 border-pink-300" : "border-slate-200 hover:bg-slate-50"
                      )}>
                      <div className={cn("w-4 h-4 rounded-full border-2 mt-0.5 shrink-0 flex items-center justify-center",
                        templateId === t.id ? "border-pink-500 bg-pink-500" : "border-slate-300"
                      )}>
                        {templateId === t.id && <div className="w-2 h-2 rounded-full bg-white" />}
                      </div>
                      <div>
                        <p className={cn("text-sm font-medium", templateId === t.id ? "text-pink-800" : "text-slate-800")}>{t.name}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{t.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={handleGenerateConcepts} disabled={generatingConcepts || !topic.trim()}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                  {generatingConcepts ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  Get Concepts First
                </button>
                <button onClick={handleGenerate} disabled={generating || !topic.trim()}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg, #be185d, #7c3aed)" }}>
                  {generating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Film className="w-4 h-4" />}
                  Generate Full Script
                </button>
              </div>
            </div>

            {/* Tips panel */}
            <div className="space-y-4">
              <div className="card p-5">
                <h3 className="text-sm font-semibold text-slate-900 mb-3">HIPAA Tips for Video Ads</h3>
                <div className="space-y-2 text-xs text-slate-600">
                  {[
                    "Use actors or stock footage — never real patient footage without written HIPAA authorization",
                    "Avoid specific diagnosis claims about identifiable individuals",
                    "\"Before/after\" depictions must use actors or obtain written consent",
                    "Get written release forms for any real patient testimonials",
                    "Include required disclosure: 'Results may vary. Individual outcomes differ.'",
                  ].map((tip, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="text-amber-500 shrink-0 mt-0.5">⚠</span>
                      <span>{tip}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="card p-5">
                <h3 className="text-sm font-semibold text-slate-900 mb-3">Platform Best Practices</h3>
                <div className="space-y-2 text-xs text-slate-600">
                  {[
                    { platform: "Meta Reels", tip: "Always add captions — 85% watched without sound. Use 9:16 vertical format." },
                    { platform: "TikTok", tip: "Hook within first 1–2 seconds. Native-feeling content outperforms polished ads." },
                    { platform: "YouTube", tip: "Skip button appears at 5s — put your strongest hook in the first 5 seconds." },
                    { platform: "CTV", tip: "No skip option — viewers will see the whole ad. Great for brand storytelling." },
                  ].map((p, i) => (
                    <div key={i}>
                      <span className="font-semibold text-slate-700">{p.platform}: </span>{p.tip}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* CONCEPTS TAB */}
        {activeTab === "concepts" && (
          <div className="space-y-5">
            <div className="card p-6">
              <h2 className="text-base font-semibold text-slate-900 mb-4">Concept Generator</h2>
              <p className="text-sm text-slate-500 mb-4">
                Get 3 creative video ad concepts before committing to a full script.
                Each concept includes a hook, narrative idea, and recommended platform.
              </p>
              <div className="flex gap-3">
                <input type="text" value={topic} onChange={(e) => setTopic(e.target.value)}
                  placeholder="e.g., TMS therapy for treatment-resistant depression…"
                  className="flex-1 px-3 py-2.5 border border-slate-300 rounded-xl text-sm outline-none focus:border-pink-400" />
                <button onClick={handleGenerateConcepts} disabled={generatingConcepts || !topic.trim()}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg, #be185d, #7c3aed)" }}>
                  {generatingConcepts ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  Generate Concepts
                </button>
              </div>
            </div>

            {(concepts.length ? concepts : DEMO_CONCEPTS).map((c, i) => (
              <div key={i} className="card p-6 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">{c.title}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs bg-pink-100 text-pink-700 px-2 py-0.5 rounded-full font-medium">{c.emotional_driver}</span>
                      <span className="text-xs text-slate-400">{c.length} · {c.best_platform}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => { setTopic(topic || c.title); setActiveTab("create"); }}
                    className="shrink-0 text-xs px-3 py-1.5 border border-pink-200 text-pink-600 rounded-lg hover:bg-pink-50"
                  >
                    Use This →
                  </button>
                </div>
                <div className="p-3 rounded-xl bg-slate-900 text-emerald-300 text-xs leading-relaxed">
                  <span className="text-slate-400 font-medium">HOOK: </span>{c.hook}
                </div>
                <p className="text-sm text-slate-600 leading-relaxed">{c.concept}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
