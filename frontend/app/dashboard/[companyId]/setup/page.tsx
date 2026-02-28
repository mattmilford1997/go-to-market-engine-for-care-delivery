"use client";
import { useState } from "react";
import { CheckCircle2, ExternalLink, ChevronDown, ChevronRight, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface Step {
  num: number;
  label: string;
  url: string;
  envKey: string;
  desc: string;
  steps: string[];
  note?: string;
  screenshot?: string;  // alt text / description of where to look
}

const SECTIONS: {
  title: string;
  icon: string;
  color: string;
  bg: string;
  border: string;
  keys: Step[];
}[] = [
  {
    title: "AI Engine",
    icon: "🤖",
    color: "text-violet-700",
    bg: "bg-violet-50",
    border: "border-violet-200",
    keys: [
      {
        num: 1,
        label: "Anthropic API Key",
        url: "https://console.anthropic.com/settings/keys",
        envKey: "ANTHROPIC_API_KEY",
        desc: "Powers all AI copy, sequence generation, strategy, and chat features. Claude Sonnet 4.6 is the default bulk model.",
        steps: [
          'Go to console.anthropic.com and sign in (or create an account).',
          'Click your workspace name in the top-left, then open "API Keys" from the left sidebar.',
          'Click "Create Key", give it a name like "GTM Engine", and copy the key.',
          'Paste the key into Settings → AI Engine → Claude card, or set ANTHROPIC_API_KEY in your .env file.',
        ],
        note: 'New accounts receive $5 free credits. Production usage requires a credit card on file.',
        screenshot: 'The key begins with "sk-ant-api03-…"',
      },
      {
        num: 2,
        label: "OpenAI API Key",
        url: "https://platform.openai.com/api-keys",
        envKey: "OPENAI_API_KEY",
        desc: "Optional — switch to GPT-4o in Settings → AI Engine → ChatGPT card.",
        steps: [
          'Go to platform.openai.com and sign in.',
          'Click your profile icon (top right) → "API keys" from the left menu.',
          'Click "Create new secret key", name it, and copy it immediately (shown once only).',
          'Paste it into Settings → AI Engine → ChatGPT card, or set OPENAI_API_KEY in .env.',
        ],
        note: 'Keys start with "sk-…". Usage billed per million tokens — GPT-4o is $2.50 input / $10 output.',
        screenshot: 'Navigate to platform.openai.com/api-keys. The "Create new secret key" button is blue, top-right of the table.',
      },
      {
        num: 3,
        label: "Google AI (Gemini) API Key",
        url: "https://aistudio.google.com/app/apikey",
        envKey: "GOOGLE_AI_API_KEY",
        desc: "Optional — switch to Gemini 2.0 Flash in Settings → AI Engine → Gemini card. Cheapest option.",
        steps: [
          'Go to aistudio.google.com and sign in with your Google account.',
          'Click "Get API key" in the left sidebar.',
          'Click "Create API key in new project" (or select an existing Google Cloud project).',
          'Copy the key and paste it into Settings → AI Engine → Gemini card, or set GOOGLE_AI_API_KEY in .env.',
        ],
        note: 'Gemini 2.0 Flash is extremely affordable: $0.075 input / $0.30 output per million tokens.',
        screenshot: 'After clicking "Get API key", the key appears in a dialog box starting with "AIzaSy…".',
      },
    ],
  },
  {
    title: "Outreach Channels",
    icon: "📡",
    color: "text-blue-700",
    bg: "bg-blue-50",
    border: "border-blue-200",
    keys: [
      {
        num: 4,
        label: "OpenFax API Key",
        url: "https://www.openfax.com/developers",
        envKey: "OPENFAX_API_KEY",
        desc: "Sends fax campaigns to PCPs, specialists, and referral partners. ~$0.07–$0.12 per page.",
        steps: [
          'Sign up at openfax.com and choose a plan.',
          'Go to Account → Developer / API settings.',
          'Click "Generate API Key" and copy the key.',
          'Add it to Settings → Credentials → Referral (Fax) section.',
        ],
        note: 'You will also need to set up a sender fax number. OpenFax provides one with your account.',
        screenshot: 'The API key is in the "Developer" tab of your OpenFax dashboard.',
      },
      {
        num: 5,
        label: "Instantly API Key",
        url: "https://app.instantly.ai/app/settings/integrations",
        envKey: "INSTANTLY_API_KEY",
        desc: "Powers email outreach sequences. $97/month flat covers up to 100,000 emails/month.",
        steps: [
          'Log into app.instantly.ai.',
          'Go to Settings (gear icon) → Integrations.',
          'Scroll to "API" section and click "Generate API Key".',
          'Copy the key and add it to Settings → Credentials → Referral (Email) section.',
        ],
        note: 'You must also connect your sending email accounts in Instantly → Email Accounts before campaigns will send.',
        screenshot: 'The integrations page shows a section called "Instantly API" with a masked key and copy button.',
      },
      {
        num: 6,
        label: "Slybroadcast Credentials",
        url: "https://www.slybroadcast.com",
        envKey: "SLYBROADCAST_EMAIL + SLYBROADCAST_PASSWORD",
        desc: "Sends ringless voicemail drops. $0.09–$0.15 per drop.",
        steps: [
          'Create an account at slybroadcast.com and add credits.',
          'Your login email and password are the credentials used by the API.',
          'Add them to Settings → Credentials → Referral (Voicemail) section.',
        ],
        note: 'Slybroadcast uses basic auth (email + password) rather than a separate API key.',
        screenshot: 'Your Slybroadcast login is the same email and password you use to log into the web dashboard.',
      },
      {
        num: 7,
        label: "Lob API Key",
        url: "https://dashboard.lob.com/settings/api-keys",
        envKey: "LOB_API_KEY",
        desc: "Sends direct mail (postcards, letters). ~$0.45–$0.75 per postcard including print and postage.",
        steps: [
          'Sign in at dashboard.lob.com.',
          'Go to Settings → API Keys.',
          'Copy your Live API key (starts with "live_…") for production, or Test key for testing.',
          'Add it to Settings → Credentials → Referral (Direct Mail) section.',
        ],
        note: 'Use the Test key first — it won\'t charge you or send real mail. Switch to Live for production.',
        screenshot: 'Settings → API Keys shows separate "Test" and "Live" key sections. Copy the "Live" key for production.',
      },
    ],
  },
  {
    title: "Paid Advertising",
    icon: "📢",
    color: "text-orange-700",
    bg: "bg-orange-50",
    border: "border-orange-200",
    keys: [
      {
        num: 8,
        label: "Google Ads Developer Token",
        url: "https://ads.google.com/home/tools/manager-accounts/",
        envKey: "GOOGLE_ADS_DEVELOPER_TOKEN + GOOGLE_ADS_CUSTOMER_ID",
        desc: "Required to push generated Google Ads campaigns directly to your Google Ads account.",
        steps: [
          'Sign in to Google Ads (ads.google.com) with a Manager (MCC) account.',
          'Go to Tools & Settings (wrench icon) → Setup → API Center.',
          'Click "Apply for basic access" if you haven\'t already. Approval takes 1–2 business days.',
          'Once approved, copy your Developer Token from the API Center page.',
          'Also copy your Customer ID (10-digit number shown in the top-right of Google Ads).',
          'Add both to Settings → Credentials → Paid Ads (Google) section.',
        ],
        note: 'You need a Manager (MCC) account — a regular Google Ads account does not have API access.',
        screenshot: 'Tools & Settings → API Center. The developer token is a 22-character string.',
      },
      {
        num: 9,
        label: "Meta App ID & App Secret",
        url: "https://developers.facebook.com/apps/",
        envKey: "META_APP_ID + META_APP_SECRET + META_ACCESS_TOKEN",
        desc: "Required to create and manage Meta (Facebook/Instagram) ad campaigns.",
        steps: [
          'Go to developers.facebook.com and log in.',
          'Click "My Apps" → "Create App". Choose "Business" as the app type.',
          'Fill in the app name and business email, then click "Create app".',
          'In your app dashboard, click "Settings" → "Basic" to find your App ID and App Secret.',
          'For the access token: Go to Tools → Graph API Explorer, select your app, and generate a User token with "ads_management" permission.',
          'Add App ID, App Secret, and Access Token to Settings → Credentials → Paid Ads (Meta) section.',
        ],
        note: 'The access token expires. For production, generate a long-lived system user token via Business Manager.',
        screenshot: 'App ID is shown at the top of the Basic Settings page. App Secret is revealed by clicking "Show".',
      },
    ],
  },
  {
    title: "Voice & Media",
    icon: "🎙️",
    color: "text-emerald-700",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    keys: [
      {
        num: 10,
        label: "ElevenLabs API Key",
        url: "https://elevenlabs.io/app/settings/api-keys",
        envKey: "ELEVENLABS_API_KEY",
        desc: "Generates realistic AI voiceover audio for ringless voicemail campaigns. ~$0.18 per 1,000 characters.",
        steps: [
          'Sign up at elevenlabs.io (free tier available with 10,000 chars/month).',
          'Go to Profile → API Keys (bottom left of the dashboard).',
          'Click "Create API Key", name it, and copy the key.',
          'Add it to Settings → Credentials → Voice (ElevenLabs) section.',
        ],
        note: 'The free tier is enough for testing. Production voicemail campaigns need a Starter plan ($5/month).',
        screenshot: 'The API key section is in the lower-left of the ElevenLabs app, under your profile icon.',
      },
    ],
  },
  {
    title: "SEO & Analytics",
    icon: "📊",
    color: "text-sky-700",
    bg: "bg-sky-50",
    border: "border-sky-200",
    keys: [
      {
        num: 11,
        label: "Google PageSpeed API Key",
        url: "https://console.cloud.google.com/apis/library/pagespeedonline.googleapis.com",
        envKey: "PAGESPEED_API_KEY",
        desc: "Powers the SEO → PageSpeed audit feature. Free tier allows 25,000 requests/day.",
        steps: [
          'Go to console.cloud.google.com and select or create a project.',
          'In the left menu, go to APIs & Services → Library.',
          'Search for "PageSpeed Insights API" and click Enable.',
          'Go to APIs & Services → Credentials → "+ Create Credentials" → "API Key".',
          'Copy the generated key and add it to Settings → Credentials → SEO section.',
        ],
        note: 'Restrict the API key to only the PageSpeed Insights API in the Google Console for security.',
        screenshot: 'After clicking "Create Credentials → API Key", a dialog shows the key. Copy it before closing.',
      },
      {
        num: 12,
        label: "Google Search Console (OAuth)",
        url: "https://search.google.com/search-console",
        envKey: "GOOGLE_SEARCH_CONSOLE_CREDENTIALS",
        desc: "Pulls real keyword rankings and impressions data for SEO reports.",
        steps: [
          'Go to search.google.com/search-console and verify your website.',
          'In the Google Cloud Console, enable the "Google Search Console API".',
          'Create OAuth 2.0 credentials (Web Application) and add your redirect URI.',
          'Download the credentials JSON and add the path to your .env file.',
        ],
        note: 'OAuth setup is more complex — see the Google Search Console API documentation for the full guide.',
        screenshot: 'GSC verification: choose "URL prefix" method and add a DNS TXT record or upload an HTML file.',
      },
    ],
  },
];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        });
      }}
      className="flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors font-mono"
    >
      {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
      {text}
    </button>
  );
}

