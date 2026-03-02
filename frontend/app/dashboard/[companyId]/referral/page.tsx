"use client";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { referralApi, approvalApi } from "@/lib/api";
import { formatNumber, cn } from "@/lib/utils";
import ProgressBanner from "@/components/ProgressBanner";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, FunnelChart, Funnel, LabelList,
} from "recharts";
import {
  Users, Mail, Phone, FileText, Mic, CreditCard,
  RefreshCw, TrendingUp, ChevronRight, AlertCircle, CheckCircle,
  Upload, Zap,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────
interface Lead {
  id: string;
  first_name: string;
  last_name: string;
  credentials: string;
  specialty: string;
  fax: string;
  email: string;
  city: string;
  state: string;
  status: string;
  source: string;
}
interface Campaign {
  id: string;
  name: string;
  channel: string;
  status: string;
  impressions: number;
  clicks: number;
  form_submissions: number;
  spend: number;
  budget_cap: number;
}

// ─── Helpers ─────────────────────────────────────────────────────
const STATUS_PIPELINE = ["new", "contacted", "engaged", "referring", "inactive"];

const STATUS_COLORS: Record<string, string> = {
  new: "#94a3b8",
  contacted: "#60a5fa",
  engaged: "#818cf8",
  referring: "#34d399",
  inactive: "#fca5a5",
  suppressed: "#f87171",
};

const CHANNEL_META: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  fax: { icon: <FileText className="w-4 h-4" />, label: "Fax Sheets", color: "bg-blue-50 text-blue-700 border-blue-200" },
  email: { icon: <Mail className="w-4 h-4" />, label: "Email Sequences", color: "bg-violet-50 text-violet-700 border-violet-200" },
  voicemail: { icon: <Mic className="w-4 h-4" />, label: "Voicemail Scripts", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  mail: { icon: <CreditCard className="w-4 h-4" />, label: "Postcards", color: "bg-orange-50 text-orange-700 border-orange-200" },
};

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
    new: "bg-slate-100 text-slate-600",
    contacted: "bg-blue-50 text-blue-700",
    engaged: "bg-indigo-50 text-indigo-700",
    referring: "bg-emerald-50 text-emerald-700",
    inactive: "bg-slate-50 text-slate-400",
    suppressed: "bg-rose-50 text-rose-700",
    active: "bg-emerald-50 text-emerald-700",
    paused: "bg-amber-50 text-amber-700",
    draft: "bg-slate-50 text-slate-500",
  };
  return (
    <span className={cn("badge capitalize", map[status] || "bg-slate-50 text-slate-600")}>
      {status}
    </span>
  );
}

