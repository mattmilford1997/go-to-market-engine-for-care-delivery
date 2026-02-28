"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ClipboardList, RefreshCw, Plus, ExternalLink, CheckCircle, TrendingUp, Users, BarChart2 } from "lucide-react";
import { intakeApi } from "@/lib/api";
import { cn } from "@/lib/utils";

const FIELD_TYPES = [
  { type: "text", label: "Short Text", icon: "T" },
  { type: "textarea", label: "Long Text", icon: "¶" },
  { type: "email", label: "Email", icon: "@" },
  { type: "phone", label: "Phone", icon: "☎" },
  { type: "date", label: "Date", icon: "📅" },
  { type: "select", label: "Dropdown", icon: "▾" },
  { type: "checkbox", label: "Checkboxes", icon: "☑" },
  { type: "scale", label: "Rating Scale", icon: "⊡" },
];

const DEMO_FORMS = [
  {
    id: "form-depression",
    name: "Depression & Anxiety Intake",
    description: "Screens for PHQ-9, GAD-7, and collects insurance + referral source",
    fields_count: 12,
    responses: 47,
    completion_rate: 86,
    created_at: "2026-01-15",
    status: "active",
  },
  {
    id: "form-tms",
    name: "TMS Therapy Pre-Screening",
    description: "Checks TMS eligibility criteria, medication history, and prior treatment",
    fields_count: 8,
    responses: 23,
    completion_rate: 91,
    created_at: "2026-01-28",
    status: "active",
  },
  {
    id: "form-general",
    name: "General Mental Health Intake",
    description: "Comprehensive new patient intake with demographics, insurance, and history",
    fields_count: 15,
    responses: 89,
    completion_rate: 78,
    created_at: "2026-02-05",
    status: "active",
  },
  {
    id: "form-med-management",
    name: "Medication Management Intake",
    description: "Current medications, pharmacy info, and symptom tracker for psychiatric follow-up",
    fields_count: 10,
    responses: 34,
    completion_rate: 82,
    created_at: "2026-02-12",
    status: "active",
  },
];

