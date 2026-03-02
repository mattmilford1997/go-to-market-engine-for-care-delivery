"use client";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { contentApi, approvalApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import ProgressBanner from "@/components/ProgressBanner";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  FileText, Instagram, Linkedin, Facebook, Calendar,
  RefreshCw, Zap, CheckCircle, Clock, Eye, EyeOff,
  BookOpen, TrendingUp,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────
interface ContentItem {
  id: string;
  title: string;
  body: string;           // full body text (markdown for blogs, caption for social, script for VM)
  content_type: string;
  status: string;
  target_keyword?: string;
  meta_description?: string;
  extra_data?: Record<string, any>;
  created_at: string;
}
interface CalendarEntry {
  week: number;
  items: Array<{ type: string; topic: string }>;
}

// ─── Constants ──────────────────────────────────────────────────
const TYPE_META: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  blog_post: { label: "Blog Post", color: "text-blue-700", bg: "bg-blue-50", icon: <BookOpen className="w-3.5 h-3.5" /> },
  social_facebook: { label: "Facebook", color: "text-blue-600", bg: "bg-blue-50", icon: <Facebook className="w-3.5 h-3.5" /> },
  social_instagram: { label: "Instagram", color: "text-pink-600", bg: "bg-pink-50", icon: <Instagram className="w-3.5 h-3.5" /> },
  social_linkedin: { label: "LinkedIn", color: "text-sky-700", bg: "bg-sky-50", icon: <Linkedin className="w-3.5 h-3.5" /> },
  email_sequence: { label: "Email", color: "text-violet-700", bg: "bg-violet-50", icon: <FileText className="w-3.5 h-3.5" /> },
  ad_copy_google: { label: "Google Ad", color: "text-orange-700", bg: "bg-orange-50", icon: <TrendingUp className="w-3.5 h-3.5" /> },
  ad_copy_meta: { label: "Meta Ad", color: "text-indigo-700", bg: "bg-indigo-50", icon: <TrendingUp className="w-3.5 h-3.5" /> },
  fax_sheet: { label: "Fax Sheet", color: "text-cyan-700", bg: "bg-cyan-50", icon: <FileText className="w-3.5 h-3.5" /> },
  voicemail_script: { label: "Voicemail", color: "text-emerald-700", bg: "bg-emerald-50", icon: <FileText className="w-3.5 h-3.5" /> },
  postcard: { label: "Postcard", color: "text-amber-700", bg: "bg-amber-50", icon: <FileText className="w-3.5 h-3.5" /> },
  directory_bio: { label: "Directory Bio", color: "text-rose-700", bg: "bg-rose-50", icon: <FileText className="w-3.5 h-3.5" /> },
};

const STATUS_MAP: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600",
  pending_review: "bg-amber-50 text-amber-700",
  approved: "bg-emerald-50 text-emerald-700",
  rejected: "bg-rose-50 text-rose-700",
  published: "bg-blue-50 text-blue-700",
  scheduled: "bg-violet-50 text-violet-700",
};

const CHART_COLORS = ["#3b82f6", "#3b82f6", "#ec4899", "#0ea5e9", "#8b5cf6", "#f97316", "#10b981"];

function TypeBadge({ type }: { type: string }) {
  const meta = TYPE_META[type] || { label: type, color: "text-slate-600", bg: "bg-slate-100", icon: null };
  return (
    <span className={cn("badge gap-1", meta.bg, meta.color)}>
      {meta.icon}
      {meta.label}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn("badge capitalize", STATUS_MAP[status] || "bg-slate-100 text-slate-600")}>
      {status.replace("_", " ")}
    </span>
  );
}

