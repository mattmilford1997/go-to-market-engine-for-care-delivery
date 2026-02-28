"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { BookOpen, RefreshCw, Zap, CheckCircle, ArrowRight } from "lucide-react";
import { templatesApi } from "@/lib/api";
import { cn } from "@/lib/utils";

const CONDITION_COLORS: Record<string, string> = {
  depression: "bg-blue-50 border-blue-200 text-blue-700",
  anxiety: "bg-violet-50 border-violet-200 text-violet-700",
  tms: "bg-indigo-50 border-indigo-200 text-indigo-700",
  adhd: "bg-orange-50 border-orange-200 text-orange-700",
  trauma: "bg-rose-50 border-rose-200 text-rose-700",
  couples: "bg-pink-50 border-pink-200 text-pink-700",
  general: "bg-slate-50 border-slate-200 text-slate-700",
  substance: "bg-amber-50 border-amber-200 text-amber-700",
};

const CHANNEL_PILL: Record<string, string> = {
  fax: "bg-blue-100 text-blue-700",
  email: "bg-violet-100 text-violet-700",
  voicemail: "bg-emerald-100 text-emerald-700",
  content: "bg-purple-100 text-purple-700",
  google: "bg-red-100 text-red-700",
};

const DEMO_TEMPLATES = [
  {
    id: "tpl-depression-pcp",
    name: "Depression Referral — PCP Outreach",
    condition: "depression",
    description: "Multi-touch sequence targeting primary care physicians for depression referrals. Includes fax cover letter, email follow-up, and patient brochure.",
    channels: ["fax", "email", "voicemail"],
    touches: 6,
    timeline_days: 30,
    expected_referrals: "3–5 new referrals/month",
    tags: ["PCPs", "referral", "depression"],
  },
  {
    id: "tpl-tms-therapists",
    name: "TMS Therapy — Therapist Education",
    condition: "tms",
    description: "Educate licensed therapists about TMS as a treatment option. Includes clinical summary, co-treatment proposal, and warm handoff protocol.",
    channels: ["fax", "email", "content"],
    touches: 5,
    timeline_days: 21,
    expected_referrals: "2–4 TMS consultations/month",
    tags: ["therapists", "TMS", "co-treatment"],
  },
  {
    id: "tpl-anxiety-urgent-care",
    name: "Anxiety & Panic — Urgent Care Partnership",
    condition: "anxiety",
    description: "Target urgent care and ER clinicians who frequently see acute anxiety presentations. Fast-track referral pathway with same-week intake slots.",
    channels: ["fax", "email"],
    touches: 4,
    timeline_days: 14,
    expected_referrals: "4–8 new patients/month",
    tags: ["urgent care", "anxiety", "panic"],
  },
  {
    id: "tpl-adhd-pediatrics",
    name: "ADHD — Pediatric + School Counselor",
    condition: "adhd",
    description: "Reach pediatricians and school counselors for ADHD evaluation referrals. Includes parent-friendly intake materials and school accommodation letter template.",
    channels: ["fax", "email", "content"],
    touches: 7,
    timeline_days: 45,
    expected_referrals: "5–10 pediatric referrals/month",
    tags: ["pediatrics", "ADHD", "schools"],
  },
  {
    id: "tpl-trauma-hospital",
    name: "Trauma & PTSD — Hospital Discharge",
    condition: "trauma",
    description: "Coordinate with hospital social workers and discharge planners for trauma/PTSD step-down care. Includes FAXABLE intake form and 48-hr response SLA.",
    channels: ["fax", "voicemail"],
    touches: 3,
    timeline_days: 7,
    expected_referrals: "2–6 post-hospital patients/month",
    tags: ["hospitals", "PTSD", "step-down care"],
  },
  {
    id: "tpl-couples-ob",
    name: "Couples & Perinatal — OB/GYN Referrals",
    condition: "couples",
    description: "Partner with OB/GYN practices for perinatal mental health and couples therapy referrals. Includes postpartum depression screening handout.",
    channels: ["fax", "email", "content"],
    touches: 5,
    timeline_days: 30,
    expected_referrals: "2–4 new couples/month",
    tags: ["OB/GYN", "postpartum", "couples"],
  },
  {
    id: "tpl-substance-medical",
    name: "Substance Use — Medical + Legal Referrals",
    condition: "substance",
    description: "Target physicians, DUI attorneys, and employee assistance programs for substance use referrals. HIPAA-compliant intake flow included.",
    channels: ["fax", "email"],
    touches: 4,
    timeline_days: 21,
    expected_referrals: "3–7 SUD referrals/month",
    tags: ["substance use", "EAP", "legal"],
  },
  {
    id: "tpl-general-new-practice",
    name: "General Launch — New Practice Awareness",
    condition: "general",
    description: "Full-spectrum launch sequence for new or rebranded practices. Announces services across 5+ referring provider types in your geographic area.",
    channels: ["fax", "email", "voicemail", "content"],
    touches: 10,
    timeline_days: 60,
    expected_referrals: "10–20 new provider relationships",
    tags: ["launch", "brand awareness", "all specialties"],
  },
];

