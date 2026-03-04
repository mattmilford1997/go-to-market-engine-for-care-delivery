"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { approvalApi } from "@/lib/api";
import { cn, moduleLabel } from "@/lib/utils";

const MODULE_TABS = ["all", "paid_ads", "referral", "content", "seo", "profiles"];

function ApprovalPreview({ data, itemType }: { data: Record<string, any>; itemType: string }) {
  if (!data || Object.keys(data).length === 0) {
    return <p className="text-xs text-gray-400 italic">No preview available.</p>;
  }

  const contentType: string = data.content_type || itemType || "";

  // Voicemail script — prioritise body_preview
  if (contentType === "voicemail_script" || itemType === "voicemail_script") {
    return (
      <div className="space-y-2">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Voicemail Script</p>
        {data.body_preview ? (
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap bg-gray-50 rounded-lg p-3 border border-gray-100">
            {data.body_preview}
          </p>
        ) : (
          <p className="text-xs text-gray-400 italic">Script content not yet generated.</p>
        )}
        {data.duration_seconds && (
          <p className="text-xs text-gray-400">Estimated duration: ~{data.duration_seconds}s</p>
        )}
        {data.variant && <p className="text-xs text-gray-400">Variant {data.variant}</p>}
      </div>
    );
  }

  // Social posts
  if (contentType.startsWith("social_")) {
    const platform = contentType.replace("social_", "");
    const hashtags: string[] = data.hashtags || [];
    return (
      <div className="space-y-2">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{platform} post</p>
        {data.body_preview && (
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{data.body_preview}</p>
        )}
        {hashtags.length > 0 && (
          <p className="text-xs text-blue-500">{hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" ")}</p>
        )}
        {data.image_concept && (
          <div className="flex items-start gap-2 bg-purple-50 border border-purple-100 rounded-lg px-3 py-2">
            <span className="text-purple-400 text-base shrink-0">🖼</span>
            <div>
              <p className="text-xs font-semibold text-purple-600 mb-0.5">Image Concept</p>
              <p className="text-xs text-purple-700 italic">{data.image_concept}</p>
            </div>
          </div>
        )}
        {(data.best_days?.length > 0 || data.best_times?.length > 0) && (
          <p className="text-xs text-gray-400">
            Best time: {(data.best_days || []).join(", ")} @ {(data.best_times || []).join(", ")}
          </p>
        )}
      </div>
    );
  }

  // Blog posts
  if (contentType === "blog_post" || itemType === "blog_post") {
    const secondary: string[] = data.secondary_keywords || [];
    const isPlanned = data.planned === true && !data.body_preview;
    return (
      <div className="space-y-2">
        {isPlanned ? (
          <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
            <span>⏳</span>
            <span>
              This blog post is planned but not yet written. Use the Content module to generate the full article for keyword: <strong>{data.target_keyword || "—"}</strong>
            </span>
          </div>
        ) : (
          data.body_preview && (
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{data.body_preview}</p>
          )
        )}
        {data.theme && <p className="text-xs text-gray-500">Theme: {data.theme}</p>}
        {secondary.length > 0 && (
          <div className="flex gap-1 flex-wrap">
            {secondary.slice(0, 5).map((kw) => (
              <span key={kw} className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">{kw}</span>
            ))}
          </div>
        )}
        {data.word_count && <p className="text-xs text-gray-400">Target: {data.word_count} words</p>}
      </div>
    );
  }

  // Fax sheet
  if (contentType === "fax_sheet" || itemType === "fax_sheet") {
    return (
      <div className="space-y-2">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Referral Fax Sheet</p>
        {data.body_preview && (
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{data.body_preview}</p>
        )}
        {data.services_highlighted && (
          <div>
            <p className="text-xs text-gray-400 mb-1">Services highlighted:</p>
            <div className="flex gap-1 flex-wrap">
              {(data.services_highlighted as string[]).map((s) => (
                <span key={s} className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-full">{s}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Ads — headline + body text
  if (data.headline_1 || data.primary_text || data.description) {
    return (
      <div className="space-y-1.5">
        {data.headline_1 && <p className="text-sm font-semibold text-gray-800">{data.headline_1}</p>}
        {data.headline_2 && <p className="text-sm font-semibold text-gray-700">{data.headline_2}</p>}
        {data.description && <p className="text-xs text-gray-500">{data.description}</p>}
        {data.primary_text && (
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{data.primary_text}</p>
        )}
        {data.keyword_cluster && <p className="text-xs text-gray-400">Cluster: {data.keyword_cluster}</p>}
        {data.cta && <p className="text-xs text-green-600 font-medium">CTA: {data.cta}</p>}
      </div>
    );
  }

  // Profiles — description_medium
  if (data.description_medium || data.platform) {
    return (
      <div className="space-y-1.5">
        {data.platform && (
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{data.platform}</p>
        )}
        {data.description_medium && (
          <p className="text-sm text-gray-700 leading-relaxed">{data.description_medium}</p>
        )}
      </div>
    );
  }

  // Generic: body_preview or key-value list
  if (data.body_preview) {
    return <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{data.body_preview}</p>;
  }

  return (
    <dl className="space-y-1">
      {Object.entries(data)
        .filter(([k]) => k !== "content_type")
        .map(([k, v]) => (
          <div key={k} className="flex gap-2 text-xs">
            <dt className="text-gray-400 shrink-0 capitalize">{k.replace(/_/g, " ")}:</dt>
            <dd className="text-gray-700">{typeof v === "string" ? v : JSON.stringify(v)}</dd>
          </div>
        ))}
    </dl>
  );
}

export default function ApprovalQueuePage() {
  const { companyId } = useParams<{ companyId: string }>();
  const [items, setItems] = useState<any[]>([]);
  const [activeModule, setActiveModule] = useState("all");
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  async function load() {
    setLoading(true);
    const mod = activeModule === "all" ? undefined : activeModule;
    const res = await approvalApi.queue(companyId, mod);
    setItems(res.data);
    setLoading(false);
  }

  useEffect(() => { load(); }, [companyId, activeModule]);

  async function handleAction(itemId: string, action: string, notes?: string) {
    await approvalApi.action(companyId, itemId, action, notes);
    setItems((prev) => prev.filter((i) => i.id !== itemId));
  }

  async function handleBulkApprove() {
    const ids = selectedIds.size > 0 ? Array.from(selectedIds) : undefined;
    const payload = ids
      ? { item_ids: ids }
      : { module: activeModule !== "all" ? activeModule : undefined };
    await approvalApi.bulkApprove(companyId, payload as any);
    load();
    setSelectedIds(new Set());
  }

  async function handleDeleteAll() {
    if (!confirm("Delete all pending items in this view? This cannot be undone.")) return;
    setDeleting(true);
    const ids = selectedIds.size > 0 ? Array.from(selectedIds) : undefined;
    const payload = ids
      ? { item_ids: ids }
      : { module: activeModule !== "all" ? activeModule : undefined };
    await approvalApi.bulkDelete(companyId, payload as any);
    load();
    setSelectedIds(new Set());
    setDeleting(false);
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map((i) => i.id)));
    }
  }

  return (
    <div className="p-6 max-w-5xl">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Approval Queue</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Review all AI-generated content before it goes live.
            Nothing is deployed without your approval.
          </p>
        </div>
        {items.length > 0 && (
          <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
            <button
              onClick={handleBulkApprove}
              className="px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
            >
              {selectedIds.size > 0 ? `Approve Selected (${selectedIds.size})` : "Approve All"}
            </button>
            <button
              onClick={handleDeleteAll}
              disabled={deleting}
              className="px-3 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              {deleting ? "Deleting…" : selectedIds.size > 0 ? `Delete Selected (${selectedIds.size})` : "Delete All"}
            </button>
          </div>
        )}
      </div>

      {/* Module tabs */}
      <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
        {MODULE_TABS.map((mod) => (
          <button
            key={mod}
            onClick={() => { setActiveModule(mod); setSelectedIds(new Set()); }}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors",
              activeModule === mod
                ? "bg-blue-600 text-white"
                : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
            )}
          >
            {mod === "all" ? "All Modules" : moduleLabel(mod)}
          </button>
        ))}
      </div>

      {/* Select all row */}
      {items.length > 0 && (
        <div className="flex items-center gap-2 mb-3 px-1">
          <input
            type="checkbox"
            checked={selectedIds.size === items.length && items.length > 0}
            onChange={toggleSelectAll}
            className="rounded"
          />
          <span className="text-xs text-gray-500">
            {selectedIds.size > 0 ? `${selectedIds.size} selected` : `Select all ${items.length} items`}
          </span>
        </div>
      )}

      {/* Items */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading…</div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <p className="text-2xl mb-2">✓</p>
          <p className="font-medium text-gray-700">Queue is clear</p>
          <p className="text-gray-500 text-sm mt-1">
            No items pending approval
            {activeModule !== "all" ? ` for ${moduleLabel(activeModule)}` : ""}.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <ApprovalCard
              key={item.id}
              item={item}
              selected={selectedIds.has(item.id)}
              onToggle={() => toggleSelect(item.id)}
              onApprove={() => handleAction(item.id, "approve")}
              onReject={(notes) => handleAction(item.id, "reject", notes)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ApprovalCard({
  item,
  selected,
  onToggle,
  onApprove,
  onReject,
}: {
  item: any;
  selected: boolean;
  onToggle: () => void;
  onApprove: () => void;
  onReject: (notes: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectNotes, setRejectNotes] = useState("");

  const moduleColors: Record<string, string> = {
    paid_ads: "bg-orange-100 text-orange-700",
    referral: "bg-green-100 text-green-700",
    content: "bg-purple-100 text-purple-700",
    seo: "bg-blue-100 text-blue-700",
    profiles: "bg-pink-100 text-pink-700",
  };

  // Determine a meaningful subtitle for the card
  const subtitle =
    item.preview_data?.body_preview ||
    item.preview_data?.description_medium ||
    item.preview_data?.headline_1 ||
    (item.preview_data?.planned ? `Planned blog post · ${item.preview_data?.theme || ""}` : null) ||
    null;

  return (
    <div
      className={cn(
        "bg-white rounded-xl border transition-colors",
        selected ? "border-blue-300 shadow-sm" : "border-gray-200"
      )}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            className="mt-1 rounded"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span
                className={cn(
                  "text-xs px-2 py-0.5 rounded-full font-medium",
                  moduleColors[item.module] || "bg-gray-100 text-gray-600"
                )}
              >
                {moduleLabel(item.module)}
              </span>
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                {item.item_type?.replace(/_/g, " ")}
              </span>
              {item.preview_data?.planned && (
                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                  Planned
                </span>
              )}
            </div>
            <p className="font-medium text-gray-800 text-sm">{item.title}</p>
            {subtitle && (
              <p className="text-gray-500 text-xs mt-1 line-clamp-2">{subtitle}</p>
            )}
          </div>
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2 shrink-0">
            <button
              onClick={() => setExpanded((e) => !e)}
              className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1.5 border border-gray-200 rounded-lg whitespace-nowrap"
            >
              {expanded ? "Less" : "Preview"}
            </button>
            <button
              onClick={() => { setRejecting(true); setExpanded(false); }}
              className="text-xs text-red-600 hover:text-red-700 px-2 py-1.5 border border-red-200 rounded-lg"
            >
              Reject
            </button>
            <button
              onClick={onApprove}
              className="text-xs text-white bg-green-600 hover:bg-green-700 px-3 py-1.5 rounded-lg font-medium"
            >
              Approve
            </button>
          </div>
        </div>

        {/* Expanded preview */}
        {expanded && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <ApprovalPreview data={item.preview_data} itemType={item.item_type} />
          </div>
        )}

        {/* Reject form */}
        {rejecting && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <textarea
              value={rejectNotes}
              onChange={(e) => setRejectNotes(e.target.value)}
              placeholder="Reason for rejection (optional)…"
              className="w-full text-sm border border-gray-200 rounded-lg p-2 resize-none h-16 focus:outline-none focus:border-blue-400"
            />
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => { onReject(rejectNotes); setRejecting(false); }}
                className="text-xs text-white bg-red-600 px-3 py-1.5 rounded-lg hover:bg-red-700"
              >
                Confirm Reject
              </button>
              <button
                onClick={() => setRejecting(false)}
                className="text-xs text-gray-600 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