function KeyCard({ step, defaultOpen }: { step: Step; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen || false);
  const [done, setDone] = useState(false);

  return (
    <div className={cn(
      "rounded-xl border transition-all",
      done ? "border-emerald-200 bg-emerald-50/40" : "border-gray-200 bg-white"
    )}>
      <button
        onClick={() => setOpen((p) => !p)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left"
      >
        <span className={cn(
          "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
          done ? "bg-emerald-500 text-white" : "bg-gray-100 text-gray-600"
        )}>
          {done ? <CheckCircle2 className="w-4 h-4" /> : step.num}
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 text-sm">{step.label}</p>
          <p className="text-xs text-gray-500 mt-0.5 truncate">{step.desc}</p>
        </div>
        <CopyButton text={step.envKey} />
        <a
          href={step.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 shrink-0 border border-blue-200 px-2.5 py-1 rounded-lg hover:bg-blue-50 transition-colors"
        >
          Get key <ExternalLink className="w-3 h-3" />
        </a>
        {open ? <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />}
      </button>

      {open && (
        <div className="px-5 pb-5 border-t border-gray-100 pt-4 space-y-4">
          {/* Steps */}
          <ol className="space-y-2">
            {step.steps.map((s, i) => (
              <li key={i} className="flex items-start gap-3 text-sm text-gray-700">
                <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                  {i + 1}
                </span>
                {s}
              </li>
            ))}
          </ol>

          {/* Screenshot hint */}
          {step.screenshot && (
            <div className="flex items-start gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
              <span className="text-base leading-none mt-0.5">🔍</span>
              <span><strong>Where to look:</strong> {step.screenshot}</span>
            </div>
          )}

          {/* Note */}
          {step.note && (
            <div className="flex items-start gap-2 px-3 py-2.5 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800">
              <span className="text-base leading-none mt-0.5">💡</span>
              <span>{step.note}</span>
            </div>
          )}

          {/* Mark done */}
          <button
            onClick={() => setDone((p) => !p)}
            className={cn(
              "flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-lg border transition-colors",
              done
                ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-white"
                : "bg-white text-gray-600 border-gray-200 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200"
            )}
          >
            <CheckCircle2 className="w-4 h-4" />
            {done ? "Marked complete ✓" : "Mark as done"}
          </button>
        </div>
      )}
    </div>
  );
}

export default function SetupPage() {
  const totalKeys = SECTIONS.reduce((s, sec) => s + sec.keys.length, 0);

  return (
    <div className="min-h-full">
      {/* Header */}
      <div className="px-8 py-7 text-white" style={{ background: "linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)" }}>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">🔑</span>
              <span className="text-sm font-medium opacity-80 uppercase tracking-wide">Setup Guide</span>
            </div>
            <h1 className="text-2xl font-bold">API Key Setup</h1>
            <p className="text-violet-200 text-sm mt-1">
              Step-by-step guide to finding and configuring each API key — {totalKeys} integrations covered.
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-violet-300">Required keys are marked with their .env variable name.</p>
            <p className="text-xs text-violet-400 mt-0.5">Click "Get key" to open the provider's settings page.</p>
          </div>
        </div>
      </div>

      <div className="p-8 max-w-4xl space-y-8">
        {/* Intro */}
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-5 py-4 text-sm text-indigo-800">
          <p className="font-semibold mb-1">How to use this guide</p>
          <p>
            Expand each key below to see exactly where to find it and how to add it to the platform.
            You can either paste keys into <strong>Settings → Credentials</strong> (they persist only in memory)
            or add them to your <code className="bg-white/60 px-1 rounded">.env</code> file for permanent configuration.
          </p>
        </div>

        {/* Two-column env reference */}
        <div className="bg-gray-900 rounded-xl p-5">
          <p className="text-xs text-gray-400 font-mono mb-3"># .env — paste these variables with your values</p>
          <div className="grid grid-cols-2 gap-x-8 gap-y-1 font-mono text-xs">
            {SECTIONS.flatMap((s) => s.keys).map((k) => (
              k.envKey.includes("+")
                ? k.envKey.split("+").map((kk) => kk.trim()).map((kk) => (
                    <p key={kk} className="text-emerald-400">{kk}=<span className="text-gray-500">your_key_here</span></p>
                  ))
                : [<p key={k.envKey} className="text-emerald-400">{k.envKey}=<span className="text-gray-500">your_key_here</span></p>]
            ))}
          </div>
        </div>

        {/* Sections */}
        {SECTIONS.map((sec) => (
          <div key={sec.title}>
            <div className={cn("flex items-center gap-2 px-4 py-3 rounded-xl border mb-3", sec.bg, sec.border)}>
              <span className="text-xl">{sec.icon}</span>
              <h2 className={cn("font-bold text-base", sec.color)}>{sec.title}</h2>
              <span className={cn("ml-auto text-xs font-medium px-2 py-0.5 rounded-full border", sec.bg, sec.border, sec.color)}>
                {sec.keys.length} {sec.keys.length === 1 ? "key" : "keys"}
              </span>
            </div>
            <div className="space-y-2">
              {sec.keys.map((k, i) => (
                <KeyCard key={k.envKey} step={k} defaultOpen={i === 0 && sec === SECTIONS[0]} />
              ))}
            </div>
          </div>
        ))}

        {/* Footer tip */}
        <div className="bg-gray-50 border border-gray-200 rounded-xl px-5 py-4 text-sm text-gray-600">
          <p className="font-semibold text-gray-800 mb-1">🚀 Quick Start Priority</p>
          <p>
            To get up and running fast, you only <em>need</em> the <strong>Anthropic API key</strong> — everything else is optional
            and activates additional channels. Start with Claude, run your first fax or email campaign, then layer in
            paid ads and voicemail as you scale.
          </p>
        </div>
      </div>
    </div>
  );
}
