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

const STATUS_FILTERS = ["all", "pending_review", "approved", "published", "rejected"];

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
                      {item.body_preview && (
                        <p className="text-xs text-gray-400 mt-0.5">{truncate(item.body_preview, 80)}</p>
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
                      <td colSpan={6} className="px-5 py-4 bg-gray-50">
                        <pre className="text-xs text-gray-700 whitespace-pre-wrap max-h-64 overflow-y-auto">
                          {item.body_preview || JSON.stringify(item.metadata, null, 2)}
                        </pre>
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
