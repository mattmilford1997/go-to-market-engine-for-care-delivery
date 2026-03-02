"use client";
import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import { referralApi } from "@/lib/api";
import { cn, statusColor } from "@/lib/utils";
import ProgressBanner from "@/components/ProgressBanner";

const STATUS_OPTS = ["all", "new", "contacted", "engaged", "referring", "inactive", "suppressed"];

export default function LeadsPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const [leads, setLeads] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 4000); };

  async function load(status?: string) {
    setLoading(true);
    const params: Record<string, string> = { limit: "100" };
    if (status && status !== "all") params.status = status;
    const res = await referralApi.leads(companyId, params);
    setLeads(res.data.leads);
    setTotal(res.data.total);
    setLoading(false);
  }

  useEffect(() => { load(statusFilter); }, [companyId, statusFilter]);

  async function handleGenerateLeads() {
    setGenerating(true);
    try {
      await referralApi.generateLeads(companyId);
      // Wait for NPPES background task before refreshing
      await new Promise((r) => setTimeout(r, 28000));
      await load(statusFilter);
    } catch (err: any) {
      const msg = err?.isNetworkError
        ? "Cannot reach backend API — set BACKEND_URL in Railway to your backend service URL."
        : "Lead generation failed — check your API configuration.";
      showToast(msg);
    } finally {
      setGenerating(false);
    }
  }

  async function handleCsvUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    await referralApi.uploadLeadsCsv(companyId, file);
    load(statusFilter);
  }

  return (
    <div className="p-6 max-w-6xl">
      {toast && (
        <div className="fixed top-4 right-4 z-50 fade-in bg-slate-900 text-white text-sm px-4 py-3 rounded-xl shadow-lg max-w-sm">
          {toast}
        </div>
      )}
      <ProgressBanner
        active={generating}
        label="Searching NPPES Registry for Provider Leads"
        estimatedSeconds={25}
        steps={[
          "Querying NPPES national provider registry…",
          "Filtering by specialty and location…",
          "Deduplicating records…",
          "Importing provider contacts…",
        ]}
        color="blue"
      />
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Referral Leads</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {total} provider{total !== 1 ? "s" : ""} in pipeline ·
            Auto-generated via NPPES + CSV upload
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => fileRef.current?.click()}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Upload CSV
          </button>
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleCsvUpload} />
          <button
            onClick={handleGenerateLeads}
            disabled={generating}
            className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-60"
          >
            {generating ? "Generating…" : "Auto-Generate from NPPES"}
          </button>
        </div>
      </div>

      {/* Status filter */}
      <div className="flex gap-1 mb-5 overflow-x-auto">
        {STATUS_OPTS.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-sm capitalize whitespace-nowrap transition-colors",
              statusFilter === s
                ? "bg-blue-600 text-white"
                : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
            )}
          >
            {s === "all" ? "All" : s}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading…</div>
      ) : leads.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-dashed border-gray-200">
          <p className="text-2xl mb-2">👥</p>
          <p className="font-medium text-gray-700">No leads yet</p>
          <p className="text-gray-500 text-sm mt-1 mb-4">
            Auto-generate a lead list from NPPES based on your locations and specialty.
          </p>
          <button
            onClick={handleGenerateLeads}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            Generate Leads from NPPES
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Provider</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Specialty</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Location</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Contact</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {leads.map((lead) => (
                <tr key={lead.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium text-gray-800">
                        {lead.name || `${lead.first_name} ${lead.last_name}`}
                        {lead.credentials ? `, ${lead.credentials}` : ""}
                      </p>
                      <p className="text-xs text-gray-400">{lead.practice_name}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{lead.specialty}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {lead.city}{lead.state ? `, ${lead.state}` : ""}
                  </td>
                  <td className="px-4 py-3">
                    <div className="space-y-0.5 text-xs text-gray-500">
                      {lead.fax && <div>Fax: {lead.fax}</div>}
                      {lead.email && <div className="text-blue-600">{lead.email}</div>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium capitalize", statusColor(lead.status))}>
                      {lead.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{lead.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
