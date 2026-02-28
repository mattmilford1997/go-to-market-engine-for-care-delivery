"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Calendar, ChevronLeft, ChevronRight, Plus, RefreshCw } from "lucide-react";
import { scheduleApi } from "@/lib/api";
import { cn } from "@/lib/utils";

const CHANNEL_COLORS: Record<string, string> = {
  fax: "bg-blue-100 text-blue-700 border-blue-200",
  email: "bg-violet-100 text-violet-700 border-violet-200",
  voicemail: "bg-emerald-100 text-emerald-700 border-emerald-200",
  content: "bg-purple-100 text-purple-700 border-purple-200",
  seo: "bg-sky-100 text-sky-700 border-sky-200",
  google: "bg-red-100 text-red-700 border-red-200",
  meta: "bg-amber-100 text-amber-700 border-amber-200",
  scheduled: "bg-slate-100 text-slate-700 border-slate-200",
};

const DEMO_EVENTS = [
  { id: "1", type: "campaign", title: "Fax — Scottsdale PCPs", channel: "fax", date: "2026-02-03", status: "active" },
  { id: "2", type: "campaign", title: "Email sequence: Day 1", channel: "email", date: "2026-02-05", status: "active" },
  { id: "3", type: "content", title: "TMS Blog Post Published", channel: "content", date: "2026-02-07", status: "published" },
  { id: "4", type: "campaign", title: "Voicemail drop — Phoenix", channel: "voicemail", date: "2026-02-10", status: "active" },
  { id: "5", type: "campaign", title: "Meta Ads — Anxiety targeting", channel: "meta", date: "2026-02-12", status: "active" },
  { id: "6", type: "content", title: "LinkedIn: Staff spotlight", channel: "content", date: "2026-02-14", status: "published" },
  { id: "7", type: "campaign", title: "Email sequence: Day 10", channel: "email", date: "2026-02-15", status: "active" },
  { id: "8", type: "campaign", title: "Google Ads — TMS keywords", channel: "google", date: "2026-02-17", status: "active" },
  { id: "9", type: "content", title: "Blog: ADHD in Adults", channel: "content", date: "2026-02-19", status: "draft" },
  { id: "10", type: "campaign", title: "Fax — Tempe Therapists", channel: "fax", date: "2026-02-21", status: "active" },
  { id: "11", type: "campaign", title: "Email sequence: Day 21", channel: "email", date: "2026-02-25", status: "scheduled" },
  { id: "12", type: "content", title: "Instagram: Patient story", channel: "content", date: "2026-02-26", status: "scheduled" },
  { id: "13", type: "campaign", title: "Fax — Chandler Pediatrics", channel: "fax", date: "2026-03-03", status: "scheduled" },
  { id: "14", type: "campaign", title: "Email sequence: Day 30", channel: "email", date: "2026-03-05", status: "scheduled" },
  { id: "15", type: "content", title: "Blog: How TMS Works", channel: "content", date: "2026-03-07", status: "draft" },
];

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

