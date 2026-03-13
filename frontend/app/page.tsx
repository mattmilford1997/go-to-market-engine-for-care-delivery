"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { companiesApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function Home() {
  const router = useRouter();
  const { user, hydrate, initialized, logout } = useAuth();
  const [url, setUrl] = useState("novamindmentalhealth.com");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { hydrate(); }, [hydrate]);

  // If not authenticated, redirect to login
  useEffect(() => {
    if (initialized && !user) {
      router.push("/login");
    }
  }, [initialized, user, router]);

  async function handleOnboard(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const fullUrl = url.startsWith("http") ? url : `https://${url}`;
      const res = await companiesApi.create({
        website_url: fullUrl,
        is_pilot: url.includes("novamind"),
      });
      router.push(`/dashboard/${res.data.id}`);
    } catch (err: any) {
      const detail = err?.response?.data?.detail ?? "";
      if (typeof detail === "string" && detail.toLowerCase().includes("already exists")) {
        try {
          const list = await companiesApi.list();
          const fullUrl = url.startsWith("http") ? url : `https://${url}`;
          const existing = list.data.find(
            (c: any) => c.website_url === fullUrl || c.website_url === fullUrl.replace(/\/$/, "")
          );
          if (existing) {
            router.push(`/dashboard/${existing.id}`);
            return;
          }
        } catch {
          // fall through to generic error
        }
      }
      const status = err?.response?.status;
      const msg = err?.message;
      setError(detail || (status ? `Error ${status}` : msg || "Failed to start onboarding"));
    } finally {
      setLoading(false);
    }
  }

  if (!initialized || !user) {
    return <div className="min-h-screen bg-slate-900 flex items-center justify-center text-slate-500">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex flex-col">
      <header className="px-8 py-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center">
            <span className="text-white font-bold text-sm">A</span>
          </div>
          <span className="text-white font-semibold text-lg">Arche Studios</span>
        </div>
        <div className="flex items-center gap-4">
          {user.company_id && (
            <button
              onClick={() => router.push(`/dashboard/${user.company_id}`)}
              className="text-slate-400 hover:text-white text-sm transition-colors"
            >
              My Dashboard
            </button>
          )}
          {user.role === "admin" && (
            <button
              onClick={() => router.push("/admin")}
              className="text-slate-400 hover:text-white text-sm transition-colors"
            >
              Admin
            </button>
          )}
          <span className="text-slate-500 text-sm">{user.full_name}</span>
          <button
            onClick={() => { logout(); router.push("/login"); }}
            className="text-red-400 hover:text-red-300 text-sm transition-colors"
          >
            Logout
          </button>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-full px-4 py-1.5 text-blue-400 text-sm mb-6">
            <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
            GTM Marketing Engine v2.0
          </div>

          <h1 className="text-5xl font-bold text-white leading-tight mb-4">
            Institutional-grade marketing
            <span className="text-blue-400"> from day one</span>
          </h1>

          <p className="text-slate-400 text-lg mb-10 leading-relaxed">
            Enter a healthcare company URL. The engine scrapes the site,
            understands the practice, and generates campaigns across 5
            channels — paid ads, referral outreach, content, SEO, and
            directory profiles.
          </p>

          <form onSubmit={handleOnboard} className="flex flex-col sm:flex-row gap-3 max-w-lg mx-auto">
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="e.g. novamindmentalhealth.com"
              className="flex-1 px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-slate-500 focus:outline-none focus:border-blue-400 transition-colors"
            />
            <button
              type="submit"
              disabled={loading || !url}
              className="px-6 py-3 rounded-xl bg-blue-500 hover:bg-blue-400 text-white font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {loading ? "Ingesting..." : "Launch Engine"}
            </button>
          </form>

          {error && <p className="mt-4 text-red-400 text-sm">{error}</p>}
          <p className="mt-4 text-slate-500 text-sm">Pilot: novamindmentalhealth.com</p>
        </div>
      </main>

      <section className="px-8 pb-12">
        <div className="max-w-5xl mx-auto grid grid-cols-5 gap-3">
          {[
            { num: "01", label: "Paid Ads", desc: "Google + Meta" },
            { num: "02", label: "Referral", desc: "Fax · Email · Voicemail · Mail" },
            { num: "03", label: "Content", desc: "Blog + Social" },
            { num: "04", label: "SEO", desc: "Technical + Keywords" },
            { num: "05", label: "Profiles", desc: "9 directories" },
          ].map((m) => (
            <div key={m.num} className="bg-white/5 border border-white/10 rounded-xl p-4 text-center">
              <div className="text-blue-400 text-xs font-mono mb-1">{m.num}</div>
              <div className="text-white font-semibold text-sm">{m.label}</div>
              <div className="text-slate-500 text-xs mt-1">{m.desc}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
