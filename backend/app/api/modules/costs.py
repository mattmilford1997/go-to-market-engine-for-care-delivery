"""
Campaign Cost Tracking & Estimator Module.

Tracks actual spend (ad spend + AI API costs) per campaign and historically,
and estimates what a planned campaign will cost before you launch it.

Endpoints:
  GET  /{company_id}/summary          — KPIs: total spend, AI cost, ad spend, CAC
  GET  /{company_id}/history          — Week-by-week or month-by-month spend chart data
  GET  /{company_id}/by-campaign      — Per-campaign cost breakdown
  POST /{company_id}/estimate         — Estimate cost for a planned campaign volume
  GET  /cost-rates                    — Raw rate cards for every channel + AI provider
"""
from __future__ import annotations

import random
from datetime import date, timedelta
from fastapi import APIRouter

router = APIRouter(prefix="/costs", tags=["costs"])

# ── Rate cards ────────────────────────────────────────────────────────────────

CHANNEL_RATES: dict[str, dict] = {
    "fax": {
        "label": "E-Fax",
        "provider": "OpenFax",
        "unit": "per page",
        "unit_short": "page",
        "cost_low": 0.07,
        "cost_mid": 0.09,
        "cost_high": 0.12,
        "color": "#3b82f6",
        # How many tokens the AI uses to generate one fax sheet
        "ai_input_tokens": 650,
        "ai_output_tokens": 900,
    },
    "email": {
        "label": "Email Outreach",
        "provider": "Instantly",
        "unit": "per email",
        "unit_short": "email",
        "monthly_platform_fee": 97.00,
        "cost_per_send": 0.00,        # included in subscription up to 100k/mo
        "cost_overage_per_send": 0.001,
        "color": "#8b5cf6",
        "ai_input_tokens": 800,
        "ai_output_tokens": 3500,     # 7-email sequence per campaign
    },
    "voicemail": {
        "label": "Ringless Voicemail",
        "provider": "Slybroadcast",
        "unit": "per drop",
        "unit_short": "drop",
        "cost_low": 0.09,
        "cost_mid": 0.12,
        "cost_high": 0.15,
        "tts_cost_per_char": 0.000180,  # ElevenLabs ~$0.18 per 1k chars; avg script 450 chars
        "color": "#10b981",
        "ai_input_tokens": 400,
        "ai_output_tokens": 600,
    },
    "mail": {
        "label": "Direct Mail",
        "provider": "Lob",
        "unit": "per postcard",
        "unit_short": "piece",
        "cost_low": 0.45,
        "cost_mid": 0.65,
        "cost_high": 0.75,
        "color": "#f59e0b",
        "ai_input_tokens": 500,
        "ai_output_tokens": 700,
    },
    "google_ads": {
        "label": "Google Ads",
        "provider": "Google",
        "unit": "per click (CPC)",
        "unit_short": "click",
        "cost_low": 8.00,
        "cost_mid": 15.00,
        "cost_high": 22.00,
        "color": "#ef4444",
        "ai_input_tokens": 1200,
        "ai_output_tokens": 1800,
    },
    "meta_ads": {
        "label": "Meta Ads",
        "provider": "Meta",
        "unit": "per click (CPC)",
        "unit_short": "click",
        "cost_low": 2.00,
        "cost_mid": 5.00,
        "cost_high": 8.00,
        "color": "#1877f2",
        "ai_input_tokens": 800,
        "ai_output_tokens": 1200,
    },
    "tiktok_ads": {
        "label": "TikTok Ads",
        "provider": "TikTok",
        "unit": "per click (CPC)",
        "unit_short": "click",
        "cost_low": 0.50,
        "cost_mid": 1.50,
        "cost_high": 3.00,
        "color": "#010101",
        "ai_input_tokens": 600,
        "ai_output_tokens": 900,
    },
    "linkedin_ads": {
        "label": "LinkedIn Ads",
        "provider": "LinkedIn",
        "unit": "per click (CPC)",
        "unit_short": "click",
        "cost_low": 5.00,
        "cost_mid": 8.00,
        "cost_high": 14.00,
        "color": "#0077b5",
        "ai_input_tokens": 700,
        "ai_output_tokens": 1000,
    },
}

