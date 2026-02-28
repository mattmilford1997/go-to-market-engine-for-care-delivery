"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { companiesApi } from "@/lib/api";
import { cn } from "@/lib/utils";

export default function SettingsPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const [slots, setSlots] = useState<any[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) return;
    companiesApi.credentialStatus(companyId).then((r) => {
      setSlots(r.data.credentials);
      setLoading(false);
    });
  }, [companyId]);

  async function handleSave(key: string) {
    if (!values[key]) return;
    await companiesApi.updateCredentials(companyId, { [key]: values[key] });
    setSaved((p) => ({ ...p, [key]: true }));
    setSlots((prev) =>
      prev.map((s) => (s.key === key ? { ...s, connected: true } : s))
    );
    setTimeout(() => setSaved((p) => ({ ...p, [key]: false })), 2000);
  }

  const grouped: Record<string, any[]> = {};
  slots.forEach((slot) => {
    const mod = slot.module;
    if (!grouped[mod]) grouped[mod] = [];
    grouped[mod].push(slot);
  });

  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Settings & Credentials</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          Upload API keys, OAuth tokens, and credentials for each module.
          Modules gracefully degrade when credentials are missing — they generate
          content but skip deployment until credentials are provided.
        </p>
      </div>

      {/* Legend */}
      <div className="flex gap-4 mb-6 text-sm">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
          <span className="text-gray-600">Connected</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
          <span className="text-gray-600">Missing</span>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading…</div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([module, moduleSlots]) => (
            <div key={module} className="bg-white rounded-xl border border-gray-200">
              <div className="px-5 py-3 border-b border-gray-100">
                <h2 className="font-semibold text-gray-800">{module}</h2>
              </div>
              <div className="divide-y divide-gray-50">
                {moduleSlots.map((slot) => (
                  <div key={slot.key} className="px-5 py-4 flex items-center gap-4">
                    <div className="flex items-center gap-2 w-64 shrink-0">
                      <span
                        className={cn(
                          "w-2.5 h-2.5 rounded-full shrink-0",
                          slot.connected ? "bg-green-500" : "bg-red-400"
                        )}
                      />
                      <span className="text-sm font-medium text-gray-700">
                        {slot.label}
                      </span>
                    </div>
                    <div className="flex-1 flex gap-2">
                      <input
                        type={slot.type === "secret" ? "password" : "text"}
                        placeholder={
                          slot.connected ? "••••••••••••••••" : `Enter ${slot.label}…`
                        }
                        value={values[slot.key] || ""}
                        onChange={(e) =>
                          setValues((p) => ({ ...p, [slot.key]: e.target.value }))
                        }
                        className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-400"
                      />
                      <button
                        onClick={() => handleSave(slot.key)}
                        disabled={!values[slot.key]}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap",
                          saved[slot.key]
                            ? "bg-green-100 text-green-700"
                            : "bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
                        )}
                      >
                        {saved[slot.key] ? "Saved ✓" : "Save"}
                      </button>
                    </div>
                    <span className="text-xs text-gray-400 w-20 text-right shrink-0">
                      {slot.type}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* File uploads */}
      <div className="mt-6 bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-3 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">File Uploads</h2>
        </div>
        <div className="p-5 grid grid-cols-2 gap-4">
          {[
            { label: "Referral Lead List (CSV)", desc: "Upload bulk lead list with NPI, name, fax, email", accept: ".csv" },
            { label: "Brand Assets (logos, fonts)", desc: "Upload brand files for content generation", accept: ".zip,.png,.jpg,.svg,.otf,.ttf" },
            { label: "Provider Headshots", desc: "Upload photos for directories and social content", accept: ".jpg,.jpeg,.png" },
            { label: "Directory Credentials CSV", desc: "Bulk upload login credentials for directory platforms", accept: ".csv" },
          ].map((upload) => (
            <div key={upload.label} className="border border-dashed border-gray-200 rounded-xl p-4 text-center hover:border-blue-300 transition-colors cursor-pointer">
              <p className="text-sm font-medium text-gray-700 mb-1">{upload.label}</p>
              <p className="text-xs text-gray-400 mb-3">{upload.desc}</p>
              <label className="cursor-pointer">
                <span className="text-xs text-blue-600 border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors">
                  Choose File
                </span>
                <input type="file" accept={upload.accept} className="hidden" />
              </label>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