// ─── Demo Data ───────────────────────────────────────────────────
const DEMO_LEADS: Lead[] = [
  { id: "l1", first_name: "Sarah", last_name: "Chen", credentials: "MD", specialty: "Family Medicine", fax: "(602) 555-0101", email: "schen@familycare.com", city: "Phoenix", state: "AZ", status: "referring", source: "nppes" },
  { id: "l2", first_name: "James", last_name: "Rivera", credentials: "DO", specialty: "Internal Medicine", fax: "(602) 555-0102", email: "jrivera@im.com", city: "Scottsdale", state: "AZ", status: "engaged", source: "nppes" },
  { id: "l3", first_name: "Emily", last_name: "Thompson", credentials: "MD", specialty: "Psychiatry", fax: "(602) 555-0103", email: "ethompson@psych.com", city: "Tempe", state: "AZ", status: "contacted", source: "nppes" },
  { id: "l4", first_name: "Michael", last_name: "Park", credentials: "LCSW", specialty: "Therapy", fax: "(480) 555-0104", email: "mpark@therapy.com", city: "Mesa", state: "AZ", status: "new", source: "nppes" },
  { id: "l5", first_name: "Jennifer", last_name: "Walsh", credentials: "NP", specialty: "Nurse Practitioner", fax: "(480) 555-0105", email: "jwalsh@np.com", city: "Chandler", state: "AZ", status: "new", source: "nppes" },
  { id: "l6", first_name: "Robert", last_name: "Martinez", credentials: "MD", specialty: "Neurology", fax: "(602) 555-0106", email: "rmartinez@neuro.com", city: "Phoenix", state: "AZ", status: "referring", source: "nppes" },
  { id: "l7", first_name: "Lisa", last_name: "Johnson", credentials: "PhD", specialty: "Clinical Psychology", fax: "(602) 555-0107", email: "ljohnson@cpsy.com", city: "Scottsdale", state: "AZ", status: "engaged", source: "nppes" },
  { id: "l8", first_name: "David", last_name: "Kim", credentials: "MD", specialty: "Geriatric Psychiatry", fax: "(480) 555-0108", email: "dkim@gpsych.com", city: "Mesa", state: "AZ", status: "contacted", source: "nppes" },
  { id: "l9", first_name: "Amanda", last_name: "Foster", credentials: "LMFT", specialty: "Marriage & Family Therapy", fax: "(480) 555-0109", email: "afoster@mft.com", city: "Gilbert", state: "AZ", status: "new", source: "nppes" },
  { id: "l10", first_name: "Christopher", last_name: "Brown", credentials: "MD", specialty: "Addiction Medicine", fax: "(623) 555-0110", email: "cbrown@addmed.com", city: "Peoria", state: "AZ", status: "new", source: "nppes" },
  { id: "l11", first_name: "Patricia", last_name: "Garcia", credentials: "PMHNP", specialty: "Psychiatric NP", fax: "(623) 555-0111", email: "pgarcia@pmhnp.com", city: "Glendale", state: "AZ", status: "inactive", source: "nppes" },
  { id: "l12", first_name: "Thomas", last_name: "Wilson", credentials: "MD", specialty: "Family Medicine", fax: "(623) 555-0112", email: "twilson@fm.com", city: "Surprise", state: "AZ", status: "contacted", source: "nppes" },
];
const DEMO_CAMPAIGNS: Campaign[] = [
  { id: "c1", name: "Phoenix PCPs — Q1 2026", channel: "fax", status: "active", impressions: 847, clicks: 0, form_submissions: 23, spend: 0, budget_cap: 0 },
  { id: "c2", name: "Scottsdale Therapists — Email", channel: "email", status: "active", impressions: 412, clicks: 87, form_submissions: 11, spend: 0, budget_cap: 0 },
  { id: "c3", name: "Greater Phoenix — Postcard", channel: "mail", status: "paused", impressions: 300, clicks: 0, form_submissions: 6, spend: 450, budget_cap: 1000 },
];
const DEMO_REFERRAL_QUEUE: any[] = [
  { id: "r1", title: "Referral Fax Sheet — TMS Overview", item_type: "fax_sheet", status: "approved", preview_data: {}, created_at: "2026-02-27T09:00:00Z" },
  { id: "r2", title: "Referral Fax Sheet — Ketamine Program", item_type: "fax_sheet", status: "pending", preview_data: {}, created_at: "2026-02-27T09:01:00Z" },
  { id: "r3", title: "Email Sequence — PCPs Introduction", item_type: "email_sequence", status: "approved", preview_data: {}, created_at: "2026-02-27T09:02:00Z" },
  { id: "r4", title: "Email Sequence — Follow-Up Series", item_type: "email_sequence", status: "pending", preview_data: {}, created_at: "2026-02-27T09:03:00Z" },
  { id: "r5", title: "Voicemail Script — Introduction", item_type: "voicemail_script", status: "approved", preview_data: {}, created_at: "2026-02-27T09:04:00Z" },
  { id: "r6", title: "Voicemail Script — Follow-Up", item_type: "voicemail_script", status: "approved", preview_data: {}, created_at: "2026-02-27T09:05:00Z" },
  { id: "r7", title: "Voicemail Script — Final Touch", item_type: "voicemail_script", status: "pending", preview_data: {}, created_at: "2026-02-27T09:06:00Z" },
  { id: "r8", title: "Postcard — Practice Overview", item_type: "postcard", status: "pending", preview_data: {}, created_at: "2026-02-27T09:07:00Z" },
];