AI_PROVIDER_RATES: dict[str, dict] = {
    "anthropic": {
        "label": "Claude (Anthropic)",
        "input_per_million":  3.00,    # claude-sonnet-4-6
        "output_per_million": 15.00,
    },
    "openai": {
        "label": "ChatGPT (OpenAI)",
        "input_per_million":  2.50,    # gpt-4o
        "output_per_million": 10.00,
    },
    "gemini": {
        "label": "Gemini (Google)",
        "input_per_million":  0.075,   # gemini-2.0-flash
        "output_per_million": 0.300,
    },
}

# ── Demo campaign data ────────────────────────────────────────────────────────

def _rand(seed_offset: int, low: float, high: float) -> float:
    """Seeded pseudo-random for reproducible demo data."""
    r = (seed_offset * 6364136223846793005 + 1442695040888963407) & 0xFFFFFFFF
    return round(low + (r / 0xFFFFFFFF) * (high - low), 2)


DEMO_CAMPAIGNS: list[dict] = [
    {
        "id": "camp-fax-scottsdale",
        "name": "Fax — Scottsdale PCPs",
        "channel": "fax",
        "status": "completed",
        "launched": "2026-02-03",
        "volume": 312,          # pages sent
        "ad_spend": 28.08,      # 312 × $0.09
        "ai_cost": 0.19,
        "total_cost": 28.27,
        "referrals_generated": 3,
        "cac": 9.42,
    },
    {
        "id": "camp-email-pcps",
        "name": "Email Sequence — Phoenix PCPs",
        "channel": "email",
        "status": "active",
        "launched": "2026-02-05",
        "volume": 420,          # emails sent (7-step × 60 providers)
        "ad_spend": 0.00,       # covered by subscription
        "platform_fee": 97.00,  # prorated
        "ai_cost": 0.62,
        "total_cost": 97.62,
        "referrals_generated": 7,
        "cac": 13.95,
    },
    {
        "id": "camp-google-tms",
        "name": "Google Ads — TMS Keywords",
        "channel": "google_ads",
        "status": "active",
        "launched": "2026-01-15",
        "volume": 284,          # clicks
        "ad_spend": 4260.00,    # 284 × $15
        "ai_cost": 0.74,
        "total_cost": 4260.74,
        "referrals_generated": 31,
        "cac": 137.44,
    },
    {
        "id": "camp-meta-anxiety",
        "name": "Meta Ads — Anxiety Targeting",
        "channel": "meta_ads",
        "status": "active",
        "launched": "2026-02-12",
        "volume": 612,          # clicks
        "ad_spend": 3060.00,    # 612 × $5
        "ai_cost": 0.32,
        "total_cost": 3060.32,
        "referrals_generated": 28,
        "cac": 109.30,
    },
    {
        "id": "camp-voicemail-phoenix",
        "name": "Voicemail Drop — Phoenix PCPs",
        "channel": "voicemail",
        "status": "completed",
        "launched": "2026-02-10",
        "volume": 180,
        "ad_spend": 21.60,      # 180 × $0.12
        "tts_cost": 8.10,       # 450 chars × $0.00018 × 100 scripts
        "ai_cost": 0.11,
        "total_cost": 29.81,
        "referrals_generated": 2,
        "cac": 14.91,
    },
    {
        "id": "camp-fax-tempe",
        "name": "Fax — Tempe Therapists",
        "channel": "fax",
        "status": "active",
        "launched": "2026-02-21",
        "volume": 156,
        "ad_spend": 14.04,
        "ai_cost": 0.10,
        "total_cost": 14.14,
        "referrals_generated": 1,
        "cac": 14.14,
    },
    {
        "id": "camp-tiktok-genz",
        "name": "TikTok Ads — Gen Z Anxiety",
        "channel": "tiktok_ads",
        "status": "scheduled",
        "launched": "2026-03-12",
        "volume": 0,
        "ad_spend": 0.00,
        "ai_cost": 0.08,
        "total_cost": 0.08,
        "referrals_generated": 0,
        "cac": 0,
    },
    {
        "id": "camp-linkedin-pcps",
        "name": "LinkedIn — PCP Outreach",
        "channel": "linkedin_ads",
        "status": "scheduled",
        "launched": "2026-03-15",
        "volume": 0,
        "ad_spend": 0.00,
        "ai_cost": 0.09,
        "total_cost": 0.09,
        "referrals_generated": 0,
        "cac": 0,
    },
]


