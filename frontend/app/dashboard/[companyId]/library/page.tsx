"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { contentApi } from "@/lib/api";
import { cn, statusColor, truncate } from "@/lib/utils";

const CONTENT_TYPES = [
  "all",
  "blog_post",
  "social_facebook",
  "social_instagram",
  "social_linkedin",
  "ad_copy_google",
  "ad_copy_meta",
  "fax_sheet",
  "voicemail_script",
  "postcard",
  "email_sequence",
  "directory_bio",
];

const STATUS_FILTERS = ["all", "pending_review", "approved", "published", "rejected", "draft"];

// ─── Rich Preview Components ────────────────────────────────────────────────

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">{label}</p>
      {children}
    </div>
  );
}

function Tag({ children, color = "blue" }: { children: React.ReactNode; color?: string }) {
  const colors: Record<string, string> = {
    blue: "bg-blue-50 text-blue-700 border-blue-100",
    purple: "bg-purple-50 text-purple-700 border-purple-100",
    green: "bg-green-50 text-green-700 border-green-100",
    amber: "bg-amber-50 text-amber-700 border-amber-100",
    gray: "bg-gray-100 text-gray-600 border-gray-200",
  };
  return (
    <span className={cn("inline-block px-2 py-0.5 rounded-full text-xs border mr-1 mb-1", colors[color] || colors.blue)}>
      {children}
    </span>
  );
}

function BlogPostPreview({ item }: { item: any }) {
  const extra = item.extra_data || {};
  if (!item.body) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-100 px-4 py-3 rounded-lg">
          <span>⏳</span>
          <span>This blog post is <strong>planned but not yet generated</strong>. Go to the Content module and click "Generate" to produce the full article.</span>
        </div>
        {extra.theme && <Section label="Theme"><p className="text-sm text-gray-700">{extra.theme}</p></Section>}
        {item.target_keyword && <Section label="Target Keyword"><Tag>{item.target_keyword}</Tag></Section>}
        {extra.word_count && <Section label="Target Length"><p className="text-sm text-gray-600">{extra.word_count} words</p></Section>}
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {item.meta_description && (
        <Section label="Meta Description">
          <p className="text-sm text-gray-600 italic border-l-4 border-blue-200 pl-3">{item.meta_description}</p>
        </Section>
      )}
      {item.target_keyword && (
        <Section label="Target Keyword"><Tag>{item.target_keyword}</Tag></Section>
      )}
      <Section label="Article Content">
        <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed whitespace-pre-wrap bg-gray-50 rounded-lg p-4 border border-gray-100 max-h-96 overflow-y-auto">
          {item.body}
        </div>
      </Section>
      {extra.word_count && <p className="text-xs text-gray-400">{extra.word_count} words</p>}
    </div>
  );
}

function SocialPostPreview({ item }: { item: any }) {
  const extra = item.extra_data || {};
  const platform = (item.content_type || "").replace("social_", "");
  const hashtags: string[] = extra.hashtags || [];
  return (
    <div className="space-y-4">
      <Section label={`${platform.charAt(0).toUpperCase() + platform.slice(1)} Post`}>
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{item.body}</p>
          {hashtags.length > 0 && (
            <p className="text-xs text-blue-500 mt-3">{hashtags.map((h: string) => `#${h.replace(/^#/, "")}`).join(" ")}</p>
          )}
        </div>
      </Section>
      {extra.image_concept && (
        <Section label="Image Concept">
          <div className="flex items-start gap-3 bg-purple-50 border border-purple-100 rounded-xl px-4 py-3">
            <span className="text-2xl shrink-0">🖼️</span>
            <p className="text-sm text-purple-800 leading-relaxed">{extra.image_concept}</p>
          </div>
        </Section>
      )}
      {(extra.best_days?.length > 0 || extra.best_times?.length > 0) && (
        <Section label="Best Posting Times">
          <p className="text-sm text-gray-600">
            {(extra.best_days || []).join(", ")} @ {(extra.best_times || []).join(", ")}
          </p>
        </Section>
      )}
      {extra.engagement_hook && (
        <Section label="Engagement Hook">
          <p className="text-sm text-gray-600 italic">{extra.engagement_hook}</p>
        </Section>
      )}
    </div>
  );
}