// ─── Markdown Renderer ───────────────────────────────────────────
function renderMarkdown(text: string): React.ReactNode[] {
  return text.split("\n").map((line, i) => {
    if (line.startsWith("### "))
      return <p key={i} className="text-sm font-semibold text-slate-800 mt-3 mb-0.5">{line.slice(4)}</p>;
    if (line.startsWith("## "))
      return <p key={i} className="text-base font-bold text-slate-900 mt-4 mb-1">{line.slice(3)}</p>;
    if (line.startsWith("# "))
      return <p key={i} className="text-lg font-bold text-slate-900 mt-4 mb-1">{line.slice(2)}</p>;
    if (line.startsWith("- ") || line.startsWith("* ")) {
      const content = line.slice(2);
      const parts = content.split(/(\*\*[^*]+\*\*)/g).map((p, j) =>
        p.startsWith("**") && p.endsWith("**") ? <strong key={j}>{p.slice(2, -2)}</strong> : p
      );
      return <div key={i} className="flex gap-1.5 text-sm text-slate-600"><span className="text-slate-400 shrink-0">•</span><span>{parts}</span></div>;
    }
    if (line.trim() === "") return <div key={i} className="h-1.5" />;
    const parts = line.split(/(\*\*[^*]+\*\*)/g).map((p, j) =>
      p.startsWith("**") && p.endsWith("**") ? <strong key={j}>{p.slice(2, -2)}</strong> : p
    );
    return <p key={i} className="text-sm text-slate-600 leading-relaxed">{parts}</p>;
  });
}