def _build_history(periods: int, view: str) -> list[dict]:
    """Build weekly or monthly historical cost data."""
    today = date.today()
    entries = []

    for i in range(periods):
        if view == "weekly":
            week_start = today - timedelta(weeks=periods - i - 1)
            week_start -= timedelta(days=week_start.weekday())  # Monday
            label = f"Wk {week_start.strftime('%b %d')}"
            # Costs grow slightly over time (marketing ramp-up)
            base_ad = 500 + (i * 180) + _rand(i * 7, -80, 120)
            base_fax = 40 + _rand(i * 13, -10, 20)
            base_email = 97 + _rand(i * 3, 0, 0)     # flat sub fee
            base_vm = 15 + _rand(i * 17, -5, 10)
            base_ai = round(0.80 + _rand(i * 19, 0, 0.40), 2)
        else:
            month_start = (today.replace(day=1) - timedelta(days=1)).replace(day=1)
            month_start = month_start.replace(
                month=((month_start.month - (periods - i - 2) - 1) % 12) + 1
            )
            label = month_start.strftime("%b %Y")
            base_ad = 2200 + (i * 700) + _rand(i * 7, -300, 500)
            base_fax = 180 + _rand(i * 13, -40, 80)
            base_email = 97 + _rand(i * 3, 0, 0)
            base_vm = 65 + _rand(i * 17, -15, 30)
            base_ai = round(3.20 + _rand(i * 19, 0, 1.80), 2)

        ad_spend = round(max(0, base_ad), 2)
        channel_spend = round(max(0, base_fax + base_email + base_vm), 2)
        ai_cost = max(0.1, base_ai)
        total = round(ad_spend + channel_spend + ai_cost, 2)

        entries.append({
            "label":        label,
            "ad_spend":     ad_spend,
            "channel_spend": channel_spend,
            "ai_cost":      ai_cost,
            "total":        total,
        })

    return entries


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/cost-rates")
async def get_cost_rates():
    """Return the rate card for every channel and AI provider."""
    return {
        "channels":     CHANNEL_RATES,
        "ai_providers": AI_PROVIDER_RATES,
    }


@router.get("/{company_id}/summary")
async def get_cost_summary(company_id: str):
    """KPI summary: total historical spend, this month, AI spend, blended CAC."""
    active = [c for c in DEMO_CAMPAIGNS if c["status"] != "scheduled"]

    total_historical = 14_872.44   # demo total
    this_month = sum(c["total_cost"] for c in active)
    total_ad_spend = sum(c.get("ad_spend", 0) for c in active)
    total_ai_cost = sum(c.get("ai_cost", 0) for c in active) + sum(
        c.get("tts_cost", 0) for c in active
    )
    total_referrals = sum(c.get("referrals_generated", 0) for c in active)
    blended_cac = round(this_month / max(total_referrals, 1), 2)

    monthly_history = _build_history(6, "monthly")
    mom_change = 0.0
    if len(monthly_history) >= 2:
        prev = monthly_history[-2]["total"]
        curr = monthly_history[-1]["total"]
        mom_change = round(((curr - prev) / max(prev, 1)) * 100, 1)

    return {
        "total_historical":    total_historical,
        "this_month":          round(this_month, 2),
        "total_ad_spend":      round(total_ad_spend, 2),
        "total_ai_cost":       round(total_ai_cost, 2),
        "total_channel_fees":  97.00,   # email platform sub
        "total_referrals":     total_referrals,
        "blended_cac":         blended_cac,
        "mom_change_pct":      mom_change,
        "active_campaigns":    len([c for c in active if c["status"] == "active"]),
    }


@router.get("/{company_id}/history")
async def get_cost_history(
    company_id: str,
    view: str = "weekly",
    periods: int = 12,
):
    """Historical cost data for charting. view=weekly|monthly, periods=4-26."""
    periods = max(4, min(periods, 26))
    if view not in ("weekly", "monthly"):
        view = "weekly"

    history = _build_history(periods, view)

    totals = {
        "ad_spend":      round(sum(h["ad_spend"] for h in history), 2),
        "channel_spend": round(sum(h["channel_spend"] for h in history), 2),
        "ai_cost":       round(sum(h["ai_cost"] for h in history), 2),
        "total":         round(sum(h["total"] for h in history), 2),
    }
    return {
        "view":    view,
        "periods": periods,
        "data":    history,
        "totals":  totals,
    }


