"use client";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { profilesApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  Globe, Star, CheckCircle, AlertCircle, RefreshCw,
  Zap, MapPin, Shield, Camera, ChevronRight, ExternalLink,
  Clock, XCircle,
} from "lucide-react";
import ProgressBanner from "@/components/ProgressBanner";

// ─── Types ──────────────────────────────────────────────────────
interface PlatformCard {
  platform: string;
  platform_name: string;
  exists: boolean;
  is_claimed: boolean;
  completeness_score: number;
  review_count: number;
  average_rating: number | null;
  auto_create_status: string;
  content_generated: boolean;
  credentials_stored: boolean;
  missing_fields: string[];
  optimization_score: number;
}

interface Scorecard {
  overall_score: number;
  claimed_profiles: number;
  total_platforms: number;
  platforms: PlatformCard[];
}

// ─── Constants ──────────────────────────────────────────────────
const PLATFORM_META: Record<string, { icon: string; color: string; bg: string; priority: number }> = {
  google_business_profile: { icon: "🔍", color: "text-blue-700", bg: "bg-blue-50", priority: 1 },
  psychology_today: { icon: "🧠", color: "text-green-700", bg: "bg-green-50", priority: 2 },
  therapyden: { icon: "💚", color: "text-emerald-700", bg: "bg-emerald-50", priority: 3 },
  healthgrades: { icon: "🏥", color: "text-red-700", bg: "bg-red-50", priority: 4 },
  zocdoc: { icon: "📅", color: "text-purple-700", bg: "bg-purple-50", priority: 5 },
  vitals: { icon: "❤️", color: "text-rose-700", bg: "bg-rose-50", priority: 6 },
  yelp: { icon: "⭐", color: "text-orange-700", bg: "bg-orange-50", priority: 7 },
  webmd: { icon: "💊", color: "text-sky-700", bg: "bg-sky-50", priority: 8 },
  samhsa: { icon: "🛡️", color: "text-indigo-700", bg: "bg-indigo-50", priority: 9 },
};

const AUTO_CREATE_STATUS: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  not_started: { label: "Not Started", color: "text-slate-500", icon: <Clock className="w-3 h-3" /> },
  pending: { label: "Pending", color: "text-amber-600", icon: <Clock className="w-3 h-3" /> },
  in_progress: { label: "In Progress", color: "text-blue-600", icon: <RefreshCw className="w-3 h-3 animate-spin" /> },
  completed: { label: "Live", color: "text-emerald-600", icon: <CheckCircle className="w-3 h-3" /> },
  failed: { label: "Failed", color: "text-rose-600", icon: <XCircle className="w-3 h-3" /> },
  needs_manual: { label: "Needs Manual", color: "text-amber-600", icon: <AlertCircle className="w-3 h-3" /> },
  captcha_blocked: { label: "CAPTCHA Blocked", color: "text-rose-600", icon: <Shield className="w-3 h-3" /> },
};

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          className={cn("w-3 h-3", s <= Math.round(rating) ? "text-amber-400 fill-amber-400" : "text-slate-200 fill-slate-200")}
        />
      ))}
      <span className="text-xs text-slate-500 ml-1">{rating.toFixed(1)}</span>
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

