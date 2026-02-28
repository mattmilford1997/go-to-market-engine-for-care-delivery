"use client";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { MessageSquare, Send, RefreshCw, Trash2, Sparkles } from "lucide-react";
import { chatApi } from "@/lib/api";
import { cn } from "@/lib/utils";

const SUGGESTED_PROMPTS = [
  "What should my top GTM priority be this week?",
  "How can I increase referrals from PCPs in my area?",
  "Write a fax cover letter for psychiatry referrals",
  "What email subject lines work best for provider outreach?",
  "How do I improve my Google Maps ranking?",
  "What's a realistic cost-per-acquisition for behavioral health?",
];

export default function AskPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  useEffect(() => {
    if (!companyId) return;
    chatApi.history(companyId)
      .then((r) => { setMessages(r.data.messages || []); })
      .catch(() => {})
      .finally(() => setInitializing(false));
  }, [companyId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (text: string) => {
    const msg = text.trim();
    if (!msg || loading) return;
    setInput("");
    setLoading(true);

    const userMsg = { id: Date.now().toString(), role: "user", content: msg, timestamp: new Date().toISOString() };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const r = await chatApi.message(companyId, msg);
      setMessages(r.data.history || [...messages, userMsg, r.data.message]);
    } catch {
      const fallback = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "I'm experiencing a connection issue. Please try again in a moment.",
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, fallback]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleClear = async () => {
    try {
      await chatApi.clearHistory(companyId);
    } catch {}
    setMessages([]);
    showToast("Conversation cleared");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  if (initializing) return (
    <div className="flex items-center justify-center h-full min-h-96">
      <RefreshCw className="w-7 h-7 text-indigo-400 animate-spin" />
    </div>
  );

  return (
    <div className="min-h-full flex flex-col" style={{ height: "100vh" }}>
      {toast && <div className="fixed top-4 right-4 z-50 bg-slate-900 text-white text-sm px-4 py-3 rounded-xl shadow-lg">{toast}</div>}

      {/* Header */}
      <div className="px-8 py-6 text-white shrink-0" style={{ background: "linear-gradient(135deg, #6366f1 0%, #0ea5e9 100%)" }}>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="w-5 h-5 opacity-80" />
              <span className="text-sm font-medium opacity-80 uppercase tracking-wide">AI Assistant</span>
            </div>
            <h1 className="text-2xl font-bold">GTM Strategy Chat</h1>
            <p className="text-indigo-100 text-sm mt-1">Ask anything about referral growth, campaigns, SEO, or patient acquisition</p>
          </div>
          {messages.length > 0 && (
            <button onClick={handleClear}
              className="flex items-center gap-2 px-3 py-2 bg-white/15 hover:bg-white/25 text-white rounded-xl text-sm border border-white/20">
              <Trash2 className="w-4 h-4" />Clear
            </button>
          )}
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-8 space-y-4 min-h-0">
        {messages.length === 0 ? (
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-8 pt-8">
              <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ background: "linear-gradient(135deg, #6366f1, #0ea5e9)" }}>
                <Sparkles className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-xl font-semibold text-slate-800 mb-2">How can I help you grow?</h2>
              <p className="text-slate-500 text-sm">Ask me anything about your GTM strategy, campaigns, or patient acquisition.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {SUGGESTED_PROMPTS.map((prompt, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(prompt)}
                  className="text-left p-4 rounded-xl border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 transition-all group"
                >
                  <p className="text-sm text-slate-700 group-hover:text-indigo-700">{prompt}</p>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto space-y-4">
            {messages.map((msg) => (
              <div key={msg.id} className={cn("flex gap-3", msg.role === "user" ? "flex-row-reverse" : "")}>
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold",
                  msg.role === "user"
                    ? "bg-indigo-600 text-white"
                    : "bg-gradient-to-br from-indigo-500 to-sky-500 text-white"
                )}>
                  {msg.role === "user" ? "U" : "AI"}
                </div>
                <div className={cn(
                  "max-w-lg rounded-2xl px-4 py-3 text-sm leading-relaxed",
                  msg.role === "user"
                    ? "bg-indigo-600 text-white rounded-tr-sm"
                    : "bg-white border border-slate-200 text-slate-800 rounded-tl-sm shadow-sm"
                )}>
                  {msg.content.split("\n").map((line: string, i: number) => (
                    <span key={i}>{line}{i < msg.content.split("\n").length - 1 ? <br /> : null}</span>
                  ))}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold bg-gradient-to-br from-indigo-500 to-sky-500 text-white">AI</div>
                <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: "0ms" }} />
                    <div className="w-2 h-2 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: "150ms" }} />
                    <div className="w-2 h-2 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="px-8 py-5 border-t border-slate-200 bg-white shrink-0">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-end gap-3 p-3 rounded-2xl border border-slate-300 focus-within:border-indigo-400 transition-colors bg-white shadow-sm">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your GTM strategy…"
              rows={1}
              className="flex-1 resize-none text-sm text-slate-800 placeholder-slate-400 outline-none leading-relaxed min-h-[24px] max-h-32 overflow-auto"
              style={{ background: "transparent" }}
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || loading}
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-all disabled:opacity-40"
              style={{ background: "linear-gradient(135deg, #6366f1, #0ea5e9)" }}
            >
              <Send className="w-4 h-4 text-white" />
            </button>
          </div>
          <p className="text-xs text-slate-400 mt-2 text-center">Press Enter to send · Shift+Enter for new line</p>
        </div>
      </div>
    </div>
  );
}
