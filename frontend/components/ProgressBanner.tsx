"use client";
import { useEffect, useState } from "react";

interface ProgressBannerProps {
  active: boolean;
  label: string;
  estimatedSeconds: number;
  steps?: string[];
  color?: "emerald" | "violet" | "orange" | "blue";
}

const COLOR_MAP = {
  emerald: {
    bg: "bg-emerald-50",
    border: "border-emerald-100",
    text: "text-emerald-900",
    sub: "text-emerald-600",
    bar: "linear-gradient(90deg, #10b981, #059669)",
  },
  violet: {
    bg: "bg-violet-50",
    border: "border-violet-100",
    text: "text-violet-900",
    sub: "text-violet-600",
    bar: "linear-gradient(90deg, #8b5cf6, #7c3aed)",
  },
  orange: {
    bg: "bg-orange-50",
    border: "border-orange-100",
    text: "text-orange-900",
    sub: "text-orange-600",
    bar: "linear-gradient(90deg, #f97316, #ea580c)",
  },
  blue: {
    bg: "bg-blue-50",
    border: "border-blue-100",
    text: "text-blue-900",
    sub: "text-blue-600",
    bar: "linear-gradient(90deg, #3b82f6, #2563eb)",
  },
};

export default function ProgressBanner({
  active,
  label,
  estimatedSeconds,
  steps = [],
  color = "blue",
}: ProgressBannerProps) {
  const [pct, setPct] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!active) {
      setPct(0);
      setElapsed(0);
      return;
    }
    const start = Date.now();
    const id = setInterval(() => {
      const secs = (Date.now() - start) / 1000;
      setElapsed(secs);
      // Ease toward 92% at estimatedSeconds, then plateau so it never "finishes" early
      setPct(Math.min(92, (secs / estimatedSeconds) * 95));
    }, 400);
    return () => clearInterval(id);
  }, [active, estimatedSeconds]);

  if (!active && pct === 0) return null;

  const c = COLOR_MAP[color];
  const remaining = Math.max(0, Math.round(estimatedSeconds - elapsed));
  const stepIndex =
    steps.length > 0
      ? Math.min(
          Math.floor((elapsed / estimatedSeconds) * steps.length),
          steps.length - 1
        )
      : -1;

  return (
    <div
      className={`mx-8 mt-4 rounded-xl border ${c.border} ${c.bg} px-4 py-3 fade-in`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className={`text-sm font-medium ${c.text} flex items-center gap-2`}>
          <span
            className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin inline-block shrink-0"
            style={{ borderTopColor: "transparent" }}
          />
          {label}
        </span>
        <span className="text-xs text-slate-500 tabular-nums shrink-0 ml-3">
          {remaining > 0 ? `~${remaining}s left` : "Finishing…"}
        </span>
      </div>
      <div className="progress-track">
        <div
          className="progress-fill"
          style={{ width: `${pct}%`, background: c.bar }}
        />
      </div>
      {stepIndex >= 0 && steps[stepIndex] && (
        <p className={`text-xs ${c.sub} mt-2`}>{steps[stepIndex]}</p>
      )}
    </div>
  );
}