// ─── Platform Card Component ──────────────────────────────────────
function PlatformProfileCard({
  platform,
  onGenerateContent,
  onAutoCreate,
  generating,
}: {
  platform: PlatformCard;
  onGenerateContent: (p: string) => void;
  onAutoCreate: (p: string) => void;
  generating: string | null;
}) {
  const meta = PLATFORM_META[platform.platform] || { icon: "🌐", color: "text-slate-700", bg: "bg-slate-50", priority: 99 };
  const autoStatus = AUTO_CREATE_STATUS[platform.auto_create_status] || AUTO_CREATE_STATUS.not_started;
  const isGenerating = generating === platform.platform || generating === "all";

  return (
    <div className="card p-5 flex flex-col gap-4 hover:border-pink-200 transition-all">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center text-xl", meta.bg)}>
            {meta.icon}
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900 leading-tight">{platform.platform_name}</p>
            <div className={cn("flex items-center gap-1 mt-0.5", autoStatus.color)}>
              {autoStatus.icon}
              <span className="text-xs font-medium">{autoStatus.label}</span>
            </div>
          </div>
        </div>
        {platform.is_claimed && (
          <div className="flex items-center gap-1 text-emerald-600">
            <CheckCircle className="w-4 h-4" />
            <span className="text-xs font-medium">Claimed</span>
          </div>
        )}
      </div>

      {/* Completeness Bar */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-slate-500 font-medium">Completeness</span>
          <span className="text-xs font-bold text-slate-900">{platform.completeness_score}%</span>
        </div>
        <div className="progress-track">
          <div
            className="progress-fill"
            style={{
              width: `${platform.completeness_score}%`,
              background: platform.completeness_score >= 80 ? "#10b981" : platform.completeness_score >= 50 ? "#f59e0b" : "#ef4444",
            }}
          />
        </div>
      </div>

      {/* Rating */}
      {platform.average_rating && platform.average_rating > 0 && (
        <div className="flex items-center justify-between">
          <StarRating rating={platform.average_rating} />
          <span className="text-xs text-slate-400">{platform.review_count} reviews</span>
        </div>
      )}

      {/* Content status */}
      <div className="flex gap-2">
        {platform.content_generated && (
          <span className="badge bg-violet-50 text-violet-700">
            <CheckCircle className="w-3 h-3" />
            Content Ready
          </span>
        )}
        {platform.credentials_stored && (
          <span className="badge bg-emerald-50 text-emerald-700">
            <Shield className="w-3 h-3" />
            Credentials
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 mt-auto pt-1">
        {!platform.content_generated ? (
          <button
            onClick={() => onGenerateContent(platform.platform)}
            disabled={isGenerating}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-colors text-white disabled:opacity-50"
            style={{ background: "#ec4899" }}
          >
            {isGenerating ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
            Generate Content
          </button>
        ) : (
          <>
            <button
              onClick={() => onGenerateContent(platform.platform)}
              disabled={isGenerating}
              className="flex-1 py-2 rounded-lg text-xs font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              Regenerate
            </button>
            {platform.auto_create_status === "completed" ? (
              <button className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-medium bg-emerald-50 text-emerald-700">
                <ExternalLink className="w-3 h-3" />
                View Live
              </button>
            ) : (
              <button
                onClick={() => onAutoCreate(platform.platform)}
                disabled={isGenerating || platform.auto_create_status === "in_progress"}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-colors text-white disabled:opacity-50"
                style={{ background: "#6366f1" }}
              >
                {platform.auto_create_status === "in_progress" ? (
                  <><RefreshCw className="w-3 h-3 animate-spin" />Running…</>
                ) : (
                  <><Globe className="w-3 h-3" />Auto-Create</>
                )}
              </button>
            )}
          </>
        )}
      </div>

      {/* Missing Fields */}
      {platform.missing_fields && platform.missing_fields.length > 0 && (
        <div className="pt-2 border-t border-slate-100">
          <p className="text-xs text-slate-400 mb-1">Missing:</p>
          <div className="flex flex-wrap gap-1">
            {platform.missing_fields.slice(0, 3).map((f) => (
              <span key={f} className="text-xs px-1.5 py-0.5 bg-rose-50 text-rose-600 rounded">{f}</span>
            ))}
            {platform.missing_fields.length > 3 && (
              <span className="text-xs text-slate-400">+{platform.missing_fields.length - 3}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Demo Data ───────────────────────────────────────────────────
const DEMO_SCORECARD: Scorecard = {
  overall_score: 74,
  claimed_profiles: 5,
  total_platforms: 9,
  platforms: [
    { platform: "google_business_profile", platform_name: "Google Business Profile", exists: true, is_claimed: true, completeness_score: 96, review_count: 142, average_rating: 4.8, auto_create_status: "completed", content_generated: true, credentials_stored: true, missing_fields: ["holiday_hours"], optimization_score: 96 },
    { platform: "psychology_today", platform_name: "Psychology Today", exists: true, is_claimed: true, completeness_score: 88, review_count: 31, average_rating: 4.9, auto_create_status: "completed", content_generated: true, credentials_stored: true, missing_fields: ["video_introduction"], optimization_score: 88 },
    { platform: "therapyden", platform_name: "TherapyDen", exists: true, is_claimed: true, completeness_score: 72, review_count: 8, average_rating: 4.7, auto_create_status: "completed", content_generated: true, credentials_stored: true, missing_fields: ["sliding_scale", "specialties_detail"], optimization_score: 72 },
    { platform: "healthgrades", platform_name: "Healthgrades", exists: true, is_claimed: false, completeness_score: 61, review_count: 19, average_rating: 4.6, auto_create_status: "needs_manual", content_generated: true, credentials_stored: false, missing_fields: ["office_photo", "insurance_list", "languages"], optimization_score: 61 },
    { platform: "zocdoc", platform_name: "Zocdoc", exists: true, is_claimed: true, completeness_score: 84, review_count: 67, average_rating: 4.9, auto_create_status: "completed", content_generated: true, credentials_stored: true, missing_fields: ["video_visit_toggle"], optimization_score: 84 },
    { platform: "vitals", platform_name: "Vitals", exists: false, is_claimed: false, completeness_score: 0, review_count: 0, average_rating: null, auto_create_status: "not_started", content_generated: false, credentials_stored: false, missing_fields: ["bio", "photo", "credentials", "specialties"], optimization_score: 0 },
    { platform: "yelp", platform_name: "Yelp", exists: true, is_claimed: false, completeness_score: 45, review_count: 23, average_rating: 4.5, auto_create_status: "pending", content_generated: true, credentials_stored: false, missing_fields: ["business_description", "photos", "special_hours"], optimization_score: 45 },
    { platform: "webmd", platform_name: "WebMD / Medscape", exists: false, is_claimed: false, completeness_score: 0, review_count: 0, average_rating: null, auto_create_status: "not_started", content_generated: false, credentials_stored: false, missing_fields: ["credentials", "bio", "photo", "specialties"], optimization_score: 0 },
    { platform: "samhsa", platform_name: "SAMHSA Locator", exists: false, is_claimed: false, completeness_score: 0, review_count: 0, average_rating: null, auto_create_status: "not_started", content_generated: false, credentials_stored: false, missing_fields: ["license", "services", "location", "modalities"], optimization_score: 0 },
  ],
};

// ─── Main Page ───────────────────────────────────────────────────
export default function ProfilesPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const [scorecard, setScorecard] = useState<Scorecard | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) return;
    profilesApi.scorecard(companyId)
      .then((r) => setScorecard(r.data))
      .catch(() => setScorecard(null))
      .finally(() => setLoading(false));
  }, [companyId]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const loadDemoData = () => {
    setScorecard(DEMO_SCORECARD);
    setLoading(false);
    showToast("Demo data loaded — explore all 9 platform profiles!");
  };

  const handleGenerateContent = async (platform: string) => {
    setGenerating(platform);
    try {
      await profilesApi.generateContent(companyId, platform);
      showToast(`Content generation started for ${platform === "all" ? "all platforms" : platform} — check Approval Queue.`);
      const r = await profilesApi.scorecard(companyId).catch(() => ({ data: null }));
      if (r.data) setScorecard(r.data);
    } catch {
      showToast("Generation failed — ensure ANTHROPIC_API_KEY is set.");
    } finally {
      setGenerating(null);
    }
  };

  const handleAutoCreate = async (platform: string) => {
    setGenerating(platform);
    try {
      await profilesApi.autoCreate(companyId, platform);
      showToast(`Auto-create started for ${platform} — Playwright automation running.`);
      setTimeout(async () => {
        const r = await profilesApi.scorecard(companyId).catch(() => ({ data: null }));
        if (r.data) setScorecard(r.data);
      }, 3000);
    } catch (e: any) {
      showToast(e?.response?.data?.detail || "Auto-create failed — generate content first.");
    } finally {
      setGenerating(null);
    }
  };

  const platforms = scorecard?.platforms || [];
  const overallScore = scorecard?.overall_score || 0;
  const contentGenerated = platforms.filter((p) => p.content_generated).length;
  const autoCreated = platforms.filter((p) => p.auto_create_status === "completed").length;

  // Reviews aggregation
  const ratedPlatforms = platforms.filter((p) => p.average_rating && p.average_rating > 0);
  const avgRating = ratedPlatforms.length > 0
    ? ratedPlatforms.reduce((sum, p) => sum + (p.average_rating || 0), 0) / ratedPlatforms.length
    : 0;
  const totalReviews = platforms.reduce((sum, p) => sum + (p.review_count || 0), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-96">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 text-pink-400 animate-spin mx-auto mb-3" />
          <p className="text-slate-500 text-sm">Loading Directory Profiles…</p>
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

      <ProgressBanner
        active={!!generating}
        label={generating === "all" ? "Generating Content for All Platforms" : `Generating Profile Content`}
        estimatedSeconds={18}
        steps={["Crafting bio copy…", "Writing service descriptions…", "Formatting for platform…", "Saving to Approval Queue…"]}
        color="blue"
      />

      {/* Hero Header */}
      <div className="gradient-profiles px-8 py-7 text-white">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Globe className="w-5 h-5 opacity-80" />
              <span className="text-sm font-medium opacity-80 uppercase tracking-wide">Module 5</span>
            </div>
            <h1 className="text-2xl font-bold">Directory Profiles</h1>
            <p className="text-pink-100 text-sm mt-1">9 healthcare directories · Playwright automation · Review tracking</p>
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
              onClick={() => handleGenerateContent("all")}
              disabled={!!generating}
              className="flex items-center gap-2 px-4 py-2 bg-white/15 hover:bg-white/25 text-white rounded-xl text-sm font-medium transition-all border border-white/20 disabled:opacity-50"
            >
              {generating === "all" ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              Generate All Content
            </button>
          </div>
        </div>
      </div>

      <div className="p-8 space-y-8">
        {/* Stats Row */}
        <div className="grid grid-cols-4 gap-4">
          <StatCard
            icon={<Globe className="w-5 h-5 text-pink-600" />}
            label="Overall Score"
            value={`${overallScore}%`}
            sub="Directory presence"
            accent="bg-pink-50"
          />
          <StatCard
            icon={<CheckCircle className="w-5 h-5 text-emerald-600" />}
            label="Claimed Profiles"
            value={`${scorecard?.claimed_profiles || 0} / 9`}
            sub="Verified listings"
            accent="bg-emerald-50"
          />
          <StatCard
            icon={<Zap className="w-5 h-5 text-violet-600" />}
            label="Content Generated"
            value={`${contentGenerated} / 9`}
            sub="Ready for review"
            accent="bg-violet-50"
          />
          <StatCard
            icon={<Star className="w-5 h-5 text-amber-600" />}
            label="Avg Rating"
            value={avgRating > 0 ? avgRating.toFixed(1) : "—"}
            sub={totalReviews > 0 ? `${totalReviews} total reviews` : "No reviews yet"}
            accent="bg-amber-50"
          />
        </div>

        {/* Overall Score Bar */}
        {scorecard && (
          <div className="card p-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold text-slate-900">Directory Presence Score</h2>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold text-slate-900">{overallScore}</span>
                <span className="text-slate-400 text-sm">/100</span>
              </div>
            </div>
            <div className="progress-track h-2.5">
              <div
                className="progress-fill"
                style={{
                  width: `${overallScore}%`,
                  background: overallScore >= 70 ? "#10b981" : overallScore >= 40 ? "#f59e0b" : "#ef4444",
                  height: "10px",
                }}
              />
            </div>
            <div className="flex justify-between mt-2">
              <span className="text-xs text-slate-400">0 — No presence</span>
              <span className="text-xs text-slate-400">100 — Fully optimized</span>
            </div>
          </div>
        )}

        {/* Platform Grid */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-slate-900">Platform Profiles</h2>
            <div className="flex gap-3 text-xs text-slate-500">
              <span className="flex items-center gap-1.5"><CheckCircle className="w-3 h-3 text-emerald-500" /> Claimed</span>
              <span className="flex items-center gap-1.5"><Globe className="w-3 h-3 text-blue-500" /> Auto-Create Available</span>
            </div>
          </div>
          {platforms.length === 0 ? (
            /* Empty state with default platform list */
            <div className="grid grid-cols-3 gap-4">
              {[
                { platform: "google_business_profile", platform_name: "Google Business Profile", exists: false, is_claimed: false, completeness_score: 0, review_count: 0, average_rating: null, auto_create_status: "not_started", content_generated: false, credentials_stored: false, missing_fields: ["name", "address", "phone", "description"], optimization_score: 0 },
                { platform: "psychology_today", platform_name: "Psychology Today", exists: false, is_claimed: false, completeness_score: 0, review_count: 0, average_rating: null, auto_create_status: "not_started", content_generated: false, credentials_stored: false, missing_fields: ["bio", "specialties", "photo"], optimization_score: 0 },
                { platform: "therapyden", platform_name: "TherapyDen", exists: false, is_claimed: false, completeness_score: 0, review_count: 0, average_rating: null, auto_create_status: "not_started", content_generated: false, credentials_stored: false, missing_fields: ["bio", "photo"], optimization_score: 0 },
                { platform: "healthgrades", platform_name: "Healthgrades", exists: false, is_claimed: false, completeness_score: 0, review_count: 0, average_rating: null, auto_create_status: "not_started", content_generated: false, credentials_stored: false, missing_fields: ["credentials", "bio"], optimization_score: 0 },
                { platform: "zocdoc", platform_name: "Zocdoc", exists: false, is_claimed: false, completeness_score: 0, review_count: 0, average_rating: null, auto_create_status: "not_started", content_generated: false, credentials_stored: false, missing_fields: ["schedule", "insurance"], optimization_score: 0 },
                { platform: "vitals", platform_name: "Vitals", exists: false, is_claimed: false, completeness_score: 0, review_count: 0, average_rating: null, auto_create_status: "not_started", content_generated: false, credentials_stored: false, missing_fields: ["bio", "photo"], optimization_score: 0 },
                { platform: "yelp", platform_name: "Yelp", exists: false, is_claimed: false, completeness_score: 0, review_count: 0, average_rating: null, auto_create_status: "not_started", content_generated: false, credentials_stored: false, missing_fields: ["description", "hours"], optimization_score: 0 },
                { platform: "webmd", platform_name: "WebMD / Medscape", exists: false, is_claimed: false, completeness_score: 0, review_count: 0, average_rating: null, auto_create_status: "not_started", content_generated: false, credentials_stored: false, missing_fields: ["credentials", "bio"], optimization_score: 0 },
                { platform: "samhsa", platform_name: "SAMHSA Locator", exists: false, is_claimed: false, completeness_score: 0, review_count: 0, average_rating: null, auto_create_status: "not_started", content_generated: false, credentials_stored: false, missing_fields: ["license", "services"], optimization_score: 0 },
              ].map((p) => (
                <PlatformProfileCard
                  key={p.platform}
                  platform={p as PlatformCard}
                  onGenerateContent={handleGenerateContent}
                  onAutoCreate={handleAutoCreate}
                  generating={generating}
                />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {platforms.map((p) => (
                <PlatformProfileCard
                  key={p.platform}
                  platform={p}
                  onGenerateContent={handleGenerateContent}
                  onAutoCreate={handleAutoCreate}
                  generating={generating}
                />
              ))}
            </div>
          )}
        </div>

        {/* How Auto-Create Works */}
        <div className="card p-6">
          <h2 className="text-base font-semibold text-slate-900 mb-4">How Playwright Auto-Create Works</h2>
          <div className="grid grid-cols-5 gap-2">
            {[
              { step: "1", title: "Generate Content", desc: "LLM creates platform-optimized bios, descriptions, and service listings", color: "bg-pink-50 border-pink-200 text-pink-800" },
              { step: "2", title: "Human Approval", desc: "Review all content in the Approval Queue before anything is submitted", color: "bg-violet-50 border-violet-200 text-violet-800" },
              { step: "3", title: "Add Credentials", desc: "Store platform login credentials securely in Settings", color: "bg-blue-50 border-blue-200 text-blue-800" },
              { step: "4", title: "Playwright Login", desc: "Headless browser authenticates and navigates to profile creation", color: "bg-indigo-50 border-indigo-200 text-indigo-800" },
              { step: "5", title: "Auto-Submit", desc: "Form fields auto-filled and submitted with screenshots for verification", color: "bg-emerald-50 border-emerald-200 text-emerald-800" },
            ].map((s) => (
              <div key={s.step} className={cn("rounded-xl border p-4", s.color)}>
                <div className="text-xl font-black mb-2">{s.step}</div>
                <p className="text-sm font-semibold mb-1">{s.title}</p>
                <p className="text-xs opacity-80 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