export default function SchedulePage() {
  const { companyId } = useParams<{ companyId: string }>();
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date(2026, 1, 1));
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  useEffect(() => {
    if (!companyId) return;
    scheduleApi.events(companyId, currentDate.getMonth() + 1, currentDate.getFullYear())
      .then((r) => { if (r.data.events?.length) setEvents(r.data.events); else setEvents(DEMO_EVENTS); })
      .catch(() => setEvents(DEMO_EVENTS))
      .finally(() => setLoading(false));
  }, [companyId, currentDate]);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const eventsThisMonth = events.filter((e) => {
    const d = new Date(e.date);
    return d.getFullYear() === year && d.getMonth() === month;
  });

  const eventsByDate: Record<string, any[]> = {};
  eventsThisMonth.forEach((e) => {
    const key = e.date;
    if (!eventsByDate[key]) eventsByDate[key] = [];
    eventsByDate[key].push(e);
  });

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  const todayStr = new Date().toISOString().split("T")[0];
  const selectedEvents = selectedDay ? (eventsByDate[selectedDay] || []) : [];

  const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array(daysInMonth).fill(0).map((_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);

  if (loading) return (
    <div className="flex items-center justify-center h-full min-h-96">
      <RefreshCw className="w-7 h-7 text-indigo-400 animate-spin" />
    </div>
  );

  return (
    <div className="min-h-full">
      {toast && <div className="fixed top-4 right-4 z-50 bg-slate-900 text-white text-sm px-4 py-3 rounded-xl shadow-lg">{toast}</div>}

      {/* Header */}
      <div className="px-8 py-7 text-white" style={{ background: "linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%)" }}>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Calendar className="w-5 h-5 opacity-80" />
              <span className="text-sm font-medium opacity-80 uppercase tracking-wide">Outreach</span>
            </div>
            <h1 className="text-2xl font-bold">Activity Calendar</h1>
            <p className="text-sky-100 text-sm mt-1">Visual timeline of all campaigns, content, and outreach</p>
          </div>
          <button
            onClick={() => showToast("Schedule an outreach activity from any campaign module.")}
            className="flex items-center gap-2 px-4 py-2 bg-white/15 hover:bg-white/25 text-white rounded-xl text-sm font-medium border border-white/20"
          >
            <Plus className="w-4 h-4" />Schedule Activity
          </button>
        </div>
      </div>

      <div className="p-8 flex gap-6">
        {/* Calendar grid */}
        <div className="flex-1 card p-6 min-w-0">
          {/* Month nav */}
          <div className="flex items-center justify-between mb-5">
            <button onClick={prevMonth} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
              <ChevronLeft className="w-5 h-5 text-slate-500" />
            </button>
            <h2 className="text-lg font-semibold text-slate-900">{MONTHS[month]} {year}</h2>
            <button onClick={nextMonth} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
              <ChevronRight className="w-5 h-5 text-slate-500" />
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 mb-1">
            {DAYS.map((d) => (
              <div key={d} className="text-center text-xs font-semibold text-slate-400 uppercase pb-2">{d}</div>
            ))}
          </div>

          {/* Calendar cells */}
          <div className="grid grid-cols-7 gap-px bg-slate-100 border border-slate-100 rounded-xl overflow-hidden">
            {cells.map((day, i) => {
              if (!day) return <div key={i} className="bg-white min-h-20 p-1" />;
              const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const dayEvents = eventsByDate[dateStr] || [];
              const isToday = dateStr === todayStr;
              const isSelected = dateStr === selectedDay;
              return (
                <div
                  key={i}
                  onClick={() => setSelectedDay(isSelected ? null : dateStr)}
                  className={cn(
                    "bg-white min-h-20 p-1.5 cursor-pointer transition-colors",
                    isSelected ? "bg-indigo-50" : "hover:bg-slate-50"
                  )}
                >
                  <div className={cn(
                    "w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium mb-1",
                    isToday ? "bg-indigo-600 text-white" : "text-slate-600"
                  )}>
                    {day}
                  </div>
                  <div className="space-y-0.5">
                    {dayEvents.slice(0, 2).map((e, ei) => (
                      <div key={ei} className={cn(
                        "text-xs px-1 py-0.5 rounded border truncate leading-tight",
                        CHANNEL_COLORS[e.channel] || "bg-slate-100 text-slate-700 border-slate-200"
                      )}>
                        {e.title}
                      </div>
                    ))}
                    {dayEvents.length > 2 && (
                      <div className="text-xs text-slate-400 pl-1">+{dayEvents.length - 2} more</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Sidebar: selected day or upcoming */}
        <div className="w-72 shrink-0 space-y-4">
          {selectedDay && selectedEvents.length > 0 ? (
            <div className="card p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-900">
                  {new Date(selectedDay + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric" })}
                </h3>
                <button onClick={() => setSelectedDay(null)} className="text-xs text-slate-400 hover:text-slate-600">✕</button>
              </div>
              <div className="space-y-2">
                {selectedEvents.map((e, i) => (
                  <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-slate-50">
                    <span className={cn(
                      "text-xs px-1.5 py-0.5 rounded font-medium shrink-0",
                      CHANNEL_COLORS[e.channel] || "bg-slate-100 text-slate-600"
                    )}>
                      {e.channel}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-800 truncate">{e.title}</p>
                      <p className="text-xs text-slate-400 capitalize">{e.status}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Upcoming events */}
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">Upcoming Activities</h3>
            <div className="space-y-2">
              {events
                .filter((e) => new Date(e.date) >= new Date())
                .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                .slice(0, 8)
                .map((e, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <div className="text-right shrink-0 w-12">
                      <p className="text-xs font-semibold text-slate-700">
                        {new Date(e.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </p>
                    </div>
                    <div className="flex-1 min-w-0 border-l border-slate-200 pl-2">
                      <p className="text-xs text-slate-700 truncate">{e.title}</p>
                      <span className={cn(
                        "text-xs px-1.5 py-0.5 rounded font-medium",
                        CHANNEL_COLORS[e.channel] || "bg-slate-100 text-slate-600"
                      )}>
                        {e.channel}
                      </span>
                    </div>
                  </div>
                ))}
            </div>
          </div>

          {/* Channel legend */}
          <div className="card p-5">
            <h3 className="text-xs font-semibold text-slate-500 uppercase mb-3">Channels</h3>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(CHANNEL_COLORS).map(([ch, cls]) => (
                <span key={ch} className={cn("text-xs px-2 py-0.5 rounded border font-medium capitalize", cls)}>{ch}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
