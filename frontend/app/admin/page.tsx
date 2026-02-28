"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { companiesApi } from "@/lib/api";
import { cn, formatCurrency, healthColor } from "@/lib/utils";

export default function AdminPage() {
  const router = useRouter();
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    companiesApi.portfolioOverview()
      .then((r) => setCompanies(r.data))
      .catch(() => companiesApi.list().then((r) => setCompanies(r.data)))
      .finally(() => setLoading(false));
  }, []);

  const totalBudget = companies.reduce((s, c) => s + (c.monthly_budget || 0), 0);
  const activeCampaigns = companies.reduce((s, c) => s + (c.active_campaigns || 0), 0);
  const pendingApprovals = companies.reduce((s, c) => s + (c.pending_approvals || 0), 0);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
            <span className="text-white font-bold text-sm">A</span>
          </div>
          <div>
            <p className="font-semibold text-gray-900">Arche Studios</p>
            <p className="text-xs text-gray-400">Portfolio Overview</p>
          </div>
        </div>
        <button
          onClick={() => router.push("/")}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          + Add Company
        </button>
      </header>

      <main className="px-8 py-6 max-w-7xl">
        {/* Portfolio KPIs */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          {[
            { label: "Portfolio Companies", value: companies.length.toString(), sub: "active" },
            { label: "Total Monthly Budget", value: formatCurrency(totalBudget), sub: "all channels" },
            { label: "Active Campaigns", value: activeCampaigns.toString(), sub: "across all companies" },
            { label: "Pending Approvals", value: pendingApprovals.toString(), sub: "need review", alert: pendingApprovals > 0 },
          ].map((kpi) => (
            <div key={kpi.label} className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-xs text-gray-500 mb-1">{kpi.label}</p>
              <p className={cn("text-3xl font-bold", kpi.alert ? "text-blue-600" : "text-gray-900")}>
                {kpi.value}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">{kpi.sub}</p>
            </div>
          ))}
        </div>

        {/* Company table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-800">Portfolio Companies</h2>
            <p className="text-sm text-gray-500">{companies.length} companies</p>
          </div>

          {loading ? (
            <div className="text-center py-12 text-gray-400">Loading…</div>
          ) : companies.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-xl mb-2">🏥</p>
              <p className="font-medium text-gray-700">No companies yet</p>
              <p className="text-gray-500 text-sm mt-1 mb-4">
                Add your first portfolio company to get started.
              </p>
              <button
                onClick={() => router.push("/")}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
              >
                Add Company
              </button>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Company</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase">Monthly Budget</th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase">Active Campaigns</th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase">Pending Approvals</th>
                  <th className="text-center px-6 py-3 text-xs font-medium text-gray-500 uppercase">Health</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {companies.map((company: any) => (
                  <tr key={company.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {company.is_pilot && (
                          <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full shrink-0">
                            Pilot
                          </span>
                        )}
                        <p className="font-medium text-gray-800">{company.name}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs capitalize text-gray-500">
                        {company.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right text-gray-700">
                      {formatCurrency(company.monthly_budget || 0)}
                    </td>
                    <td className="px-6 py-4 text-right text-gray-700">
                      {company.active_campaigns || 0}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {(company.pending_approvals || 0) > 0 ? (
                        <span className="text-blue-600 font-medium">{company.pending_approvals}</span>
                      ) : (
                        <span className="text-gray-400">0</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-center">
                        <span
                          className={cn(
                            "w-3 h-3 rounded-full",
                            healthColor(company.health || "green")
                          )}
                          title={company.health}
                        />
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => router.push(`/dashboard/${company.id}`)}
                        className="text-blue-600 text-xs hover:underline"
                      >
                        Open Dashboard →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  );
}