@router.get("/{company_id}/by-campaign")
async def get_costs_by_campaign(company_id: str):
    """Per-campaign cost breakdown with ROI metrics."""
    return {
        "campaigns": DEMO_CAMPAIGNS,
        "totals": {
            "ad_spend":  round(sum(c.get("ad_spend", 0) for c in DEMO_CAMPAIGNS), 2),
            "ai_cost":   round(sum(c.get("ai_cost", 0) + c.get("tts_cost", 0) for c in DEMO_CAMPAIGNS), 2),
            "total":     round(sum(c["total_cost"] for c in DEMO_CAMPAIGNS), 2),
            "referrals": sum(c.get("referrals_generated", 0) for c in DEMO_CAMPAIGNS),
        },
    }


@router.post("/{company_id}/estimate")
async def estimate_campaign_cost(company_id: str, data: dict):
    """
    Estimate the cost of a planned campaign before launching.

    Body:
      {
        "channel":   "fax" | "email" | "voicemail" | "mail" | "google_ads" | "meta_ads" | ...,
        "volume":    10000,        # pages / emails / drops / clicks
        "ai_provider": "anthropic" | "openai" | "gemini",  # optional
        "include_tts": true        # voicemail only — include ElevenLabs cost
      }
    """
    channel = data.get("channel", "fax").lower()
    volume = max(1, int(data.get("volume", 1000)))
    ai_provider = data.get("ai_provider", "anthropic")
    include_tts = bool(data.get("include_tts", True))

    if channel not in CHANNEL_RATES:
        channel = "fax"
    if ai_provider not in AI_PROVIDER_RATES:
        ai_provider = "anthropic"

    ch = CHANNEL_RATES[channel]
    ai = AI_PROVIDER_RATES[ai_provider]

    # ── Channel / media cost ──────────────────────────────────────────────────
    if channel in ("google_ads", "meta_ads", "tiktok_ads", "linkedin_ads"):
        # volume = number of clicks
        cost_low  = round(volume * ch["cost_low"], 2)
        cost_mid  = round(volume * ch["cost_mid"], 2)
        cost_high = round(volume * ch["cost_high"], 2)
        media_label = f"{volume:,} clicks × {ch['unit']}"
    elif channel == "email":
        monthly_fee = ch.get("monthly_platform_fee", 97.00)
        overage = max(0, volume - 100_000) * ch.get("cost_overage_per_send", 0.001)
        cost_low = cost_mid = cost_high = round(monthly_fee + overage, 2)
        media_label = f"Monthly platform + {volume:,} emails"
    else:
        cost_low  = round(volume * ch["cost_low"],  2)
        cost_mid  = round(volume * ch["cost_mid"],  2)
        cost_high = round(volume * ch["cost_high"], 2)
        media_label = f"{volume:,} {ch['unit_short']}s × {ch['unit']}"

    # ── AI generation cost ────────────────────────────────────────────────────
    # One LLM call generates the template; cost scales minimally beyond that.
    ai_calls = 1 if volume <= 1000 else (1 + volume // 5000)
    ai_input_tokens  = ch["ai_input_tokens"]  * ai_calls
    ai_output_tokens = ch["ai_output_tokens"] * ai_calls
    ai_cost = round(
        (ai_input_tokens  / 1_000_000) * ai["input_per_million"] +
        (ai_output_tokens / 1_000_000) * ai["output_per_million"],
        4,
    )

    # ── TTS cost (voicemail only) ─────────────────────────────────────────────
    tts_cost = 0.0
    tts_breakdown: dict = {}
    if channel == "voicemail" and include_tts:
        avg_chars = 450   # ~90-word script
        tts_cost_per_char = ch.get("tts_cost_per_char", 0.000180)
        tts_cost = round(avg_chars * tts_cost_per_char * min(volume, 3), 4)
        tts_breakdown = {
            "provider": "ElevenLabs",
            "unit": "per character",
            "characters": avg_chars * min(volume, 3),
            "cost_per_char": tts_cost_per_char,
            "subtotal": tts_cost,
        }

    # ── Totals ────────────────────────────────────────────────────────────────
    total_low  = round(cost_low  + ai_cost + tts_cost, 2)
    total_mid  = round(cost_mid  + ai_cost + tts_cost, 2)
    total_high = round(cost_high + ai_cost + tts_cost, 2)

    # Cost per referral estimate (using channel benchmark CAC from ROI module)
    cac_benchmarks = {
        "fax": 28, "email": 12, "voicemail": 35, "mail": 65,
        "google_ads": 140, "meta_ads": 110, "tiktok_ads": 85,
        "linkedin_ads": 160,
    }
    est_cac = cac_benchmarks.get(channel, 50)
    est_referrals_mid = max(1, round(cost_mid / est_cac))

    return {
        "channel":     channel,
        "channel_label": ch["label"],
        "provider":    ch["provider"],
        "volume":      volume,
        "media_label": media_label,
        "ai_provider_label": ai["label"],

        "breakdown": {
            "media_cost":  {"low": cost_low, "mid": cost_mid, "high": cost_high, "label": media_label},
            "ai_cost":     {"value": ai_cost, "tokens_input": ai_input_tokens, "tokens_output": ai_output_tokens, "provider": ai["label"]},
            "tts_cost":    tts_breakdown if tts_breakdown else None,
            "platform_fee": {"value": ch.get("monthly_platform_fee", 0), "label": ch.get("provider", "")} if channel == "email" else None,
        },

        "totals": {
            "low":  total_low,
            "mid":  total_mid,
            "high": total_high,
        },

        "estimates": {
            "cac_benchmark": est_cac,
            "referrals_expected_mid": est_referrals_mid,
            "cost_per_referral_mid": round(total_mid / max(est_referrals_mid, 1), 2),
        },

        "notes": _get_notes(channel, volume),
    }


def _get_notes(channel: str, volume: int) -> list[str]:
    notes: dict[str, list[str]] = {
        "fax": [
            "Cost assumes 1 page per recipient. Multi-page cover sheets are billed per page.",
            "Rate shown is OpenFax standard pricing — volume discounts apply over 5,000 pages/month.",
            "Add $97/month for the Instantly email platform if running fax + email concurrently.",
        ],
        "email": [
            "Instantly subscription covers up to 100,000 emails/month. Overages billed at $0.001/email.",
            "AI generates the full 7-email sequence once — cost doesn't scale with send volume.",
            "TCPA/CAN-SPAM footer and unsubscribe handling included.",
        ],
        "voicemail": [
            "Slybroadcast pricing: $0.09–$0.15 per drop depending on plan.",
            "TTS (ElevenLabs) generates up to 3 voice script variants — cost is per script, not per drop.",
            "TCPA quiet hours (8pm–8am) enforced automatically by the spam prevention module.",
        ],
        "mail": [
            "Lob pricing includes print, postage, and mailing for 4×6 postcards.",
            "Volume discounts start at 500 pieces/month.",
            "Typical lead time is 5–7 business days from launch to in-mailbox.",
        ],
        "google_ads": [
            "Healthcare CPC varies: $8–$22 depending on keyword competition and quality score.",
            "Bid toward $140 CAC to stay profitable on a $3,200 patient LTV.",
            "AI generates 15 headlines + 4 descriptions in one call — negligible AI cost.",
        ],
        "meta_ads": [
            "Meta healthcare ads require prior authorization for certain condition targeting.",
            "CPC $2–$8; CPM-optimized campaigns typically perform better for awareness.",
            "Creative refresh recommended every 4–6 weeks to prevent ad fatigue.",
        ],
        "tiktok_ads": [
            "TikTok minimum daily budget is $50/campaign.",
            "Best for 15–30 second video creative. Add ElevenLabs TTS for voiceover (~$0.15/script).",
            "CPC lower than Meta but conversion rates depend heavily on landing page speed.",
        ],
        "linkedin_ads": [
            "LinkedIn minimum bid is $2/click but healthcare B2B typically runs $5–$14 CPC.",
            "Best for targeting PCPs, therapists, and EAP program managers by job title.",
            "Audience size under 300,000 often raises CPM — expand with lookalike targeting.",
        ],
    }
    return notes.get(channel, [
        "Cost estimates based on current platform pricing. Rates may vary.",
    ])
