"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { companiesApi } from "@/lib/api";
import { formatCurrency, cn } from "@/lib/utils";

const CHANNELS = [
  { key: "google_ads", label: "Google Ads", module: "Module 1", costDriver: "CPC / CPM bids", alertAt: 0.8 },
  { key: "meta_ads", label: "Meta Ads", module: "Module 1", costDriver: "CPC / CPM bids", alertAt: 0.8 },
  { key: "email", label: "Email (Instantly)", module: "Module 2", costDriver: "Subscription + volume", alertAt: 1.0 },
  { key: "fax", label: "E-Fax (OpenFax)", module: "Module 2", costDriver: "Per-page sent", alertAt: 0.8 },
  { key: "voicemail", label: "Voicemail (Slybroadcast)", module: "Module 2", costDriver: "Per-drop sent", alertAt: 0.8 },
  { key: "mail", label: "Snail Mail (Lob)", module: "Module 2", costDriver: "Per piece printed + mailed", alertAt: 0.8 },
  { key: "tts", label: "TTS (ElevenLabs)", module: "Module 2", costDriver: "Characters generated", alertAt: 1.0 },
  { key: "social_boost", label: "Social Boosting", module: "Module 3", costDriver: "Post boost spend", alertAt: 0.8 },
];

// Mock spend-to-date (in production this comes from platform APIs)
const MOCK_SPEND_PCT: Record<string, number> = {
  google_ads: 0.62,
  meta_ads: 0.48,
  email: 0.30,
  fax: 0.71,
  voicemail: 0.55,
  mail: 0.40,
  tts: 0.15,
  social_boost: 0.0,
};

export default function BudgetPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const [company, setCompany] = useState<any>(null);
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    companiesApi.get(companyId).then((r) => setCompany(r.data));
  }, [companyId]);

  async function handleSave(key: string) {
    const val = parseFloat(editing[key]);
    if (isNaN(val)) return;
    setSaving(key);
    await companiesApi.update(companyId, { [`budget_${key}`]: val });
    setCompany((prev: any) => ({ ...prev, budgets: { ...prev.budgets, [key]: val } }));
    setSaving(null);
  }

  if (!company) return <div className="p-6 text-gray-400">Loading…</div>;

  const budgets = company.budgets || {};
  const totalOperating = CHANNELS.reduce((s, c) => s + (budgets[c.key] || 0), 0);
  const adSpend = (budgets.google_ads || 0) + (budgets.meta_ads || 0);
  const grandTotal = totalOperating + adSpend;

  return (
    <div className="p-6 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Budget Tracker</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          Set monthly caps per channel. Alerts fire at 80% spend.
          All budgets are editable — suggested values are pre-filled.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">Total Monthly Operating</p>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalOperating)}</p>
          <p className="text-xs text-gray-400 mt-0.5">All channels excl. ad spend</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">Ad Spend Budget</p>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(adSpend)}</p>
          <p className="text-xs text-gray-400 mt-0.5">Google + Meta combined</p>
        </div>
        <div className="bg-blue-50 rounded-xl border border-blue-200 p-4">
          <p className="text-xs text-blue-600 mb-1">Grand Total Monthly</p>
          <p className="text-2xl font-bold text-blue-700">{formatCurrency(grandTotal)}</p>
          <p className="text-xs text-blue-400 mt-0.5">All channels combined</p>
        </div>
      </div>

      {/* Channel budget table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Channel</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Module</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Cost Driver</th>
              <th className="text-right px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Monthly Cap</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide w-48">Spend Progress</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {CHANNELS.map((ch) => {
              const budget = budgets[ch.key] || 0;
              const spendPct = MOCK_SPEND_PCT[ch.key] || 0;
              const spentAmount = budget * spendPct;
              const isAlert = spendPct >= ch.alertAt;

              return (
                <tr key={ch.key} className={cn(isAlert && "bg-red-50/50")}>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      {isAlert && (
                        <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" title="Alert: near budget cap" />
                      )}
                      <span className={cn("font-medium", isAlert ? "text-red-700" : "text-gray-800")}>
                        {ch.label}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-gray-500">{ch.module}</td>
                  <td className="px-5 py-3 text-gray-400 text-xs">{ch.costDriver}</td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span className="text-gray-400">$</span>
                      <input
                        type="number"
                        defaultValue={budget}
                        className="w-24 text-right border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-blue-400"
                        onChange={(e) =>
                          setEditing((p) => ({ ...p, [ch.key]: e.target.value }))
                        }
                      />
                      {editing[ch.key] && (
                        <button
                          onClick={() => handleSave(ch.key)}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          {saving === ch.key ? "…" : "Save"}
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={cn(
                            "h-2 rounded-full transition-all",
                            spendPct >= 0.8 ? "bg-red-400" : spendPct >= 0.6 ? "bg-yellow-400" : "bg-green-400"
                          )}
                          style={{ width: `${Math.min(spendPct * 100, 100)}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-500 whitespace-nowrap">
                        {formatCurrency(spentAmount)} / {formatCurrency(budget)}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-right">
                    {isAlert && (
                      <span className="text-xs text-red-600 font-medium">⚠ Alert</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50 border-t border-gray-200">
              <td colSpan={3} className="px-5 py-3 font-semibold text-gray-700">Total</td>
              <td className="px-5 py-3 text-right font-bold text-gray-900">{formatCurrency(totalOperating)}</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
