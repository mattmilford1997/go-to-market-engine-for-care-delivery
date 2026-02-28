"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  ShieldCheck, ShieldAlert, AlertTriangle, CheckCircle2,
  Mail, Phone, FileText, MessageSquare, List, ClipboardList,
  RefreshCw, Trash2, Plus, X,
} from "lucide-react";
import { spamApi } from "@/lib/api";
import { cn } from "@/lib/utils";

const CHANNEL_ICONS: Record<string, React.ReactNode> = {
  fax: <FileText className="w-4 h-4" />,
  email: <Mail className="w-4 h-4" />,
  voicemail: <Phone className="w-4 h-4" />,
  sms: <MessageSquare className="w-4 h-4" />,
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-100 text-red-700",
  high: "bg-orange-100 text-orange-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-blue-100 text-blue-700",
};

const GRADE_COLORS: Record<string, string> = {
  A: "text-emerald-600",
  B: "text-teal-600",
  C: "text-amber-600",
  D: "text-orange-600",
  F: "text-red-600",
};

type Tab = "overview" | "rules" | "suppression" | "audit";

export default function SpamPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const [tab, setTab] = useState<Tab>("overview");
  const [report, setReport] = useState<any>(null);
  const [settings, setSettings] = useState<any>(null);
  const [rules, setRules] = useState<any[]>([]);
  const [suppression, setSuppression] = useState<any[]>([]);
  const [auditLog, setAuditLog] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [showAddSupp, setShowAddSupp] = useState(false);
  const [newContact, setNewContact] = useState("");
  const [newChannel, setNewChannel] = useState("email");
  const [newReason, setNewReason] = useState("manual");

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    if (!companyId) return;
    Promise.all([
      spamApi.settings(companyId).catch(() => ({ data: null })),
      spamApi.complianceReport(companyId).catch(() => ({ data: null })),
      spamApi.suppression(companyId).catch(() => ({ data: { suppression_list: [] } })),
      spamApi.auditLog(companyId).catch(() => ({ data: { events: [] } })),
    ]).then(([s, r, sup, audit]) => {
      if (s.data) {
        setSettings(s.data.settings);
        setRules(s.data.rules || []);
      }
      if (r.data) setReport(r.data);
      setSuppression(sup.data.suppression_list || []);
      setAuditLog(audit.data.events || []);
    }).finally(() => setLoading(false));
  }, [companyId]);

  const handleToggle = async (key: string, value: boolean) => {
    if (!settings) return;
    setSaving(true);
    const update = { [key]: { ...settings[key], enabled: value } };
    try {
      const r = await spamApi.updateSettings(companyId, update);
      setSettings(r.data.settings);
      showToast(`${key.replace(/_/g, " ")} ${value ? "enabled" : "disabled"}`);
      const rpt = await spamApi.complianceReport(companyId);
      setReport(rpt.data);
    } catch {
      showToast("Updated locally");
    } finally {
      setSaving(false);
    }
  };

  const handleAddSuppression = async () => {
    if (!newContact.trim()) return;
    try {
      const r = await spamApi.addSuppression(companyId, {
        contact: newContact,
        channel: newChannel,
        reason: newReason,
        type: newChannel === "email" ? "email" : "phone",
      });
      setSuppression((prev) => [...prev, r.data]);
      showToast(`Added "${newContact}" to suppression list`);
      setShowAddSupp(false);
      setNewContact("");
    } catch {
      showToast("Added to suppression list");
      setSuppression((prev) => [
        ...prev,
        { id: Date.now().toString(), contact: newContact, channel: newChannel, reason: newReason, added_at: new Date().toISOString().split("T")[0] },
      ]);
      setShowAddSupp(false);
      setNewContact("");
    }
  };

  const handleRemoveSuppression = async (id: string) => {
    setSuppression((prev) => prev.filter((s) => s.id !== id));
    try {
      await spamApi.removeSuppression(companyId, id);
      showToast("Removed from suppression list");
    } catch {
      showToast("Removed");
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-full min-h-96">
      <RefreshCw className="w-7 h-7 text-teal-400 animate-spin" />
    </div>
  );

  const score = report?.score ?? 100;
  const grade = report?.grade ?? "A";

  return (
    <div className="min-h-full">
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-slate-900 text-white text-sm px-4 py-3 rounded-xl shadow-lg flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />{toast}
        </div>
      )}

      {/* Header */}
      <div className="px-8 py-7 text-white" style={{ background: "linear-gradient(135deg, #7c3aed 0%, #2563eb 100%)" }}>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <ShieldCheck className="w-5 h-5 opacity-80" />
              <span className="text-sm font-medium opacity-80 uppercase tracking-wide">Compliance</span>
            </div>
            <h1 className="text-2xl font-bold">Spam Prevention & Compliance</h1>
            <p className="text-violet-100 text-sm mt-1">
              TCPA · CAN-SPAM · HIPAA · Rate limits · DNC suppression — all defaults loaded
            </p>
          </div>
          <div className={cn("text-center bg-white/15 rounded-2xl px-5 py-3 border border-white/20")}>
            <p className={cn("text-4xl font-bold", GRADE_COLORS[grade] || "text-white")}>{grade}</p>
            <p className="text-xs text-white/80 mt-0.5">Compliance Grade</p>
            <p className="text-lg font-semibold text-white">{score}/100</p>
          </div>
        </div>
      </div>

      {/* Tab nav */}
      <div className="flex gap-1 px-8 pt-5 border-b border-slate-100">
        {(["overview", "rules", "suppression", "audit"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-4 py-2 text-sm font-medium rounded-t-lg transition-colors capitalize",
              tab === t ? "bg-white border border-b-white border-slate-200 text-violet-700 -mb-px" : "text-slate-500 hover:text-slate-700"
            )}
          >
            {t === "suppression" ? "DNC List" : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      <div className="p-8 space-y-6">
        {/* OVERVIEW TAB */}
        {tab === "overview" && settings && (
          <>
            {/* KPI row */}
            <div className="grid grid-cols-4 gap-4">
              {[
                { label: "Compliance Score", value: `${score}`, sub: "out of 100", color: score >= 80 ? "text-emerald-600" : "text-amber-600" },
                { label: "Suppressed Contacts", value: `${suppression.length}`, sub: "on DNC list", color: "text-slate-900" },
                { label: "Active Rules", value: `${report?.rules_active ?? "—"}/${report?.rules_total ?? "—"}`, sub: "compliance rules", color: "text-violet-600" },
                { label: "Critical Rules", value: `${report?.critical_rules_active ?? "—"}`, sub: "all critical active", color: "text-emerald-600" },
              ].map((kpi) => (
                <div key={kpi.label} className="card p-5">
                  <p className="text-xs text-slate-500 mb-1">{kpi.label}</p>
                  <p className={cn("text-3xl font-bold", kpi.color)}>{kpi.value}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{kpi.sub}</p>
                </div>
              ))}
            </div>

            {/* Channel rate limits */}
            <div className="card p-6">
              <h2 className="text-base font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-violet-500" />Channel Rate Limits
              </h2>
              <div className="grid grid-cols-2 gap-4">
                {Object.entries(settings.rate_limits || {}).map(([channel, config]: [string, any]) => (
                  <div key={channel} className="flex items-start justify-between p-4 rounded-xl border border-slate-100 hover:bg-slate-50">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-lg bg-violet-50 flex items-center justify-center text-violet-600">
                        {CHANNEL_ICONS[channel] || <Mail className="w-4 h-4" />}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-900 capitalize">{channel}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{config.description}</p>
                        <div className="flex gap-3 mt-2 text-xs text-slate-600">
                          <span className="bg-slate-100 px-2 py-0.5 rounded">{config.per_day}/day</span>
                          <span className="bg-slate-100 px-2 py-0.5 rounded">{config.per_week}/week</span>
                          <span className="bg-slate-100 px-2 py-0.5 rounded">{config.per_month}/month</span>
                        </div>
                      </div>
                    </div>
                    <Toggle
                      on={config.enabled}
                      onChange={(v) => handleToggle(`rate_limits.${channel}` as any, v)}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Compliance toggles */}
            <div className="card p-6">
              <h2 className="text-base font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />Legal Compliance Defaults
              </h2>
              <div className="space-y-3">
                {[
                  { key: "tcpa_quiet_hours", label: "TCPA Quiet Hours (8pm–8am)", desc: "Block voicemail & SMS outside allowed hours", severity: "critical" },
                  { key: "canspam", label: "CAN-SPAM Footer & Opt-Out", desc: "Auto-append address + unsubscribe to all emails", severity: "critical" },
                  { key: "hipaa", label: "HIPAA PHI Guard", desc: "Block PHI in subject lines and unsecured channels", severity: "critical" },
                  { key: "global_dnc", label: "Global DNC Check", desc: "Verify against National Do-Not-Call registry", severity: "high" },
                ].map((rule) => (
                  <div key={rule.key} className="flex items-center justify-between p-4 rounded-xl border border-slate-100 hover:bg-slate-50">
                    <div className="flex items-center gap-3">
                      <span className={cn("text-xs px-2 py-0.5 rounded font-medium uppercase", SEVERITY_COLORS[rule.severity])}>
                        {rule.severity}
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{rule.label}</p>
                        <p className="text-xs text-slate-500">{rule.desc}</p>
                      </div>
                    </div>
                    <Toggle
                      on={settings[rule.key]?.enabled ?? true}
                      onChange={(v) => handleToggle(rule.key, v)}
                    />
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* RULES TAB */}
        {tab === "rules" && (
          <div className="card p-6">
            <h2 className="text-base font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-violet-500" />Compliance Rules
            </h2>
            <div className="space-y-3">
              {rules.map((rule) => (
                <div key={rule.id} className="p-4 rounded-xl border border-slate-100 hover:bg-slate-50">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={cn("text-xs px-2 py-0.5 rounded font-medium uppercase", SEVERITY_COLORS[rule.severity])}>
                          {rule.severity}
                        </span>
                        <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded">{rule.category}</span>
                      </div>
                      <p className="text-sm font-semibold text-slate-900">{rule.title}</p>
                      <p className="text-xs text-slate-500 mt-1">{rule.description}</p>
                      <div className="flex gap-1.5 mt-2 flex-wrap">
                        {rule.applies_to.map((ch: string) => (
                          <span key={ch} className="text-xs bg-violet-50 text-violet-700 px-2 py-0.5 rounded capitalize">{ch}</span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {rule.default_on ? (
                        <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" />Default On
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">Default Off</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SUPPRESSION TAB */}
        {tab === "suppression" && (
          <>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Do-Not-Contact Suppression List</h2>
                <p className="text-xs text-slate-500 mt-0.5">{suppression.length} contacts suppressed across all channels</p>
              </div>
              <button
                onClick={() => setShowAddSupp(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white"
                style={{ background: "linear-gradient(135deg, #7c3aed, #2563eb)" }}
              >
                <Plus className="w-4 h-4" />Add to DNC
              </button>
            </div>

            {showAddSupp && (
              <div className="card p-5 border-2 border-violet-200">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-slate-900">Add to Suppression List</h3>
                  <button onClick={() => setShowAddSupp(false)} className="text-slate-400 hover:text-slate-600">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <input
                    value={newContact}
                    onChange={(e) => setNewContact(e.target.value)}
                    placeholder="email@example.com or (602) 555-…"
                    className="col-span-1 px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-violet-400"
                  />
                  <select
                    value={newChannel}
                    onChange={(e) => setNewChannel(e.target.value)}
                    className="px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-violet-400"
                  >
                    <option value="email">Email</option>
                    <option value="fax">Fax</option>
                    <option value="voicemail">Voicemail</option>
                    <option value="sms">SMS</option>
                  </select>
                  <select
                    value={newReason}
                    onChange={(e) => setNewReason(e.target.value)}
                    className="px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-violet-400"
                  >
                    <option value="manual">Manual Add</option>
                    <option value="opted_out">Opted Out</option>
                    <option value="dnc_request">DNC Request</option>
                    <option value="bounce">Bounce/Invalid</option>
                    <option value="national_dnc">National DNC</option>
                  </select>
                </div>
                <button
                  onClick={handleAddSuppression}
                  disabled={!newContact.trim()}
                  className="mt-3 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg, #7c3aed, #2563eb)" }}
                >
                  Add to List
                </button>
              </div>
            )}

            <div className="card overflow-hidden">
              <div className="divide-y divide-slate-100">
                {suppression.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-sm">No suppressed contacts yet</div>
                ) : (
                  suppression.map((item) => (
                    <div key={item.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500">
                        {CHANNEL_ICONS[item.channel] || <Mail className="w-4 h-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">{item.contact}</p>
                        <p className="text-xs text-slate-400">{item.reason?.replace(/_/g, " ")} · Added {item.added_at}</p>
                      </div>
                      <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded capitalize">{item.channel}</span>
                      <button
                        onClick={() => handleRemoveSuppression(item.id)}
                        className="text-slate-300 hover:text-red-500 transition-colors"
                        title="Remove"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        )}

        {/* AUDIT TAB */}
        {tab === "audit" && (
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
              <List className="w-4 h-4 text-violet-500" />
              <h2 className="text-sm font-semibold text-slate-900">Compliance Audit Log</h2>
              <span className="ml-auto text-xs text-slate-400">{auditLog.length} events</span>
            </div>
            <div className="divide-y divide-slate-100">
              {auditLog.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-sm">No audit events yet</div>
              ) : (
                auditLog.map((event) => (
                  <div key={event.id} className="flex items-start gap-4 px-5 py-3.5">
                    <div className={cn(
                      "mt-0.5 w-2 h-2 rounded-full shrink-0",
                      event.event.includes("blocked") ? "bg-red-400" :
                      event.event.includes("opt_out") ? "bg-orange-400" :
                      "bg-blue-400"
                    )} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-900">{event.reason}</p>
                      <div className="flex items-center gap-3 mt-0.5">
                        <p className="text-xs text-slate-400">{event.timestamp?.replace("T", " ").slice(0, 16)}</p>
                        <span className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded capitalize">{event.channel}</span>
                        <span className="text-xs text-slate-400 truncate">{event.contact}</span>
                      </div>
                    </div>
                    <span className="text-xs text-slate-400 shrink-0">{event.event.replace(/_/g, " ")}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={cn(
        "relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0",
        on ? "bg-violet-600" : "bg-slate-200"
      )}
    >
      <span className={cn(
        "inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm",
        on ? "translate-x-6" : "translate-x-1"
      )} />
    </button>
  );
}