// ─── Content Preview ─────────────────────────────────────────────
function ContentPreview({ item }: { item: ContentItem }) {
  const body = item.body || "";
  const extra = item.extra_data || {};

  // Blog post
  if (item.content_type === "blog_post") {
    const faq: Array<{ question: string; answer: string }> = extra.faq_schema || [];
    return (
      <div className="mt-3 space-y-3">
        {item.meta_description && (
          <p className="text-xs text-slate-500 italic border-l-2 border-violet-200 pl-3">{item.meta_description}</p>
        )}
        {item.target_keyword && (
          <div className="flex gap-1 flex-wrap">
            <span className="px-2 py-0.5 bg-violet-50 text-violet-700 text-xs rounded-full">🔑 {item.target_keyword}</span>
            {(extra.secondary_keywords || []).slice(0, 4).map((kw: string) => (
              <span key={kw} className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded-full">{kw}</span>
            ))}
          </div>
        )}
        {body ? (
          <div className="max-h-72 overflow-y-auto border border-slate-100 rounded-lg p-3 bg-white space-y-0.5">
            {renderMarkdown(body)}
          </div>
        ) : (
          <p className="text-sm text-slate-400 italic">Content will be generated — click "Generate" to fill this draft.</p>
        )}
        {faq.length > 0 && (
          <div className="space-y-2 pt-1">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">FAQ</p>
            {faq.slice(0, 3).map((f, i) => (
              <div key={i}>
                <p className="text-xs font-semibold text-slate-700">Q: {f.question}</p>
                <p className="text-xs text-slate-500 mt-0.5">A: {f.answer}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Social posts
  if (item.content_type.startsWith("social_")) {
    const platform = item.content_type.replace("social_", "");
    const hashtags: string[] = extra.hashtags || [];
    const imageConcept: string = extra.image_concept || "";
    const bestDays: string[] = extra.best_days || [];
    const bestTimes: string[] = extra.best_times || [];
    return (
      <div className="mt-3 rounded-lg border border-slate-100 p-3 bg-white space-y-2">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{platform} post</p>
        <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">{body || "No caption yet."}</p>
        {hashtags.length > 0 && (
          <p className="text-xs text-blue-500">{hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" ")}</p>
        )}
        {imageConcept && <p className="text-xs text-slate-400 italic">📷 {imageConcept}</p>}
        {(bestDays.length > 0 || bestTimes.length > 0) && (
          <p className="text-xs text-slate-400">Best time: {bestDays.join(", ")} @ {bestTimes.join(", ")}</p>
        )}
      </div>
    );
  }

  // Email sequence (stored in extra_data.emails)
  if (item.content_type === "email_sequence") {
    const emails: any[] = extra.emails || [];
    if (emails.length > 0) {
      return (
        <div className="mt-3 space-y-2 max-h-80 overflow-y-auto">
          {emails.map((email: any, i: number) => (
            <div key={i} className="rounded-lg border border-slate-100 p-3 bg-white">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold text-violet-700">Day {email.day}</span>
                {email.focus && <span className="text-xs text-slate-400">· {email.focus}</span>}
              </div>
              <p className="text-xs font-semibold text-slate-700">Subject: {email.subject}</p>
              {email.preview_text && <p className="text-xs text-slate-400 italic mt-0.5">{email.preview_text}</p>}
              <p className="text-sm text-slate-600 leading-relaxed mt-2 whitespace-pre-wrap line-clamp-4">{email.body}</p>
              {email.cta && <p className="text-xs font-semibold text-violet-600 mt-1.5">CTA: {email.cta}</p>}
            </div>
          ))}
        </div>
      );
    }
    // Fallback to body text
    return <p className="text-sm text-slate-600 leading-relaxed mt-3 whitespace-pre-wrap">{body || "No content yet."}</p>;
  }

  // Fax sheet (extra_data has full structure)
  if (item.content_type === "fax_sheet") {
    const headline = extra.headline || "";
    const tagline = extra.tagline || "";
    const intro = extra.intro_paragraph || body;
    const whyRefer: string[] = extra.why_refer_points || [];
    const intake: string = extra.intake_process || "";
    return (
      <div className="mt-3 space-y-2">
        {headline && <p className="font-bold text-slate-900">{headline}</p>}
        {tagline && <p className="text-sm text-slate-500 italic">{tagline}</p>}
        {intro && <p className="text-sm text-slate-700 leading-relaxed">{intro}</p>}
        {whyRefer.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mt-2 mb-1">Why Refer</p>
            <ul className="space-y-0.5">
              {whyRefer.map((pt, i) => (
                <li key={i} className="flex gap-1.5 text-sm text-slate-600">
                  <span className="text-emerald-500 shrink-0">✓</span>{pt}
                </li>
              ))}
            </ul>
          </div>
        )}
        {intake && <p className="text-sm text-slate-600"><span className="font-medium">Intake:</span> {intake}</p>}
        {extra.footer_cta && <p className="text-sm font-semibold text-blue-700 mt-1">{extra.footer_cta}</p>}
      </div>
    );
  }

  // Voicemail script (body is the script text)
  if (item.content_type === "voicemail_script") {
    return (
      <div className="mt-3 rounded-lg border border-slate-100 p-3 bg-white">
        <p className="text-sm text-slate-700 leading-relaxed italic">"{body || "Script not yet generated."}"</p>
        {extra.word_count && <p className="text-xs text-slate-400 mt-1.5">{extra.word_count} words · ~{extra.estimated_duration_seconds}s</p>}
      </div>
    );
  }

  // Postcard
  if (item.content_type === "postcard") {
    const front = extra.front || {};
    const back = extra.back || {};
    return (
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-slate-100 p-3 bg-amber-50">
          <p className="text-xs font-semibold text-amber-700 mb-1">FRONT</p>
          {front.headline && <p className="font-bold text-slate-900 text-sm">{front.headline}</p>}
          {front.subheadline && <p className="text-xs text-slate-600 mt-0.5">{front.subheadline}</p>}
          {front.cta_text && <p className="text-xs font-semibold text-amber-700 mt-2">{front.cta_text}</p>}
        </div>
        <div className="rounded-lg border border-slate-100 p-3 bg-white">
          <p className="text-xs font-semibold text-slate-500 mb-1">BACK</p>
          {back.headline && <p className="font-medium text-slate-800 text-sm">{back.headline}</p>}
          {back.body && <p className="text-xs text-slate-600 mt-1 line-clamp-3">{back.body}</p>}
        </div>
      </div>
    );
  }

  // Default: render body as text (with markdown if it looks like markdown)
  if (body.includes("##") || body.includes("**")) {
    return (
      <div className="mt-3 max-h-60 overflow-y-auto border border-slate-100 rounded-lg p-3 bg-white space-y-0.5">
        {renderMarkdown(body)}
      </div>
    );
  }
  return (
    <p className="text-sm text-slate-600 leading-relaxed mt-3 whitespace-pre-wrap line-clamp-10">
      {body || "No content yet."}
    </p>
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

// ─── Calendar Grid ───────────────────────────────────────────────
const CALENDAR_TYPE_COLORS: Record<string, string> = {
  blog_post: "#3b82f6",
  social_facebook: "#3b82f6",
  social_instagram: "#ec4899",
  social_linkedin: "#0ea5e9",
  email: "#8b5cf6",
};

function CalendarCell({ week, items }: { week: number; items: Array<{ type: string; topic: string }> }) {
  return (
    <div className="rounded-lg border border-slate-100 p-2 min-h-20 hover:border-violet-200 transition-colors">
      <p className="text-xs font-semibold text-slate-400 mb-1.5">Wk {week}</p>
      <div className="space-y-0.5">
        {items.slice(0, 3).map((item, i) => {
          const color = CALENDAR_TYPE_COLORS[item.type] || "#94a3b8";
          return (
            <div key={i} className="flex items-center gap-1 group">
              <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
              <p className="text-xs text-slate-600 truncate leading-tight">{item.topic}</p>
            </div>
          );
        })}
        {items.length > 3 && (
          <p className="text-xs text-slate-400">+{items.length - 3} more</p>
        )}
        {items.length === 0 && (
          <p className="text-xs text-slate-300 italic">Empty</p>
        )}
      </div>
    </div>
  );
}

// ─── Demo Data ───────────────────────────────────────────────────
const DEMO_ITEMS: ContentItem[] = [
  { id: "ci1", title: "TMS Therapy: A Complete Patient Guide", body: "Transcranial Magnetic Stimulation (TMS) therapy is a non-invasive, FDA-cleared treatment for depression that uses magnetic pulses to stimulate nerve cells in the brain. Unlike medication, TMS has minimal systemic side effects and doesn't require anesthesia...", content_type: "blog_post", status: "published", target_keyword: "TMS therapy guide", created_at: "2026-02-20T10:00:00Z" },
  { id: "ci2", title: "5 Signs You Might Benefit from Ketamine Therapy", body: "Ketamine therapy has emerged as a breakthrough treatment for people with treatment-resistant depression. If you've tried two or more antidepressants without success, experienced suicidal ideation, or have been diagnosed with PTSD or CRPS, ketamine therapy may be right for you...", content_type: "blog_post", status: "approved", target_keyword: "ketamine therapy signs", created_at: "2026-02-22T10:00:00Z" },
  { id: "ci3", title: "Understanding Treatment-Resistant Depression", body: "Treatment-resistant depression (TRD) affects approximately 30% of patients with major depressive disorder. It's defined as failing to respond adequately to at least two different antidepressant treatments. But TRD doesn't mean hopeless — TMS and ketamine offer new paths to recovery...", content_type: "blog_post", status: "pending_review", target_keyword: "treatment resistant depression", created_at: "2026-02-24T10:00:00Z" },
  { id: "ci4", title: "TMS vs. ECT: Which Is Right for You?", body: "Both TMS (Transcranial Magnetic Stimulation) and ECT (Electroconvulsive Therapy) are effective treatments for severe depression. But they differ significantly in procedure, side effects, and recovery time. Here's what you need to know...", content_type: "blog_post", status: "draft", target_keyword: "TMS vs ECT comparison", created_at: "2026-02-26T10:00:00Z" },
  { id: "ci5", title: "Real stories: How TMS Changed My Life", body: "When you've tried medication after medication with little relief, it can feel like there's no way out of the darkness. That's exactly where our patient Sarah was before she discovered TMS therapy at our Phoenix clinic...", content_type: "social_facebook", status: "published", created_at: "2026-02-21T10:00:00Z" },
  { id: "ci6", title: "Did you know TMS therapy has a 60%+ success rate?", body: "Studies consistently show that TMS therapy helps 60-70% of patients with treatment-resistant depression. And unlike medication, TMS works at the source — gently stimulating the exact brain regions responsible for mood regulation...", content_type: "social_facebook", status: "approved", created_at: "2026-02-23T10:00:00Z" },
  { id: "ci7", title: "Your mental health journey matters", body: "At [Practice Name], we believe everyone deserves access to cutting-edge mental health treatment. That's why we accept most major insurance plans for TMS therapy and offer flexible scheduling to fit your life...", content_type: "social_facebook", status: "pending_review", created_at: "2026-02-25T10:00:00Z" },
  { id: "ci8", title: "TMS therapy — hope without medication", body: "Swipe to learn how TMS therapy is changing lives in Phoenix. No medication. No anesthesia. Just gentle magnetic pulses and real results. Most insurance accepted. Link in bio to book your free consultation.", content_type: "social_instagram", status: "published", created_at: "2026-02-20T10:00:00Z" },
  { id: "ci9", title: "5 questions to ask your doctor about TMS", body: "Before your TMS consultation, come prepared! Ask about: success rates for your specific diagnosis, what to expect during sessions, insurance coverage, how many sessions you'll need, and what happens if TMS doesn't work. We answer all of these at your free intake appointment.", content_type: "social_instagram", status: "approved", created_at: "2026-02-22T10:00:00Z" },
  { id: "ci10", title: "Why leading psychiatrists refer patients to TMS", body: "For healthcare providers: TMS therapy offers your treatment-resistant patients a proven, non-pharmacological path forward. Our co-management model means you stay informed at every step. Fax us a referral or call our provider line to learn more.", content_type: "social_linkedin", status: "published", created_at: "2026-02-21T10:00:00Z" },
  { id: "ci11", title: "The clinical evidence behind TMS therapy", body: "Over 30 randomized controlled trials have validated TMS therapy's effectiveness for major depressive disorder. The landmark NeuroStar trial showed a 58% response rate and 37% remission rate. Here's what the latest research means for your patients...", content_type: "social_linkedin", status: "pending_review", created_at: "2026-02-25T10:00:00Z" },
  { id: "ci12", title: "Monthly Newsletter: Advances in Mental Health Care", body: "Welcome to our February 2026 newsletter. This month, we're sharing the latest research on TMS therapy, a spotlight on our new ketamine infusion program, and patient success stories that remind us why we do this work every day...", content_type: "email_sequence", status: "approved", created_at: "2026-02-23T10:00:00Z" },
];
const DEMO_CALENDAR: CalendarEntry[] = [
  { week: 1, items: [{ type: "blog_post", topic: "TMS Patient Guide" }, { type: "social_facebook", topic: "Patient Story" }, { type: "social_instagram", topic: "TMS FAQ" }] },
  { week: 2, items: [{ type: "email", topic: "Feb Newsletter" }, { type: "social_linkedin", topic: "Clinical Evidence" }, { type: "social_facebook", topic: "Awareness Post" }] },
  { week: 3, items: [{ type: "blog_post", topic: "Ketamine Therapy Signs" }, { type: "social_instagram", topic: "Hope Message" }, { type: "social_facebook", topic: "Success Rate Stats" }] },
  { week: 4, items: [{ type: "social_facebook", topic: "Patient Testimonial" }, { type: "social_linkedin", topic: "Provider Referral" }, { type: "email", topic: "Patient Follow-Up" }] },
  { week: 5, items: [{ type: "blog_post", topic: "Treatment-Resistant Depression" }, { type: "social_instagram", topic: "Mental Health Tip" }] },
  { week: 6, items: [{ type: "social_facebook", topic: "Community Event" }, { type: "email", topic: "Monthly Roundup" }, { type: "blog_post", topic: "TMS vs ECT" }] },
  { week: 7, items: [{ type: "social_linkedin", topic: "Research Update" }, { type: "social_instagram", topic: "Staff Spotlight" }, { type: "social_facebook", topic: "Insurance Guide" }] },
  { week: 8, items: [{ type: "blog_post", topic: "Insurance Coverage Guide" }, { type: "social_facebook", topic: "FAQ Roundup" }, { type: "email", topic: "Patient Resources" }] },
  { week: 9, items: [{ type: "social_instagram", topic: "Inspiration Quote" }, { type: "social_linkedin", topic: "Industry News" }] },
  { week: 10, items: [{ type: "blog_post", topic: "Depression vs Anxiety" }, { type: "social_facebook", topic: "Mental Health Awareness" }, { type: "email", topic: "Q2 Newsletter" }] },
  { week: 11, items: [{ type: "social_instagram", topic: "Treatment Journey" }, { type: "social_linkedin", topic: "Case Study" }, { type: "social_facebook", topic: "Provider Spotlight" }] },
  { week: 12, items: [{ type: "blog_post", topic: "Q2 Mental Health Roundup" }, { type: "social_facebook", topic: "Quarter Recap" }, { type: "social_instagram", topic: "Looking Ahead" }] },
];

// ─── Main Page ───────────────────────────────────────────────────
export default function ContentPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const [items, setItems] = useState<ContentItem[]>([]);
  const [calendar, setCalendar] = useState<CalendarEntry[]>([]);
  const [activeFilter, setActiveFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) return;
    Promise.all([
      contentApi.items(companyId).catch(() => ({ data: { items: [] } })),
      contentApi.calendar(companyId).catch(() => ({ data: { weeks: [] } })),
    ]).then(([i, c]) => {
      // Normalise body_preview → body for API-returned items
      const rawItems = i.data.items || i.data || [];
      setItems(rawItems.map((item: any) => ({
        ...item,
        body: item.body ?? item.body_preview ?? "",
      })));
      setCalendar(c.data.weeks || []);
    }).finally(() => setLoading(false));
  }, [companyId]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const loadDemoData = () => {
    setItems(DEMO_ITEMS);
    setCalendar(DEMO_CALENDAR);
    setLoading(false);
    showToast("Demo data loaded — content library and 12-week calendar are now populated!");
  };

  const handleGenerate = async (type: string) => {
    setGenerating(type);
    // Estimated seconds per type — must exceed the ProgressBanner estimatedSeconds so
    // items exist in the DB before we refetch.
    const delayMs: Record<string, number> = { blog: 22000, social: 16000, calendar: 40000 };
    const startedAt = Date.now();
    try {
      if (type === "calendar") {
        await contentApi.generateFullCalendar(companyId);
        showToast("12-week content calendar generation started — results will appear below.");
      } else if (type === "blog") {
        await contentApi.generateBlogPost(companyId, "mental health treatment options", 1500);
        showToast("Blog post generation started — it will appear in Content Library & Approval Queue.");
      } else if (type === "social") {
        await contentApi.generateSocialPosts(companyId, "all", 3);
        showToast("Social post generation started — posts will appear below shortly.");
      }
      // Wait for the background task to finish before refetching
      await new Promise((r) => setTimeout(r, delayMs[type] ?? 20000));
      const [i, c] = await Promise.all([
        contentApi.items(companyId).catch(() => ({ data: { items: [] } })),
        type === "calendar"
          ? contentApi.calendar(companyId).catch(() => ({ data: { weeks: [] } }))
          : Promise.resolve(null),
      ]);
      setItems(i.data.items || i.data || []);
      if (c) setCalendar(c.data.weeks || []);
    } catch (err: any) {
      const msg = err?.isNetworkError
        ? "Cannot reach backend API — set BACKEND_URL in Railway to your backend service URL."
        : "Generation failed — ensure ANTHROPIC_API_KEY is set on the backend.";
      showToast(msg);
      // Keep the progress banner visible for at least 2 seconds even on quick failures
      const elapsed = Date.now() - startedAt;
      if (elapsed < 2000) await new Promise((r) => setTimeout(r, 2000 - elapsed));
    } finally {
      setGenerating(null);
    }
  };

  // Stats
  const total = items.length;
  const published = items.filter((i) => i.status === "published").length;
  const pending = items.filter((i) => i.status === "pending_review").length;
  const scheduled = items.filter((i) => i.status === "scheduled").length;
  const approved = items.filter((i) => i.status === "approved").length;

  // Type distribution chart
  const typeCounts: Record<string, number> = {};
  items.forEach((i) => {
    typeCounts[i.content_type] = (typeCounts[i.content_type] || 0) + 1;
  });
  const chartData = Object.entries(typeCounts).map(([type, count]) => ({
    name: TYPE_META[type]?.label || type,
    value: count,
  }));

  // Filtered items
  const FILTERS = ["all", "blog_post", "social_facebook", "social_instagram", "social_linkedin", "pending_review", "approved", "published"];
  const filteredItems = items.filter((i) => {
    if (activeFilter === "all") return true;
    if (["blog_post", "social_facebook", "social_instagram", "social_linkedin"].includes(activeFilter)) return i.content_type === activeFilter;
    return i.status === activeFilter;
  });

  // Build calendar weeks (fill 12 if from API or show empty)
  const calendarWeeks = calendar.length > 0 ? calendar : Array.from({ length: 12 }, (_, i) => ({ week: i + 1, items: [] }));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-96">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 text-violet-400 animate-spin mx-auto mb-3" />
          <p className="text-slate-500 text-sm">Loading Content Studio…</p>
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
      <div className="gradient-content px-4 sm:px-8 py-5 sm:py-7 text-white">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <FileText className="w-5 h-5 opacity-80" />
              <span className="text-sm font-medium opacity-80 uppercase tracking-wide">Module 3</span>
            </div>
            <h1 className="text-2xl font-bold">Content Studio</h1>
            <p className="text-violet-100 text-sm mt-1">Blog posts · Social media · 12-week editorial calendar</p>
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
              onClick={() => handleGenerate("blog")}
              disabled={!!generating}
              className="flex items-center gap-2 px-3 py-2 bg-white/15 hover:bg-white/25 text-white rounded-xl text-sm font-medium transition-all border border-white/20 disabled:opacity-50"
            >
              {generating === "blog" ? <RefreshCw className="w-4 h-4 animate-spin" /> : <BookOpen className="w-4 h-4" />}
              New Blog Post
            </button>
            <button
              onClick={() => handleGenerate("social")}
              disabled={!!generating}
              className="flex items-center gap-2 px-3 py-2 bg-white/15 hover:bg-white/25 text-white rounded-xl text-sm font-medium transition-all border border-white/20 disabled:opacity-50"
            >
              {generating === "social" ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Instagram className="w-4 h-4" />}
              Social Posts
            </button>
            <button
              onClick={() => handleGenerate("calendar")}
              disabled={!!generating}
              className="flex items-center gap-2 px-3 py-2 bg-white/15 hover:bg-white/25 text-white rounded-xl text-sm font-medium transition-all border border-white/20 disabled:opacity-50"
            >
              {generating === "calendar" ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Calendar className="w-4 h-4" />}
              12-Week Calendar
            </button>
          </div>
        </div>
      </div>

      <ProgressBanner
        active={generating === "blog"}
        label="Writing Blog Post"
        estimatedSeconds={18}
        steps={["Researching keyword…", "Drafting article body…", "Generating FAQ schema…", "Finalising metadata…"]}
        color="violet"
      />
      <ProgressBanner
        active={generating === "social"}
        label="Generating Social Posts"
        estimatedSeconds={12}
        steps={["Crafting Facebook captions…", "Writing Instagram posts…", "Drafting LinkedIn content…"]}
        color="violet"
      />
      <ProgressBanner
        active={generating === "calendar"}
        label="Building 12-Week Content Calendar"
        estimatedSeconds={35}
        steps={[
          "Planning content pillars…",
          "Scheduling 12 weeks of topics…",
          "Balancing blog and social mix…",
          "Writing social captions…",
          "Saving to approval queue…",
        ]}
        color="violet"
      />

      <div className="p-4 sm:p-8 space-y-6 sm:space-y-8">
        {/* Stats Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <StatCard icon={<FileText className="w-5 h-5 text-violet-600" />} label="Total Content" value={total} sub="All types" accent="bg-violet-50" />
          <StatCard icon={<CheckCircle className="w-5 h-5 text-emerald-600" />} label="Published" value={published} sub="Live on site" accent="bg-emerald-50" />
          <StatCard icon={<Clock className="w-5 h-5 text-amber-600" />} label="Pending Review" value={pending} sub="Awaiting approval" accent="bg-amber-50" />
          <StatCard icon={<Calendar className="w-5 h-5 text-blue-600" />} label="Scheduled" value={scheduled} sub="Queued to publish" accent="bg-blue-50" />
        </div>

        {/* Two-column: Calendar + Distribution */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          {/* Content Calendar */}
          <div className="card p-4 sm:p-6 col-span-1 lg:col-span-2">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">12-Week Content Calendar</h2>
                <p className="text-sm text-slate-500 mt-0.5">Editorial plan across all content types</p>
              </div>
              <button
                onClick={() => handleGenerate("calendar")}
                disabled={!!generating}
                className="flex items-center gap-1.5 px-3 py-1.5 text-white rounded-lg text-xs font-medium disabled:opacity-50"
                style={{ background: "#8b5cf6" }}
              >
                <Zap className="w-3 h-3" />
                {calendar.length > 0 ? "Regenerate" : "Generate Calendar"}
              </button>
            </div>
            {/* Legend */}
            <div className="flex gap-3 mb-4">
              {Object.entries(CALENDAR_TYPE_COLORS).slice(0, 4).map(([type, color]) => (
                <div key={type} className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ background: color }} />
                  <span className="text-xs text-slate-500">{TYPE_META[type]?.label || type}</span>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-6 gap-2">
              {calendarWeeks.slice(0, 12).map((week: any) => (
                <CalendarCell key={week.week} week={week.week} items={week.items || []} />
              ))}
            </div>
          </div>

          {/* Distribution */}
          <div className="card p-6">
            <h2 className="text-base font-semibold text-slate-900 mb-4">Content Mix</h2>
            {chartData.length > 0 ? (
              <>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={chartData} cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={3} dataKey="value">
                        {chartData.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-2 mt-2">
                  {chartData.map((d, i) => (
                    <div key={d.name} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                        <span className="text-xs text-slate-600">{d.name}</span>
                      </div>
                      <span className="text-xs font-semibold text-slate-900">{d.value}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-center py-8">
                <p className="text-slate-400 text-sm">No content yet</p>
                <p className="text-slate-300 text-xs mt-1">Generate content to see distribution</p>
              </div>
            )}

            {/* Status Pipeline */}
            <div className="mt-6 pt-4 border-t border-slate-100">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Pipeline</h3>
              <div className="flex items-center gap-1 text-xs">
                {[
                  { label: "Draft", count: items.filter((i) => i.status === "draft").length, color: "bg-slate-300" },
                  { label: "Review", count: pending, color: "bg-amber-400" },
                  { label: "Approved", count: approved, color: "bg-emerald-400" },
                  { label: "Published", count: published, color: "bg-blue-500" },
                ].map((s) => (
                  <div key={s.label} className="flex flex-col items-center gap-1 flex-1">
                    <div className="text-slate-700 font-bold">{s.count}</div>
                    <div className={cn("w-full h-1.5 rounded-full", s.color)} />
                    <div className="text-slate-500 text-center leading-tight">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Content Library */}
        <div className="card p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Content Library</h2>
              <p className="text-sm text-slate-500 mt-0.5">{filteredItems.length} items</p>
            </div>
          </div>

          {/* Filters */}
          <div className="flex gap-1 flex-wrap mb-4">
            {[
              { key: "all", label: "All" },
              { key: "blog_post", label: "Blog" },
              { key: "social_facebook", label: "Facebook" },
              { key: "social_instagram", label: "Instagram" },
              { key: "social_linkedin", label: "LinkedIn" },
              { key: "pending_review", label: "Pending" },
              { key: "approved", label: "Approved" },
              { key: "published", label: "Published" },
            ].map((f) => (
              <button
                key={f.key}
                onClick={() => setActiveFilter(f.key)}
                className={cn(
                  "px-3 py-1 rounded-lg text-xs font-medium transition-all",
                  activeFilter === f.key
                    ? "bg-violet-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          {filteredItems.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="w-10 h-10 text-slate-200 mx-auto mb-3" />
              <p className="text-slate-500 text-sm font-medium">No content yet</p>
              <p className="text-slate-400 text-xs mt-1">Click "New Blog Post", "Social Posts", or "Generate 12-Week Calendar" to get started</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredItems.map((item) => (
                <div key={item.id} className="border border-slate-100 rounded-xl overflow-hidden hover:border-violet-200 transition-colors">
                  <div
                    className="flex items-center gap-3 p-4 cursor-pointer"
                    onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                  >
                    <TypeBadge type={item.content_type} />
                    <p className="flex-1 text-sm font-medium text-slate-900 truncate">{item.title || "(Untitled)"}</p>
                    {item.target_keyword && (
                      <span className="text-xs text-slate-400 hidden md:block">🔑 {item.target_keyword}</span>
                    )}
                    <StatusBadge status={item.status} />
                    <button className="text-slate-400 hover:text-slate-600 shrink-0">
                      {expandedId === item.id ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {expandedId === item.id && (
                    <div className="px-4 pb-4 border-t border-slate-50">
                      <ContentPreview item={item} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