// ─── Main Page ───────────────────────────────────────────────────
export default function ReferralPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [queueItems, setQueueItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generatingLeads, setGeneratingLeads] = useState(false);
  const [uploadingCsv, setUploadingCsv] = useState(false);
  const [listName, setListName] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!companyId) return;
    Promise.all([
      referralApi.leads(companyId).catch(() => ({ data: { leads: [], total: 0 } })),
      referralApi.campaigns(companyId).catch(() => ({ data: [] })),
      approvalApi.queue(companyId, "referral").catch(() => ({ data: [] })),
    ]).then(([l, c, q]) => {
      setLeads((l.data as any).leads || []);
      setCampaigns(c.data || []);
      setQueueItems(Array.isArray(q.data) ? q.data : []);
    }).finally(() => setLoading(false));
  }, [companyId]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingCsv(true);
    try {
      const result = await referralApi.uploadLeadsCsv(companyId, file, listName || undefined);
      const { created, list_name: name, unrecognized_columns } = result.data;
      let msg = `${created} leads imported${name ? ` as "${name}"` : ""}`;
      if (unrecognized_columns?.length) msg += ` · ${unrecognized_columns.length} unrecognized column(s) skipped`;
      showToast(msg);
      setListName("");
      const l = await referralApi.leads(companyId).catch(() => ({ data: { leads: [] } }));
      setLeads((l.data as any).leads || []);
    } catch {
      showToast("Upload failed — check CSV format and try again.");
    } finally {
      setUploadingCsv(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const loadDemoData = () => {
    setLeads(DEMO_LEADS);
    setCampaigns(DEMO_CAMPAIGNS);
    setQueueItems(DEMO_REFERRAL_QUEUE);
    setLoading(false);
    showToast("Demo data loaded — explore leads, pipeline, and collateral!");
  };

  const handleGenerateLeads = async () => {
    setGeneratingLeads(true);
    try {
      await referralApi.generateLeads(companyId);
      showToast("Lead generation started — querying NPPES registry, this takes ~30 seconds…");
      // NPPES API takes 15-30 seconds; wait before re-fetching so leads are ready
      await new Promise((r) => setTimeout(r, 30000));
      const l = await referralApi.leads(companyId).catch(() => ({ data: { leads: [] } }));
      setLeads((l.data as any).leads || []);
    } catch {
      showToast("Lead generation failed — check API configuration.");
    } finally {
      setGeneratingLeads(false);
    }
  };

  const handleGenerateCollateral = async () => {
    setGenerating(true);
    try {
      await referralApi.generateAllCollateral(companyId);
      showToast("Collateral generation started — fax, email, voicemail, and postcard assets queued.");
      const q = await approvalApi.queue(companyId, "referral").catch(() => ({ data: [] }));
      setQueueItems(Array.isArray(q.data) ? q.data : []);
    } catch {
      showToast("Collateral generation failed — ensure ANTHROPIC_API_KEY is set.");
    } finally {
      setGenerating(false);
    }
  };

  // Pipeline funnel data
  const statusCounts = STATUS_PIPELINE.reduce((acc, s) => {
    acc[s] = leads.filter((l) => l.status === s).length;
    return acc;
  }, {} as Record<string, number>);

  const funnelData = STATUS_PIPELINE.map((s) => ({
    name: s.charAt(0).toUpperCase() + s.slice(1),
    value: statusCounts[s],
    fill: STATUS_COLORS[s],
  }));

  const collateralByType = {
    fax: queueItems.filter((i) => i.item_type === "fax_sheet"),
    email: queueItems.filter((i) => i.item_type === "email_sequence"),
    voicemail: queueItems.filter((i) => i.item_type === "voicemail_script"),
    mail: queueItems.filter((i) => i.item_type === "postcard"),
  };

  const sequence30Day = [
    { day: 1, channel: "email", action: "Introduction email" },
    { day: 3, channel: "fax", action: "Referral fax sheet" },
    { day: 7, channel: "voicemail", action: "Voicemail drop" },
    { day: 10, channel: "email", action: "Follow-up email" },
    { day: 14, channel: "mail", action: "Postcard arrives" },
    { day: 18, channel: "fax", action: "Case study fax" },
    { day: 21, channel: "email", action: "Value-add email" },
    { day: 28, channel: "voicemail", action: "Final voicemail" },
    { day: 30, channel: "email", action: "Campaign wrap-up" },
  ];

  const channelColors: Record<string, string> = {
    email: "bg-violet-500",
    fax: "bg-blue-500",
    voicemail: "bg-emerald-500",
    mail: "bg-orange-500",
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-96">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin mx-auto mb-3" />
          <p className="text-slate-500 text-sm">Loading Referral Pipeline…</p>
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
      <div className="gradient-referral px-4 sm:px-8 py-5 sm:py-7 text-white">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-5 h-5 opacity-80" />
              <span className="text-sm font-medium opacity-80 uppercase tracking-wide">Module 2</span>
            </div>
            <h1 className="text-2xl font-bold">Referral Pipeline</h1>
            <p className="text-emerald-100 text-sm mt-1">Provider leads · Multi-channel outreach · 30-day sequences</p>
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
              onClick={handleGenerateLeads}
              disabled={generatingLeads}
              className="flex items-center gap-2 px-3 py-2 bg-white/15 hover:bg-white/25 text-white rounded-xl text-sm font-medium transition-all border border-white/20 disabled:opacity-50"
            >
              {generatingLeads ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
              Generate Leads
            </button>
            <button
              onClick={handleGenerateCollateral}
              disabled={generating}
              className="flex items-center gap-2 px-3 py-2 bg-white/15 hover:bg-white/25 text-white rounded-xl text-sm font-medium transition-all border border-white/20 disabled:opacity-50"
            >
              {generating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              Generate All Collateral
            </button>
          </div>
        </div>
      </div>

      <ProgressBanner
        active={generatingLeads}
        label="Searching NPPES Registry for Provider Leads"
        estimatedSeconds={25}
        steps={[
          "Querying NPPES national provider registry…",
          "Filtering by specialty and location…",
          "Deduplicating records…",
          "Importing provider contacts…",
        ]}
        color="emerald"
      />
      <ProgressBanner
        active={generating}
        label="Generating All Referral Collateral"
        estimatedSeconds={50}
        steps={[
          "Writing fax sheets for each specialty…",
          "Scripting voicemail drops…",
          "Drafting 7-email outreach sequences…",
          "Designing postcard copy…",
          "Saving assets to approval queue…",
        ]}
        color="emerald"
      />

      <div className="p-4 sm:p-8 space-y-6 sm:space-y-8">
        {/* Stats Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <StatCard icon={<Users className="w-5 h-5 text-emerald-600" />} label="Total Leads" value={formatNumber(leads.length)} sub="In database" accent="bg-emerald-50" />
          <StatCard icon={<TrendingUp className="w-5 h-5 text-blue-600" />} label="New Leads" value={statusCounts.new || 0} sub="Ready to contact" accent="bg-blue-50" />
          <StatCard icon={<CheckCircle className="w-5 h-5 text-indigo-600" />} label="Actively Referring" value={statusCounts.referring || 0} sub="Converted providers" accent="bg-indigo-50" />
          <StatCard icon={<Mail className="w-5 h-5 text-violet-600" />} label="Collateral Pieces" value={queueItems.length} sub="Fax, email, VM, mail" accent="bg-violet-50" />
        </div>

        {/* Two column: Pipeline + Collateral */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 sm:gap-6">
          {/* Pipeline Funnel */}
          <div className="card p-4 sm:p-6 col-span-1 lg:col-span-2">
            <h2 className="text-base font-semibold text-slate-900 mb-4">Lead Pipeline</h2>
            <div className="space-y-2">
              {STATUS_PIPELINE.map((s) => {
                const count = statusCounts[s] || 0;
                const max = Math.max(...STATUS_PIPELINE.map((st) => statusCounts[st] || 0), 1);
                const width = Math.round((count / max) * 100);
                return (
                  <div key={s}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm capitalize text-slate-700 font-medium">{s}</span>
                      <span className="text-sm font-bold text-slate-900">{count}</span>
                    </div>
                    <div className="progress-track">
                      <div
                        className="progress-fill"
                        style={{ width: `${width}%`, background: STATUS_COLORS[s] }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            {leads.length === 0 && (
              <div className="text-center mt-6 py-4">
                <p className="text-slate-400 text-xs">No leads yet — click "Generate Leads" to pull from NPPES</p>
              </div>
            )}
          </div>

          {/* Collateral Status */}
          <div className="card p-4 sm:p-6 col-span-1 lg:col-span-3">
            <h2 className="text-base font-semibold text-slate-900 mb-4">Collateral Status</h2>
            <div className="grid grid-cols-2 gap-3">
              {(Object.keys(CHANNEL_META) as Array<keyof typeof CHANNEL_META>).map((ch) => {
                const meta = CHANNEL_META[ch];
                const items = collateralByType[ch as keyof typeof collateralByType] || [];
                const hasDone = items.length > 0;
                return (
                  <div key={ch} className={cn("rounded-xl border p-4", meta.color)}>
                    <div className="flex items-center gap-2 mb-2">
                      {meta.icon}
                      <span className="text-sm font-semibold">{meta.label}</span>
                      {hasDone && <CheckCircle className="w-4 h-4 ml-auto" />}
                    </div>
                    <p className="text-2xl font-bold">{items.length}</p>
                    <p className="text-xs opacity-75 mt-0.5">
                      {hasDone ? `${items.filter((i) => i.status === "approved").length} approved, ${items.filter((i) => i.status === "pending").length} pending` : "Not generated yet"}
                    </p>
                  </div>
                );
              })}
            </div>
            <button
              onClick={handleGenerateCollateral}
              disabled={generating}
              className="mt-4 w-full py-2.5 rounded-xl text-sm font-medium transition-colors text-white disabled:opacity-50"
              style={{ background: "#10b981" }}
            >
              {generating ? "Generating…" : "Generate All Collateral"}
            </button>
          </div>
        </div>

        {/* 30-Day Sequence */}
        <div className="card p-6">
          <div className="flex items-start justify-between mb-5">
            <div>
              <h2 className="text-base font-semibold text-slate-900">30-Day Outreach Sequence</h2>
              <p className="text-sm text-slate-500 mt-0.5">Multi-channel touchpoints for each provider lead</p>
            </div>
            <div className="flex gap-2">
              {Object.entries(channelColors).map(([ch, color]) => (
                <div key={ch} className="flex items-center gap-1.5">
                  <div className={cn("w-2 h-2 rounded-full", color)} />
                  <span className="text-xs text-slate-500 capitalize">{ch}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute top-4 left-0 right-0 h-0.5 bg-slate-100" />
            <div className="flex justify-between relative">
              {sequence30Day.map((step) => (
                <div key={step.day} className="flex flex-col items-center gap-2 group">
                  <div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold z-10 relative shadow-sm", channelColors[step.channel])}>
                    {step.day}
                  </div>
                  <div className="text-center">
                    <p className="text-xs font-semibold text-slate-700 capitalize">{step.channel}</p>
                    <p className="text-xs text-slate-400 w-16 text-center leading-tight mt-0.5">{step.action}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Leads Table */}
        <div className="card p-6">
          <div className="flex items-start justify-between mb-4 gap-4 flex-wrap">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Provider Leads</h2>
              <p className="text-sm text-slate-500 mt-0.5">{leads.length} providers in database</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {/* CSV Upload with optional list name */}
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={listName}
                  onChange={(e) => setListName(e.target.value)}
                  placeholder="List name (e.g. Pediatricians in Texas)"
                  className="w-56 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingCsv}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
                >
                  {uploadingCsv ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                  Upload CSV
                </button>
                <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleCsvUpload} />
              </div>
              <button
                onClick={handleGenerateLeads}
                disabled={generatingLeads}
                className="flex items-center gap-1.5 px-3 py-1.5 text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                style={{ background: "#10b981" }}
              >
                {generatingLeads ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Users className="w-3 h-3" />}
                Auto-Generate from NPPES
              </button>
            </div>
          </div>

          {leads.length === 0 ? (
            <div className="text-center py-16">
              <Users className="w-12 h-12 text-slate-200 mx-auto mb-4" />
              <p className="text-slate-500 font-medium">No provider leads yet</p>
              <p className="text-slate-400 text-sm mt-1">Generate leads from NPPES or upload a CSV</p>
              <div className="flex justify-center gap-3 mt-4">
                <button
                  onClick={handleGenerateLeads}
                  disabled={generatingLeads}
                  className="flex items-center gap-2 px-4 py-2 text-white rounded-lg text-sm font-medium"
                  style={{ background: "#10b981" }}
                >
                  <Users className="w-4 h-4" />
                  Auto-Generate from NPPES
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingCsv}
                  className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  {uploadingCsv ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  Upload CSV
                </button>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Provider</th>
                    <th>Specialty</th>
                    <th>Location</th>
                    <th>Fax</th>
                    <th>Email</th>
                    <th>Status</th>
                    <th>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.slice(0, 50).map((lead) => (
                    <tr key={lead.id}>
                      <td>
                        <span className="font-medium text-slate-900">
                          {lead.first_name} {lead.last_name}
                          {lead.credentials && <span className="text-xs text-slate-400 ml-1">{lead.credentials}</span>}
                        </span>
                      </td>
                      <td className="text-slate-600">{lead.specialty}</td>
                      <td className="text-slate-600">{lead.city}, {lead.state}</td>
                      <td className="text-xs font-mono text-slate-500">{lead.fax || "—"}</td>
                      <td className="text-xs text-slate-500 max-w-32 truncate">{lead.email || "—"}</td>
                      <td><StatusBadge status={lead.status} /></td>
                      <td>
                        <span className="text-xs text-slate-400 uppercase">{lead.source === "nppes" ? "NPPES" : lead.source}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {leads.length > 50 && (
                <p className="text-xs text-slate-400 text-center pt-3">Showing 50 of {leads.length} leads — use Leads page for full management</p>
              )}
            </div>
          )}
        </div>

        {/* Campaigns */}
        {campaigns.length > 0 && (
          <div className="card p-6">
            <h2 className="text-base font-semibold text-slate-900 mb-4">Active Campaigns</h2>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Campaign</th>
                    <th>Channel</th>
                    <th>Status</th>
                    <th>Impressions</th>
                    <th>Clicks</th>
                    <th>Conversions</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((c) => (
                    <tr key={c.id}>
                      <td className="font-medium text-slate-900">{c.name}</td>
                      <td><span className="text-xs text-slate-500 capitalize">{c.channel}</span></td>
                      <td><StatusBadge status={c.status} /></td>
                      <td className="font-mono text-sm">{formatNumber(c.impressions)}</td>
                      <td className="font-mono text-sm">{formatNumber(c.clicks)}</td>
                      <td className="font-mono text-sm text-emerald-600 font-semibold">{c.form_submissions}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Compliance Note */}
        <div className="rounded-xl p-4 flex items-start gap-3" style={{ background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
          <CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
          <p className="text-sm text-emerald-800">
            <span className="font-semibold">Compliance Built-In:</span> All outreach is CAN-SPAM, TCPA, and Junk Fax Prevention Act compliant. Opt-out handling, physical address, and unsubscribe links are included in all generated materials.
          </p>
        </div>
      </div>
    </div>
  );
}
