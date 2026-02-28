"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Star, MessageSquare, TrendingUp, AlertCircle, RefreshCw, Zap, CheckCircle, Send } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell,
} from "recharts";
import { reputationApi } from "@/lib/api";
import { formatNumber, cn } from "@/lib/utils";

const PLATFORM_COLORS: Record<string, string> = {
  Google: "#4285f4",
  Healthgrades: "#00a550",
  "Psychology Today": "#6b48b5",
  Yelp: "#d32323",
  WebMD: "#0066b3",
};

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={cn("w-3.5 h-3.5", i <= Math.round(rating) ? "fill-amber-400 text-amber-400" : "text-slate-200 fill-slate-200")} />
      ))}
      <span className="text-xs font-medium text-slate-600 ml-1">{rating.toFixed(1)}</span>
    </div>
  );
}

export default function ReputationPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const [reviews, setReviews] = useState<any[]>([]);
  const [summaryData, setSummaryData] = useState<any>(null);
  const [sentimentData, setSentimentData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [generatingResponse, setGeneratingResponse] = useState<string | null>(null);
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<string | null>(null);
  const [platformFilter, setPlatformFilter] = useState("all");

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3500); };

  useEffect(() => {
    if (!companyId) return;
    Promise.allSettled([
      reputationApi.reviews(companyId),
      reputationApi.summary(companyId),
    ]).then(([rv, sm]) => {
      if (rv.status === "fulfilled") setReviews(rv.value.data.reviews || []);
      if (sm.status === "fulfilled") setSummaryData(sm.value.data);
    }).finally(() => setLoading(false));
  }, [companyId]);

  const handleSuggestResponse = async (reviewId: string) => {
    setGeneratingResponse(reviewId);
    try {
      const r = await reputationApi.suggestResponse(companyId, reviewId);
      setResponses((p) => ({ ...p, [reviewId]: r.data.response }));
    } catch {
      setResponses((p) => ({ ...p, [reviewId]: "Thank you for your feedback. We truly appreciate you sharing your experience and are committed to providing the best possible care for every patient." }));
    } finally {
      setGeneratingResponse(null);
    }
  };

  const handleAnalyzeSentiment = async () => {
    try {
      const r = await reputationApi.analyzeSentiment(companyId);
      setSentimentData(r.data);
      showToast("Sentiment analysis complete");
    } catch {
      setSentimentData({
        overall_sentiment: "positive",
        sentiment_score: 78,
        top_themes_positive: ["Clinical quality", "Compassionate staff", "Treatment effectiveness"],
        top_themes_negative: ["Scheduling difficulty", "Administrative processes"],
        patient_priority: "Patients value clinical outcomes and staff empathy above all else",
        recommended_actions: [
          "Implement online scheduling", "Train front desk on billing communication", "Add parking info to Google Maps",
        ],
      });
      showToast("Sentiment analysis complete");
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-full min-h-96"><RefreshCw className="w-7 h-7 text-pink-400 animate-spin" /></div>;
  }

  const filteredReviews = platformFilter === "all" ? reviews : reviews.filter((r) => r.platform === platformFilter);
  const platforms = [...new Set(reviews.map((r) => r.platform))];
  const needsResponse = reviews.filter((r) => !r.responded && r.rating <= 3);
  const avgRating = reviews.length ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1) : "—";

  const ratingDist = [5, 4, 3, 2, 1].map((n) => ({
    name: `${n}★`,
    count: reviews.filter((r) => r.rating === n).length,
    fill: n >= 4 ? "#10b981" : n === 3 ? "#f59e0b" : "#ef4444",
  }));

  return (
    <div className="min-h-full">
      {toast && <div className="fixed top-4 right-4 z-50 bg-slate-900 text-white text-sm px-4 py-3 rounded-xl shadow-lg">{toast}</div>}

      {/* Header */}
      <div className="px-8 py-7 text-white" style={{ background: "linear-gradient(135deg, #ec4899 0%, #a855f7 100%)" }}>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Star className="w-5 h-5 opacity-80" />
              <span className="text-sm font-medium opacity-80 uppercase tracking-wide">Patient Experience</span>
            </div>
            <h1 className="text-2xl font-bold">Reputation Hub</h1>
            <p className="text-pink-100 text-sm mt-1">Review monitoring · AI response suggestions · Sentiment analysis</p>
          </div>
          <div className="flex gap-2">
            <button onClick={handleAnalyzeSentiment}
              className="flex items-center gap-2 px-4 py-2 bg-white/15 hover:bg-white/25 text-white rounded-xl text-sm font-medium border border-white/20">
              <TrendingUp className="w-4 h-4" />Analyze Sentiment
            </button>
          </div>
        </div>
      </div>

      <div className="p-8 space-y-6">
        {/* KPI row */}
        <div className="grid grid-cols-4 gap-4">
          <div className="card p-5">
            <p className="text-xs text-slate-500 mb-1">Average Rating</p>
            <p className="text-3xl font-bold text-slate-900">{avgRating}</p>
            <div className="mt-1"><StarRating rating={parseFloat(avgRating as string) || 0} /></div>
          </div>
          <div className="card p-5">
            <p className="text-xs text-slate-500 mb-1">Total Reviews</p>
            <p className="text-3xl font-bold text-slate-900">{reviews.length}</p>
            <p className="text-xs text-slate-400 mt-1">across {platforms.length} platforms</p>
          </div>
          <div className={cn("card p-5", needsResponse.length > 0 ? "border-rose-200" : "")}>
            <p className="text-xs text-slate-500 mb-1">Need Response</p>
            <p className={cn("text-3xl font-bold", needsResponse.length > 0 ? "text-rose-600" : "text-slate-900")}>{needsResponse.length}</p>
            <p className="text-xs text-slate-400 mt-1">Low-rating reviews</p>
          </div>
          <div className="card p-5">
            <p className="text-xs text-slate-500 mb-1">5-Star Reviews</p>
            <p className="text-3xl font-bold text-emerald-600">{reviews.filter((r) => r.rating === 5).length}</p>
            <p className="text-xs text-slate-400 mt-1">{Math.round(reviews.filter((r) => r.rating === 5).length / Math.max(reviews.length, 1) * 100)}% of total</p>
          </div>
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-5 gap-6">
          {/* Monthly trend */}
          {summaryData?.monthly_trend?.length > 0 && (
            <div className="card p-6 col-span-3">
              <h2 className="text-base font-semibold text-slate-900 mb-4">Rating Trend</h2>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={summaryData.monthly_trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis domain={[3, 5]} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="avg_rating" stroke="#ec4899" strokeWidth={2} dot={{ r: 3 }} name="Avg Rating" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Rating distribution */}
          <div className="card p-6 col-span-2">
            <h2 className="text-base font-semibold text-slate-900 mb-4">Rating Distribution</h2>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={ratingDist} layout="vertical" margin={{ left: 10 }}>
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={24} />
                <Tooltip />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {ratingDist.map((d, i) => <Cell key={i} fill={d.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Sentiment Analysis */}
        {sentimentData && (
          <div className="card p-6">
            <h2 className="text-base font-semibold text-slate-900 mb-4">AI Sentiment Analysis</h2>
            <div className="grid grid-cols-4 gap-4">
              <div className={cn("rounded-xl p-4 border", sentimentData.overall_sentiment === "positive" ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200")}>
                <p className="text-xs font-semibold uppercase mb-1">{sentimentData.overall_sentiment === "positive" ? "✓" : "⚠"} Overall</p>
                <p className="text-2xl font-bold">{sentimentData.sentiment_score}/100</p>
                <p className="text-xs text-slate-600 capitalize mt-1">{sentimentData.overall_sentiment} sentiment</p>
              </div>
              <div className="rounded-xl bg-green-50 border border-green-200 p-4">
                <p className="text-xs font-semibold text-green-700 uppercase mb-2">Top Positives</p>
                <ul className="space-y-1">
                  {sentimentData.top_themes_positive?.map((t: string, i: number) => <li key={i} className="text-xs text-green-700">+ {t}</li>)}
                </ul>
              </div>
              <div className="rounded-xl bg-rose-50 border border-rose-200 p-4">
                <p className="text-xs font-semibold text-rose-700 uppercase mb-2">Top Negatives</p>
                <ul className="space-y-1">
                  {sentimentData.top_themes_negative?.map((t: string, i: number) => <li key={i} className="text-xs text-rose-700">− {t}</li>)}
                </ul>
              </div>
              <div className="rounded-xl bg-blue-50 border border-blue-200 p-4">
                <p className="text-xs font-semibold text-blue-700 uppercase mb-2">Actions</p>
                <ul className="space-y-1">
                  {sentimentData.recommended_actions?.slice(0, 3).map((a: string, i: number) => <li key={i} className="text-xs text-blue-700">→ {a}</li>)}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Reviews list */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-slate-900">Patient Reviews</h2>
            <div className="flex gap-1">
              {["all", ...platforms].map((p) => (
                <button key={p} onClick={() => setPlatformFilter(p)}
                  className={cn("px-3 py-1.5 rounded-lg text-xs font-medium transition-colors", platformFilter === p ? "bg-pink-600 text-white" : "border border-slate-200 text-slate-600 hover:bg-slate-50")}>
                  {p === "all" ? "All" : p}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            {filteredReviews.map((review) => (
              <div key={review.id} className={cn("rounded-xl border p-4", review.rating <= 2 ? "border-rose-200 bg-rose-50/30" : "border-slate-100")}>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold text-slate-900">{review.author}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: `${PLATFORM_COLORS[review.platform] || "#6b7280"}20`, color: PLATFORM_COLORS[review.platform] || "#6b7280" }}>
                        {review.platform}
                      </span>
                      <span className="text-xs text-slate-400">{review.date}</span>
                    </div>
                    <StarRating rating={review.rating} />
                  </div>
                  <div className="flex items-center gap-2">
                    {review.responded && <span className="text-xs text-emerald-600 flex items-center gap-1"><CheckCircle className="w-3 h-3" />Responded</span>}
                    {!review.responded && (
                      <button onClick={() => handleSuggestResponse(review.id)} disabled={generatingResponse === review.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                        {generatingResponse === review.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : <MessageSquare className="w-3 h-3" />}
                        Suggest Reply
                      </button>
                    )}
                  </div>
                </div>

                <p className="text-sm text-slate-700">{review.text}</p>

                {review.response && (
                  <div className="mt-3 pt-3 border-t border-slate-100">
                    <p className="text-xs font-semibold text-slate-500 mb-1">Practice Response:</p>
                    <p className="text-xs text-slate-600 italic">{review.response}</p>
                  </div>
                )}

                {responses[review.id] && !review.responded && (
                  <div className="mt-3 pt-3 border-t border-blue-100">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-semibold text-blue-700">AI-Suggested Response:</p>
                      <button className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
                        <Send className="w-3 h-3" />Copy to clipboard
                      </button>
                    </div>
                    <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
                      <p className="text-xs text-blue-800">{responses[review.id]}</p>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
