"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { companiesApi, llmSettingsApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import { CheckCircle2, RefreshCw, Zap, Bot, MapPin } from "lucide-react";

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA",
  "HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
];

const PROVIDER_META: Record<string, { color: string; bg: string; border: string; logo: string }> = {
  anthropic: { color: "text-orange-700",  bg: "bg-orange-50",   border: "border-orange-300",  logo: "🟠" },
  openai:    { color: "text-emerald-700", bg: "bg-emerald-50",  border: "border-emerald-300", logo: "🟢" },
  gemini:    { color: "text-blue-700",    bg: "bg-blue-50",     border: "border-blue-300",    logo: "🔵" },
};

export default function SettingsPage() {
  const { companyId } = useParams<{ companyId: string }>();

  // Credentials
  const [slots, setSlots] = useState<any[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  // NPPES target states
  const [targetStates, setTargetStates] = useState<string[]>([]);
  const [statesSaved, setStatesSaved] = useState(false);

  // LLM Provider
  const [providers, setProviders] = useState<any[]>([]);
  const [activeProvider, setActiveProvider] = useState("anthropic");
  const [providerApiKeys, setProviderApiKeys] = useState<Record<string, string>>({});
  const [switching, setSwitching] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [switchSuccess, setSwitchSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) return;
    Promise.all([
      companiesApi.credentialStatus(companyId).catch(() => ({ data: { credentials: [] } })),
      llmSettingsApi.providers().catch(() => ({ data: { providers: [], active_provider: "anthropic" } })),
      companiesApi.get(companyId).catch(() => ({ data: {} })),
    ]).then(([cr, pr, co]) => {
      setSlots(cr.data.credentials || []);
      setProviders(pr.data.providers || []);
      setActiveProvider(pr.data.active_provider || "anthropic");
      setTargetStates(co.data.referral_target_states || []);
    }).finally(() => setLoading(false));
  }, [companyId]);

  async function handleSave(key: string) {
    if (!values[key]) return;
    await companiesApi.updateCredentials(companyId, { [key]: values[key] });
    setSaved((p) => ({ ...p, [key]: true }));
    setSlots((prev) => prev.map((s) => (s.key === key ? { ...s, connected: true } : s)));
    setTimeout(() => setSaved((p) => ({ ...p, [key]: false })), 2000);
  }

  function toggleState(abbr: string) {
    setTargetStates((prev) =>
      prev.includes(abbr) ? prev.filter((s) => s !== abbr) : [...prev, abbr]
    );
  }

  async function handleSaveStates() {
    await companiesApi.update(companyId, { referral_target_states: targetStates });
    setStatesSaved(true);
    setTimeout(() => setStatesSaved(false), 2000);
  }

  async function handleSwitchProvider(providerId: string) {
    setSwitching(true);
    setTestResult(null);
    try {
      const apiKey = providerApiKeys[providerId] || undefined;
      await llmSettingsApi.setProvider(providerId, apiKey);
      setActiveProvider(providerId);
      // Refresh provider list
      const pr = await llmSettingsApi.providers();
      setProviders(pr.data.providers || []);
      setSwitchSuccess(providerId);
      setTimeout(() => setSwitchSuccess(null), 3000);
    } catch {
      // Still update local state optimistically
      setActiveProvider(providerId);
    } finally {
      setSwitching(false);
    }
  }

  async function handleTestProvider() {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await llmSettingsApi.test();
      setTestResult({ ok: true, msg: `Response: "${r.data.response}"` });
    } catch (e: any) {
      const msg = e?.response?.data?.detail || "Connection failed";
      setTestResult({ ok: false, msg });
    } finally {
      setTesting(false);
    }
  }

  const grouped: Record<string, any[]> = {};
  slots.forEach((slot) => {
    const mod = slot.module;
    if (!grouped[mod]) grouped[mod] = [];
    grouped[mod].push(slot);
  });

  const activeProviderInfo = providers.find((p) => p.id === activeProvider);
  const meta = PROVIDER_META[activeProvider] || PROVIDER_META.anthropic;

  return (
    <div className="p-6 max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings & Credentials</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          Configure your AI engine and API credentials for each module.
        </p>
      </div>

      {/* ── AI Provider Selector ───────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <Bot className="w-4 h-4 text-violet-500" />
          <h2 className="font-semibold text-gray-800">AI Engine</h2>
          <span className="ml-auto text-xs text-gray-400">Powers all AI generation across every module</span>
        </div>

        <div className="p-5 space-y-4">
          {/* Active provider banner */}
          {activeProviderInfo && (
            <div className={cn("flex items-center gap-3 px-4 py-3 rounded-xl border", meta.bg, meta.border)}>
              <span className="text-lg">{meta.logo}</span>
              <div className="flex-1">
                <p className={cn("text-sm font-semibold", meta.color)}>
                  {activeProviderInfo.label} — Active
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Bulk: <code className="bg-white/60 px-1 rounded">{activeProviderInfo.bulk_model}</code>
                  {" · "}
                  Strategy: <code className="bg-white/60 px-1 rounded">{activeProviderInfo.strategy_model}</code>
                </p>
              </div>
              <button
                onClick={handleTestProvider}
                disabled={testing}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors bg-white hover:bg-gray-50"
                style={{ borderColor: "currentColor" }}
              >
                {testing ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                Test connection
              </button>
            </div>
          )}

          {/* Test result */}
          {testResult && (
            <div className={cn(
              "flex items-start gap-2 px-4 py-3 rounded-xl text-sm",
              testResult.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"
            )}>
              <CheckCircle2 className={cn("w-4 h-4 mt-0.5 shrink-0", testResult.ok ? "text-emerald-500" : "text-red-500")} />
              <span>{testResult.ok ? "Connected successfully. " : "Connection failed. "}{testResult.msg}</span>
            </div>
          )}

          {/* Provider cards */}
          <div className="grid grid-cols-3 gap-3">
            {providers.map((p) => {
              const pm = PROVIDER_META[p.id] || PROVIDER_META.anthropic;
              const isActive = p.id === activeProvider;
              return (
                <div
                  key={p.id}
                  className={cn(
                    "rounded-xl border-2 p-4 transition-all cursor-pointer",
                    isActive ? `${pm.bg} ${pm.border}` : "border-gray-100 hover:border-gray-200 bg-white"
                  )}
                  onClick={() => !isActive && handleSwitchProvider(p.id)}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-base">{pm.logo}</span>
                      <span className={cn("text-sm font-semibold", isActive ? pm.color : "text-gray-800")}>
                        {p.label}
                      </span>
                    </div>
                    {isActive ? (
                      <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", pm.bg, pm.color)}>
                        Active
                      </span>
                    ) : p.is_default ? (
                      <span className="text-xs text-gray-400">Default</span>
                    ) : null}
                  </div>
                  <p className="text-xs text-gray-500 mb-3">{p.description}</p>

                  {/* API key input for non-active providers */}
                  {!isActive && (
                    <input
                      type="password"
                      placeholder={`${p.label.split(" ")[0]} API key…`}
                      value={providerApiKeys[p.id] || ""}
                      onChange={(e) => setProviderApiKeys((prev) => ({ ...prev, [p.id]: e.target.value }))}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-blue-400 mb-2"
                    />
                  )}

                  {!isActive && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleSwitchProvider(p.id); }}
                      disabled={switching}
                      className="w-full text-xs py-1.5 rounded-lg font-medium bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-50 transition-colors"
                    >
                      {switching ? "Switching…" : "Use this provider"}
                    </button>
                  )}

                  {switchSuccess === p.id && (
                    <p className={cn("text-xs text-center mt-1 font-medium", pm.color)}>
                      ✓ Switched successfully
                    </p>
                  )}

                  <div className="mt-2 flex items-center gap-1">
                    <span className={cn("w-1.5 h-1.5 rounded-full", p.key_configured ? "bg-emerald-400" : "bg-red-300")} />
                    <span className="text-xs text-gray-400">
                      {p.key_configured ? "API key configured" : "No API key set"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <p className="text-xs text-gray-400">
            API keys are stored in memory only and reset on server restart.
            For persistent config, set <code>OPENAI_API_KEY</code> or <code>GOOGLE_AI_API_KEY</code> in your <code>.env</code>.
          </p>
        </div>
      </div>

      {/* ── API Credentials ────────────────────────────────────────────────── */}
      <div>
        <div className="flex gap-4 mb-4 text-sm">
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
          <div className="space-y-4">
            {Object.entries(grouped).map(([module, moduleSlots]) => (
              <div key={module} className="bg-white rounded-xl border border-gray-200">
                <div className="px-5 py-3 border-b border-gray-100">
                  <h2 className="font-semibold text-gray-800">{module}</h2>
                </div>
                <div className="divide-y divide-gray-50">
                  {moduleSlots.map((slot) => (
                    <div key={slot.key} className="px-5 py-4 flex items-center gap-4">
                      <div className="flex items-center gap-2 w-64 shrink-0">
                        <span className={cn("w-2.5 h-2.5 rounded-full shrink-0", slot.connected ? "bg-green-500" : "bg-red-400")} />
                        <span className="text-sm font-medium text-gray-700">{slot.label}</span>
                      </div>
                      <div className="flex-1 flex gap-2">
                        <input
                          type={slot.type === "secret" ? "password" : "text"}
                          placeholder={slot.connected ? "••••••••••••••••" : `Enter ${slot.label}…`}
                          value={values[slot.key] || ""}
                          onChange={(e) => setValues((p) => ({ ...p, [slot.key]: e.target.value }))}
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
                      <span className="text-xs text-gray-400 w-20 text-right shrink-0">{slot.type}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── NPPES Lead Search States ───────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <MapPin className="w-4 h-4 text-blue-500" />
          <h2 className="font-semibold text-gray-800">NPPES Lead Search</h2>
          <span className="ml-auto text-xs text-gray-400">States to search for referral leads</span>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-sm text-gray-500">
            Select the states where you want to find referral leads via NPPES. If none are selected, leads will be sourced from your company&apos;s configured locations.
          </p>
          <div className="flex flex-wrap gap-2">
            {US_STATES.map((abbr) => {
              const selected = targetStates.includes(abbr);
              return (
                <button
                  key={abbr}
                  onClick={() => toggleState(abbr)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors",
                    selected
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-gray-600 border-gray-200 hover:border-blue-300"
                  )}
                >
                  {abbr}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleSaveStates}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                statesSaved
                  ? "bg-green-100 text-green-700"
                  : "bg-blue-600 text-white hover:bg-blue-700"
              )}
            >
              {statesSaved ? "Saved ✓" : `Save${targetStates.length ? ` (${targetStates.length} selected)` : ""}`}
            </button>
            {targetStates.length > 0 && (
              <button
                onClick={() => setTargetStates([])}
                className="text-sm text-gray-400 hover:text-gray-600"
              >
                Clear all
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── File uploads ───────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200">
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