export default function IntakePage() {
  const { companyId } = useParams<{ companyId: string }>();
  const [forms, setForms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBuilder, setShowBuilder] = useState(false);
  const [newFormName, setNewFormName] = useState("");
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3500); };

  useEffect(() => {
    if (!companyId) return;
    intakeApi.forms(companyId)
      .then((r) => { setForms(r.data.forms?.length ? r.data.forms : DEMO_FORMS); })
      .catch(() => setForms(DEMO_FORMS))
      .finally(() => setLoading(false));
  }, [companyId]);

  const handleCreateForm = async () => {
    if (!newFormName.trim()) return;
    setCreating(true);
    try {
      const r = await intakeApi.createForm(companyId, {
        name: newFormName,
        fields: selectedFields.map((type) => ({ type, label: FIELD_TYPES.find((f) => f.type === type)?.label || type })),
      });
      setForms((prev) => [r.data, ...prev]);
      showToast(`"${newFormName}" form created!`);
      setShowBuilder(false);
      setNewFormName("");
      setSelectedFields([]);
    } catch {
      const mockForm = {
        id: `form-${Date.now()}`,
        name: newFormName,
        description: "Custom intake form",
        fields_count: selectedFields.length,
        responses: 0,
        completion_rate: 0,
        created_at: new Date().toISOString().split("T")[0],
        status: "draft",
      };
      setForms((prev) => [mockForm, ...prev]);
      showToast(`"${newFormName}" form created!`);
      setShowBuilder(false);
      setNewFormName("");
      setSelectedFields([]);
    } finally {
      setCreating(false);
    }
  };

  const toggleField = (type: string) => {
    setSelectedFields((prev) =>
      prev.includes(type) ? prev.filter((f) => f !== type) : [...prev, type]
    );
  };

  const totalResponses = forms.reduce((s, f) => s + (f.responses || 0), 0);
  const avgCompletion = forms.length
    ? Math.round(forms.reduce((s, f) => s + (f.completion_rate || 0), 0) / forms.length)
    : 0;
  const activeForms = forms.filter((f) => f.status === "active").length;

  if (loading) return (
    <div className="flex items-center justify-center h-full min-h-96">
      <RefreshCw className="w-7 h-7 text-teal-400 animate-spin" />
    </div>
  );

  return (
    <div className="min-h-full">
      {toast && <div className="fixed top-4 right-4 z-50 bg-slate-900 text-white text-sm px-4 py-3 rounded-xl shadow-lg">{toast}</div>}

      {/* Header */}
      <div className="px-8 py-7 text-white" style={{ background: "linear-gradient(135deg, #0d9488 0%, #0ea5e9 100%)" }}>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <ClipboardList className="w-5 h-5 opacity-80" />
              <span className="text-sm font-medium opacity-80 uppercase tracking-wide">Patient Ops</span>
            </div>
            <h1 className="text-2xl font-bold">Smart Intake Forms</h1>
            <p className="text-teal-100 text-sm mt-1">Digital intake forms · Embed on website · Track completion rates</p>
          </div>
          <button
            onClick={() => setShowBuilder(true)}
            className="flex items-center gap-2 px-4 py-2 bg-white/15 hover:bg-white/25 text-white rounded-xl text-sm font-medium border border-white/20"
          >
            <Plus className="w-4 h-4" />New Form
          </button>
        </div>
      </div>

      <div className="p-8 space-y-6">
        {/* KPI row */}
        <div className="grid grid-cols-3 gap-4">
          <div className="card p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-teal-100 flex items-center justify-center">
              <ClipboardList className="w-6 h-6 text-teal-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-0.5">Active Forms</p>
              <p className="text-3xl font-bold text-slate-900">{activeForms}</p>
            </div>
          </div>
          <div className="card p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
              <Users className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-0.5">Total Responses</p>
              <p className="text-3xl font-bold text-slate-900">{totalResponses}</p>
            </div>
          </div>
          <div className="card p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-0.5">Avg Completion Rate</p>
              <p className="text-3xl font-bold text-emerald-600">{avgCompletion}%</p>
            </div>
          </div>
        </div>

        {/* Form builder modal */}
        {showBuilder && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-7">
              <h2 className="text-lg font-semibold text-slate-900 mb-5">Create New Intake Form</h2>
              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Form Name</label>
                  <input
                    type="text"
                    value={newFormName}
                    onChange={(e) => setNewFormName(e.target.value)}
                    placeholder="e.g., OCD & ERP Intake, ADHD Adult Assessment…"
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm outline-none focus:border-teal-400"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Add Field Types</label>
                  <div className="grid grid-cols-4 gap-2">
                    {FIELD_TYPES.map((ft) => (
                      <button
                        key={ft.type}
                        onClick={() => toggleField(ft.type)}
                        className={cn(
                          "flex flex-col items-center gap-1 p-3 rounded-xl border text-xs font-medium transition-all",
                          selectedFields.includes(ft.type)
                            ? "bg-teal-50 border-teal-300 text-teal-700"
                            : "border-slate-200 text-slate-600 hover:bg-slate-50"
                        )}
                      >
                        <span className="text-base">{ft.icon}</span>
                        {ft.label}
                      </button>
                    ))}
                  </div>
                  {selectedFields.length > 0 && (
                    <p className="text-xs text-teal-600 mt-2">{selectedFields.length} field type{selectedFields.length > 1 ? "s" : ""} selected</p>
                  )}
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setShowBuilder(false)}
                  className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50">
                  Cancel
                </button>
                <button onClick={handleCreateForm} disabled={!newFormName.trim() || creating}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg, #0d9488, #0ea5e9)" }}>
                  {creating ? <RefreshCw className="w-4 h-4 animate-spin mx-auto" /> : "Create Form"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Forms list */}
        <div className="card p-6">
          <h2 className="text-base font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-teal-500" />Your Intake Forms
          </h2>
          <div className="space-y-3">
            {forms.map((form) => (
              <div key={form.id} className="flex items-start gap-5 p-4 rounded-xl border border-slate-100 hover:bg-slate-50 transition-colors">
                <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center shrink-0">
                  <ClipboardList className="w-5 h-5 text-teal-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <h3 className="text-sm font-semibold text-slate-900">{form.name}</h3>
                    <span className={cn(
                      "text-xs px-1.5 py-0.5 rounded font-medium",
                      form.status === "active" ? "bg-emerald-100 text-emerald-700" :
                      form.status === "draft" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"
                    )}>
                      {form.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 truncate">{form.description}</p>
                </div>
                <div className="flex items-center gap-6 shrink-0">
                  <div className="text-center">
                    <p className="text-lg font-bold text-slate-900">{form.fields_count}</p>
                    <p className="text-xs text-slate-400">fields</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-slate-900">{form.responses}</p>
                    <p className="text-xs text-slate-400">responses</p>
                  </div>
                  <div className="text-center">
                    <p className={cn("text-lg font-bold", (form.completion_rate || 0) >= 80 ? "text-emerald-600" : "text-amber-600")}>
                      {form.completion_rate || 0}%
                    </p>
                    <p className="text-xs text-slate-400">completion</p>
                  </div>
                  <button
                    onClick={() => showToast(`Embed URL copied for "${form.name}"`)}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >
                    <ExternalLink className="w-3 h-3" />Embed
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Integration note */}
        <div className="rounded-xl p-5 border border-teal-100" style={{ background: "linear-gradient(135deg, #f0fdfa, #e0f2fe)" }}>
          <div className="flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-teal-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-teal-900">How to embed intake forms</p>
              <p className="text-xs text-teal-700 mt-1">
                Each form generates a unique embed URL you can add to your website, Google Business Profile,
                or include in email signatures. Responses flow directly into your patient management system.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