function GoogleAdPreview({ item }: { item: any }) {
  const extra = item.extra_data || {};

  // Keyword clusters
  if (extra.clusters) {
    return (
      <div className="space-y-4">
        <Section label={`${extra.clusters.length} Keyword Clusters`}>
          <div className="space-y-3 max-h-[28rem] overflow-y-auto pr-1">
            {extra.clusters.map((cluster: any, i: number) => (
              <div key={i} className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-semibold text-sm text-gray-800">{cluster.cluster_name}</span>
                  <Tag color="blue">{cluster.match_type}</Tag>
                  <Tag color="green">{cluster.intent}</Tag>
                </div>
                <div className="flex flex-wrap gap-1 mb-2">
                  {(cluster.keywords || []).map((kw: string, j: number) => (
                    <Tag key={j} color="gray">{kw}</Tag>
                  ))}
                </div>
                {cluster.negative_keywords?.length > 0 && (
                  <p className="text-xs text-red-500">
                    Negatives: {cluster.negative_keywords.slice(0, 5).join(", ")}
                    {cluster.negative_keywords.length > 5 ? ` +${cluster.negative_keywords.length - 5} more` : ""}
                  </p>
                )}
              </div>
            ))}
          </div>
        </Section>
      </div>
    );
  }

  // RSA ad
  const headlines: string[] = extra.headlines || [];
  const descriptions: string[] = extra.descriptions || [];
  return (
    <div className="space-y-4">
      {/* Live preview */}
      <Section label="Ad Preview">
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          <p className="text-xs text-green-700 mb-1">Ad · {extra.final_url || "novamindmentalhealth.com"}{extra.path_1 ? ` / ${extra.path_1}` : ""}{extra.path_2 ? ` / ${extra.path_2}` : ""}</p>
          <p className="text-base font-semibold text-blue-700 leading-snug">
            {headlines.slice(0, 3).join(" | ")}
          </p>
          <p className="text-sm text-gray-600 mt-1">{descriptions.slice(0, 2).join(" ")}</p>
        </div>
      </Section>
      {headlines.length > 0 && (
        <Section label={`Headlines (${headlines.length})`}>
          <div className="space-y-1">
            {headlines.map((h: string, i: number) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <span className="text-gray-300 text-xs shrink-0 mt-0.5">{i + 1}.</span>
                <span className="text-gray-700">{h}</span>
              </div>
            ))}
          </div>
        </Section>
      )}
      {descriptions.length > 0 && (
        <Section label={`Descriptions (${descriptions.length})`}>
          <div className="space-y-1">
            {descriptions.map((d: string, i: number) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <span className="text-gray-300 text-xs shrink-0 mt-0.5">{i + 1}.</span>
                <span className="text-gray-700">{d}</span>
              </div>
            ))}
          </div>
        </Section>
      )}
      {extra.extensions && (
        <Section label="Ad Extensions">
          <div className="space-y-1">
            {(extra.extensions.sitelinks || []).map((sl: any, i: number) => (
              <p key={i} className="text-xs text-gray-600">🔗 <strong>{sl.text}</strong>{sl.description ? ` — ${sl.description}` : ""}</p>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function MetaAdPreview({ item }: { item: any }) {
  const extra = item.extra_data || {};
  const variants = extra.placement_variants || {};
  return (
    <div className="space-y-4">
      {/* Main ad preview */}
      <Section label="Ad Preview">
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm max-w-sm">
          {extra.image_concept && (
            <div className="bg-purple-50 border border-purple-100 rounded-lg px-3 py-2 mb-3 flex items-start gap-2">
              <span className="text-lg shrink-0">🖼️</span>
              <p className="text-xs text-purple-700 italic">{extra.image_concept}</p>
            </div>
          )}
          <p className="text-sm text-gray-800 leading-relaxed mb-2">{extra.primary_text || item.body}</p>
          <div className="border-t border-gray-100 pt-2 mt-2">
            <p className="text-xs text-gray-400">novamindmentalhealth.com</p>
            <p className="text-sm font-semibold text-gray-800">{extra.headline}</p>
            {extra.description && <p className="text-xs text-gray-500">{extra.description}</p>}
          </div>
          {extra.cta && (
            <button className="mt-3 w-full bg-blue-600 text-white text-xs font-semibold py-1.5 rounded-lg">
              {extra.cta.replace(/_/g, " ")}
            </button>
          )}
        </div>
      </Section>
      {/* Placement variants */}
      {Object.keys(variants).length > 0 && (
        <Section label="Placement Variants">
          <div className="space-y-2">
            {Object.entries(variants).map(([placement, v]: [string, any]) => (
              <div key={placement} className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-1">{placement}</p>
                {v.primary_text && <p className="text-xs text-gray-700">{v.primary_text}</p>}
                {v.headline && <p className="text-xs font-medium text-gray-800 mt-1">{v.headline}</p>}
              </div>
            ))}
          </div>
        </Section>
      )}
      {extra.audience_targeting && (
        <Section label="Audience Targeting">
          <div className="flex flex-wrap gap-1">
            {(extra.audience_targeting.interests || []).map((i: string, idx: number) => (
              <Tag key={idx} color="blue">{i}</Tag>
            ))}
            {(extra.audience_targeting.behaviors || []).map((b: string, idx: number) => (
              <Tag key={idx} color="purple">{b}</Tag>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function VoicemailPreview({ item }: { item: any }) {
  const extra = item.extra_data || {};
  return (
    <div className="space-y-4">
      {extra.target_specialty && (
        <Section label="Target Specialty"><Tag color="blue">{extra.target_specialty}</Tag></Section>
      )}
      <Section label="Script">
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 font-mono text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
          {item.body || extra.body_preview || "No script content available."}
        </div>
      </Section>
      {extra.duration_seconds && (
        <p className="text-xs text-gray-400">⏱ Estimated duration: ~{extra.duration_seconds}s</p>
      )}
    </div>
  );
}

function FaxSheetPreview({ item }: { item: any }) {
  const extra = item.extra_data || {};
  return (
    <div className="space-y-4">
      {extra.target_specialty && (
        <Section label="Target Specialty"><Tag color="blue">{extra.target_specialty}</Tag></Section>
      )}
      {extra.headline && (
        <Section label="Headline">
          <p className="text-lg font-bold text-gray-800">{extra.headline}</p>
        </Section>
      )}
      {extra.tagline && (
        <Section label="Tagline">
          <p className="text-sm text-gray-600 italic">{extra.tagline}</p>
        </Section>
      )}
      {item.body && (
        <Section label="Full Content">
          <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap max-h-80 overflow-y-auto">
            {item.body}
          </div>
        </Section>
      )}
      {extra.why_refer_points?.length > 0 && (
        <Section label="Why Refer Points">
          <ul className="space-y-1">
            {extra.why_refer_points.map((p: string, i: number) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                <span className="text-green-500 shrink-0">✓</span>{p}
              </li>
            ))}
          </ul>
        </Section>
      )}
      {extra.footer_cta && (
        <Section label="Call to Action">
          <p className="text-sm font-semibold text-blue-700">{extra.footer_cta}</p>
        </Section>
      )}
    </div>
  );
}

function EmailSequencePreview({ item }: { item: any }) {
  const extra = item.extra_data || {};
  const emails: any[] = extra.emails || [];
  const [openIdx, setOpenIdx] = useState<number | null>(0);
  return (
    <div className="space-y-4">
      {extra.target_specialty && (
        <Section label="Target Specialty"><Tag color="blue">{extra.target_specialty}</Tag></Section>
      )}
      <Section label={`${emails.length > 0 ? emails.length : ""} Emails in Sequence`}>
        {emails.length > 0 ? (
          <div className="space-y-2">
            {emails.map((email: any, i: number) => (
              <div key={i} className="border border-gray-200 rounded-xl overflow-hidden">
                <button
                  onClick={() => setOpenIdx(openIdx === i ? null : i)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 text-left"
                >
                  <div>
                    <span className="text-xs text-gray-400 mr-2">Email {i + 1}</span>
                    <span className="text-sm font-medium text-gray-800">{email.subject || email.subject_line || `Email ${i + 1}`}</span>
                  </div>
                  <span className="text-gray-400 text-xs">{openIdx === i ? "▲" : "▼"}</span>
                </button>
                {openIdx === i && (
                  <div className="px-4 py-3 bg-white border-t border-gray-100">
                    {email.subject && <p className="text-xs text-gray-400 mb-2">Subject: <strong>{email.subject}</strong></p>}
                    <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto">
                      {email.body || email.content || email.preview || "No content"}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap max-h-80 overflow-y-auto">
            {item.body || "No content available."}
          </div>
        )}
      </Section>
    </div>
  );
}

function PostcardPreview({ item }: { item: any }) {
  const extra = item.extra_data || {};
  return (
    <div className="space-y-4">
      <Section label="Postcard Preview">
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 rounded-2xl p-6 max-w-md shadow-sm">
          {extra.headline && <p className="text-xl font-bold text-gray-900 mb-2">{extra.headline}</p>}
          {extra.subheadline && <p className="text-sm text-gray-600 mb-3">{extra.subheadline}</p>}
          {item.body && <p className="text-sm text-gray-700 leading-relaxed">{item.body}</p>}
          {extra.cta && (
            <div className="mt-4 inline-block bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-lg">
              {extra.cta}
            </div>
          )}
        </div>
      </Section>
      {extra.back_copy && (
        <Section label="Back Copy">
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{extra.back_copy}</p>
        </Section>
      )}
    </div>
  );
}

function DirectoryBioPreview({ item }: { item: any }) {
  const extra = item.extra_data || {};
  return (
    <div className="space-y-4">
      {extra.platform && (
        <Section label="Platform"><Tag color="blue">{extra.platform}</Tag></Section>
      )}
      <Section label="Bio">
        <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
          {item.body || "No bio content."}
        </div>
      </Section>
      {extra.specialties?.length > 0 && (
        <Section label="Specialties">
          <div className="flex flex-wrap gap-1">
            {extra.specialties.map((s: string, i: number) => <Tag key={i} color="green">{s}</Tag>)}
          </div>
        </Section>
      )}
    </div>
  );
}

function ContentPreviewModal({ item, onClose }: { item: any; onClose: () => void }) {
  const ct: string = item.content_type || "";
  const typeLabel = ct.replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase());

  const renderContent = () => {
    if (ct === "blog_post") return <BlogPostPreview item={item} />;
    if (ct.startsWith("social_")) return <SocialPostPreview item={item} />;
    if (ct === "ad_copy_google") return <GoogleAdPreview item={item} />;
    if (ct === "ad_copy_meta") return <MetaAdPreview item={item} />;
    if (ct === "voicemail_script") return <VoicemailPreview item={item} />;
    if (ct === "fax_sheet") return <FaxSheetPreview item={item} />;
    if (ct === "email_sequence") return <EmailSequencePreview item={item} />;
    if (ct === "postcard") return <PostcardPreview item={item} />;
    if (ct === "directory_bio") return <DirectoryBioPreview item={item} />;
    // Generic fallback
    return (
      <div className="space-y-3">
        {item.body && (
          <Section label="Content">
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap bg-gray-50 rounded-xl p-4 border border-gray-100">{item.body}</p>
          </Section>
        )}
        {Object.keys(item.extra_data || {}).length > 0 && (
          <Section label="Details">
            <dl className="space-y-1">
              {Object.entries(item.extra_data || {}).map(([k, v]) => (
                <div key={k} className="flex gap-2 text-xs">
                  <dt className="text-gray-400 shrink-0 capitalize w-32">{k.replace(/_/g, " ")}:</dt>
                  <dd className="text-gray-700">{typeof v === "string" ? v : JSON.stringify(v)}</dd>
                </div>
              ))}
            </dl>
          </Section>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Slide-over panel */}
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-xl bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100 shrink-0">
          <div className="flex-1 min-w-0 pr-4">
            <div className="flex items-center gap-2 mb-1">
              <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", statusColor(item.status))}>
                {item.status?.replace(/_/g, " ")}
              </span>
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{typeLabel}</span>
            </div>
            <h2 className="text-base font-semibold text-gray-900 leading-snug">{item.title}</h2>
            {item.target_keyword && (
              <p className="text-xs text-gray-400 mt-0.5">Keyword: {item.target_keyword}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="shrink-0 text-gray-400 hover:text-gray-600 text-xl leading-none p-1"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {renderContent()}
        </div>
        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 shrink-0 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            Close
          </button>
          <button
            onClick={() => {
              const text = item.body || JSON.stringify(item.extra_data || {}, null, 2);
              navigator.clipboard.writeText(text).then(() => alert("Copied to clipboard!"));
            }}
            className="flex-1 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
          >
            Copy Content
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function LibraryPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<any | null>(null);

  async function load() {
    setLoading(true);
    const params: Record<string, string> = { limit: "200" };
    if (typeFilter !== "all") params.content_type = typeFilter;
    if (statusFilter !== "all") params.status = statusFilter;
    try {
      const res = await contentApi.items(companyId, params);
      setItems(res.data.items || []);
      setTotal(res.data.total || 0);
    } catch {
      setItems([]);
      setTotal(0);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, [companyId, typeFilter, statusFilter]);

  const typeLabel = (t: string) =>
    t === "all" ? "All" : t.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());

  return (
    <div className="p-6 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Materials Library</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          {total} item{total !== 1 ? "s" : ""} · All generated and approved marketing assets
        </p>
      </div>

      {/* Filters */}
      <div className="space-y-2 mb-5">
        <div className="flex gap-1 overflow-x-auto pb-1">
          {CONTENT_TYPES.map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs whitespace-nowrap transition-colors shrink-0",
                typeFilter === t
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
              )}
            >
              {typeLabel(t)}
            </button>
          ))}
        </div>
        <div className="flex gap-1 flex-wrap">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs capitalize whitespace-nowrap transition-colors",
                statusFilter === s
                  ? "bg-gray-800 text-white"
                  : "bg-white text-gray-500 border border-gray-200 hover:bg-gray-50"
              )}
            >
              {s === "all" ? "All Statuses" : s.replace(/_/g, " ")}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading…</div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-gray-400">No items match your filters.</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">Title</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase hidden md:table-cell">Keyword</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase hidden md:table-cell">Created</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {items.map((item) => (
                <tr
                  key={item.id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => setSelectedItem(item)}
                >
                  <td className="px-5 py-3">
                    <p className="font-medium text-gray-800">{truncate(item.title || "", 60)}</p>
                    {(item.body || item.extra_data?.theme || item.extra_data?.primary_text) && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        {truncate(item.body || item.extra_data?.primary_text || item.extra_data?.theme || "", 80)}
                      </p>
                    )}
                  </td>
                  <td className="px-5 py-3 text-gray-500 text-xs whitespace-nowrap">
                    {typeLabel(item.content_type)}
                  </td>
                  <td className="px-5 py-3">
                    <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap", statusColor(item.status))}>
                      {item.status?.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-400 text-xs hidden md:table-cell">{item.target_keyword || "—"}</td>
                  <td className="px-5 py-3 text-gray-400 text-xs hidden md:table-cell">
                    {item.created_at ? new Date(item.created_at).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-5 py-3" onClick={(e) => { e.stopPropagation(); setSelectedItem(item); }}>
                    <button className="text-xs text-blue-600 hover:underline font-medium whitespace-nowrap">
                      View →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Preview modal */}
      {selectedItem && (
        <ContentPreviewModal
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
        />
      )}
    </div>
  );
}