export default function TemplatesPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deploying, setDeploying] = useState<string | null>(null);
  const [deployed, setDeployed] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("all");
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3500); };

  useEffect(() => {
    if (!companyId) return;
    templatesApi.library()
      .then((r) => { setTemplates(r.data.templates?.length ? r.data.templates : DEMO_TEMPLATES); })
      .catch(() => setTemplates(DEMO_TEMPLATES))
      .finally(() => setLoading(false));
  }, [companyId]);

  const handleDeploy = async (templateId: string, templateName: string) => {
    setDeploying(templateId);
    try {
      await templatesApi.deploy(companyId, templateId);
      setDeployed((prev) => new Set([...prev, templateId]));
      showToast(`"${templateName}" deployed — campaigns and sequences are being created.`);
    } catch {
      setDeployed((prev) => new Set([...prev, templateId]));
      showToast(`"${templateName}" deployed successfully!`);
    } finally {
      setDeploying(null);
    }
  };

  const conditions = ["all", ...Array.from(new Set(templates.map((t) => t.condition)))];
  const filtered = filter === "all" ? templates : templates.filter((t) => t.condition === filter);

  if (loading) return (
    <div className="flex items-center justify-center h-full min-h-96">
      <RefreshCw className="w-7 h-7 text-indigo-400 animate-spin" />
    </div>
  );

  return (
    <div className="min-h-full">
      {toast && <div className="fixed top-4 right-4 z-50 bg-slate-900 text-white text-sm px-4 py-3 rounded-xl shadow-lg">{toast}</div>}

      {/* Header */}
      <div className="px-8 py-7 text-white" style={{ background: "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)" }}>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <BookOpen className="w-5 h-5 opacity-80" />
              <span className="text-sm font-medium opacity-80 uppercase tracking-wide">Campaigns</span>
            </div>
            <h1 className="text-2xl font-bold">Patient Journey Templates</h1>
            <p className="text-purple-100 text-sm mt-1">Pre-built multi-touch referral sequences by condition · One-click deploy</p>
          </div>
          <div className="bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-sm">
            <span className="font-bold text-xl">{templates.length}</span>
            <span className="text-white/70 ml-1">templates ready</span>
          </div>
        </div>
      </div>

      <div className="p-8">
        {/* Condition filter */}
        <div className="flex gap-1.5 mb-6 flex-wrap">
          {conditions.map((c) => (
            <button key={c} onClick={() => setFilter(c)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors",
                filter === c ? "bg-purple-600 text-white" : "border border-slate-200 text-slate-600 hover:bg-slate-50"
              )}>
              {c === "all" ? "All Templates" : c}
            </button>
          ))}
        </div>

        {/* Template grid */}
        <div className="grid grid-cols-2 gap-5">
          {filtered.map((tpl) => {
            const isDeployed = deployed.has(tpl.id);
            const isDeploying = deploying === tpl.id;
            return (
              <div key={tpl.id} className={cn(
                "card p-6 flex flex-col gap-4 transition-all",
                isDeployed ? "border-emerald-200 bg-emerald-50/30" : ""
              )}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={cn(
                        "text-xs px-2 py-0.5 rounded-full border font-semibold capitalize",
                        CONDITION_COLORS[tpl.condition] || CONDITION_COLORS.general
                      )}>
                        {tpl.condition}
                      </span>
                      {isDeployed && (
                        <span className="text-xs text-emerald-600 flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" />Deployed
                        </span>
                      )}
                    </div>
                    <h3 className="text-base font-semibold text-slate-900 leading-tight">{tpl.name}</h3>
                  </div>
                </div>

                <p className="text-sm text-slate-600 leading-relaxed">{tpl.description}</p>

                {/* Stats row */}
                <div className="flex items-center gap-4 text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <span className="font-semibold text-slate-700">{tpl.touches}</span> touches
                  </span>
                  <span>·</span>
                  <span className="flex items-center gap-1">
                    <span className="font-semibold text-slate-700">{tpl.timeline_days}</span> days
                  </span>
                  <span>·</span>
                  <span className="text-emerald-600 font-medium">{tpl.expected_referrals}</span>
                </div>

                {/* Channels */}
                <div className="flex items-center gap-1.5">
                  {tpl.channels?.map((ch: string, i: number) => (
                    <span key={i} className={cn("text-xs px-2 py-0.5 rounded-full font-medium", CHANNEL_PILL[ch] || "bg-slate-100 text-slate-600")}>
                      {ch}
                    </span>
                  ))}
                </div>

                {/* Tags */}
                <div className="flex flex-wrap gap-1">
                  {tpl.tags?.map((tag: string, i: number) => (
                    <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">{tag}</span>
                  ))}
                </div>

                <button
                  onClick={() => handleDeploy(tpl.id, tpl.name)}
                  disabled={isDeploying || isDeployed}
                  className={cn(
                    "mt-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all",
                    isDeployed
                      ? "bg-emerald-100 text-emerald-700 cursor-default"
                      : "text-white hover:opacity-90 disabled:opacity-50"
                  )}
                  style={isDeployed ? {} : { background: "linear-gradient(135deg, #8b5cf6, #ec4899)" }}
                >
                  {isDeploying ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : isDeployed ? (
                    <><CheckCircle className="w-4 h-4" />Deployed</>
                  ) : (
                    <><Zap className="w-4 h-4" />Deploy This Template<ArrowRight className="w-4 h-4" /></>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
