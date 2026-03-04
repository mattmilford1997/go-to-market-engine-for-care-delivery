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

function ContentPreview({ item }: { item: any }) {
  const ct: string = item.content_type || "";
  const body: string = item.body || "";
  const extra: Record<string, any> = item.extra_data || {};

  // Blog post
  if (ct === "blog_post") {
    if (body) {
      return (
        <div className="space-y-2">
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{body}</p>
          {extra.word_count && <p className="text-xs text-gray-400">{extra.word_count} words · {extra.theme || ""}</p>}
          {item.target_keyword && (
            <span className="inline-block px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-full">
              Keyword: {item.target_keyword}
            </span>
          )}
          {item.meta_description && (
            <p className="text-xs text-gray-500 italic border-l-2 border-gray-200 pl-2">{item.meta_description}</p>
          )}
        </div>
      );
    }
    // Planned but not yet generated
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
          <span>⏳</span>
          <span>This blog post is planned but not yet generated. Click "Generate Blog Post" in the Content module to produce the full article.</span>
        </div>
        {extra.theme && <p className="text-xs text-gray-500">Theme: {extra.theme}</p>}
        {extra.word_count && <p className="text-xs text-gray-400">Target length: {extra.word_count} words</p>}
        {item.target_keyword && <p className="text-xs text-gray-400">Keyword: {item.target_keyword}</p>}
      </div>
    );
  }

  // Social posts
  if (ct.startsWith("social_")) {
    const platform = ct.replace("social_", "");
    const hashtags: string[] = extra.hashtags || [];
    return (
      <div className="space-y-2">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{platform} post</p>
        {body && <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{body}</p>}
        {hashtags.length > 0 && (
          <p className="text-xs text-blue-500">{hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" ")}</p>
        )}
        {extra.image_concept && (
          <div className="flex items-start gap-2 bg-purple-50 border border-purple-100 rounded-lg px-3 py-2">
            <span className="text-purple-400 text-sm shrink-0">🖼</span>
            <p className="text-xs text-purple-700 italic">{extra.image_concept}</p>
          </div>
        )}
        {(extra.best_days?.length > 0 || extra.best_times?.length > 0) && (
          <p className="text-xs text-gray-400">
            Best time to post: {(extra.best_days || []).join(", ")} @ {(extra.best_times || []).join(", ")}
          </p>
        )}
      </div>
    );
  }

  // Voicemail script
  if (ct === "voicemail_script") {
    return (
      <div className="space-y-2">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Voicemail Script</p>
        {body ? (
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap bg-gray-50 rounded-lg p-3 border border-gray-100">{body}</p>
        ) : (
          <p className="text-xs text-gray-400 italic">No script content yet.</p>
        )}
      </div>
    );
  }

  // Fax sheet / postcard / email sequence
  if (ct === "fax_sheet" || ct === "postcard" || ct === "email_sequence") {
    return (
      <div className="space-y-2">
        {body && <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{body}</p>}
        {Object.keys(extra).length > 0 && (
          <dl className="space-y-1 mt-2">
            {Object.entries(extra).slice(0, 8).map(([k, v]) => (
              <div key={k} className="flex gap-2 text-xs">
                <dt className="text-gray-400 shrink-0 capitalize">{k.replace(/_/g, " ")}:</dt>
                <dd className="text-gray-700">{typeof v === "string" ? v : JSON.stringify(v)}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    );
  }

  // Ad copy
  if (ct.startsWith("ad_copy_")) {
    return (
      <div className="space-y-1.5">
        {extra.headline_1 && <p className="text-sm font-semibold text-gray-800">{extra.headline_1}</p>}
        {extra.description && <p className="text-xs text-gray-500">{extra.description}</p>}
        {extra.primary_text && <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{extra.primary_text}</p>}
        {body && !extra.headline_1 && <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{body}</p>}
        {extra.keyword_cluster && <p className="text-xs text-gray-400">Cluster: {extra.keyword_cluster}</p>}
      </div>
    );
  }

  // Directory bio
  if (ct === "directory_bio") {
    return (
      <div className="space-y-1.5">
        {extra.platform && <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{extra.platform}</p>}
        {body && <p className="text-sm text-gray-700 leading-relaxed">{body}</p>}
      </div>
    );
  }

  // Generic fallback — show body if available, then extra_data
  if (body) {
    return <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{body}</p>;
  }
  if (Object.keys(extra).length > 0) {
    return (
      <dl className="space-y-1">
        {Object.entries(extra).map(([k, v]) => (
          <div key={k} className="flex gap-2 text-xs">
            <dt className="text-gray-400 shrink-0 capitalize">{k.replace(/_/g, " ")}:</dt>
            <dd className="text-gray-700">{typeof v === "string" ? v : JSON.stringify(v)}</dd>
          </div>
        ))}
      </dl>
    );
  }

  return <p className="text-xs text-gray-400 italic">No preview available for this item.</p>;
}

export default function LibraryPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const params: Record<string, string> = { limit: "100" };
    if (typeFilter !== "all") params.content_type = typeFilter;
    if (statusFilter !== "all") params.status = statusFilter;
    const res = await contentApi.items(companyId, params);
    setItems(res.data.items);
    setTotal(res.data.total);
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
        <div className="flex gap-1">
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
        <div className="text-center py-12 text-gray-400">
          No items match your filters.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">Title</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">Keyword</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">Created</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {items.map((item) => (
                <>
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3">
                      <p className="font-medium text-gray-800">{truncate(item.title || "", 60)}</p>
                      {(item.body || item.extra_data?.theme) && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          {truncate(item.body || item.extra_data?.theme || "", 80)}
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-3 text-gray-500 text-xs">
                      {typeLabel(item.content_type)}
                    </td>
                    <td className="px-5 py-3">
                      <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", statusColor(item.status))}>
                        {item.status?.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-400 text-xs">{item.target_keyword}</td>
                    <td className="px-5 py-3 text-gray-400 text-xs">
                      {item.created_at ? new Date(item.created_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-5 py-3">
                      <button
                        onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        {expandedId === item.id ? "Close" : "View"}
                      </button>
                    </td>
                  </tr>
                  {expandedId === item.id && (
                    <tr key={`${item.id}-expanded`}>
                      <td colSpan={6} className="px-5 py-4 bg-gray-50 border-t border-gray-100">
                        <ContentPreview item={item} />
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
