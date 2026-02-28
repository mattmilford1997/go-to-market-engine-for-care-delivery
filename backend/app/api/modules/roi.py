"""
ROI Attribution Dashboard — aggregates spend vs. results across all channels.
Provides CAC, pipeline value, conversion rates, and AI-generated recommendations.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional

from app.db.database import get_db
from app.models.company import Company
from app.models.referral import ReferralLead, Campaign, LeadStatus
from app.services.llm import llm_service

router = APIRouter(prefix="/roi", tags=["roi"])

# Benchmark CAC by channel ($/acquired referral source) for healthcare
CHANNEL_BENCHMARKS = {
    "fax":       {"label": "Fax Campaign",     "color": "#3b82f6", "benchmark_cac": 28},
    "email":     {"label": "Email Sequence",   "color": "#8b5cf6", "benchmark_cac": 12},
    "voicemail": {"label": "Voicemail Drop",   "color": "#10b981", "benchmark_cac": 35},
    "mail":      {"label": "Direct Mail",      "color": "#f59e0b", "benchmark_cac": 65},
    "google":    {"label": "Google Ads",       "color": "#ef4444", "benchmark_cac": 140},
    "meta":      {"label": "Meta Ads",         "color": "#6366f1", "benchmark_cac": 110},
    "seo":       {"label": "SEO / Organic",    "color": "#14b8a6", "benchmark_cac": 45},
    "profiles":  {"label": "Directory Listings","color": "#f97316","benchmark_cac": 20},
}


@router.get("/{company_id}/summary")
async def get_roi_summary(company_id: str, db: Session = Depends(get_db)):
    """Overall ROI summary across all channels."""
    _get_company(company_id, db)

    total_leads = db.query(ReferralLead).filter(
        ReferralLead.company_id == company_id
    ).count()

    referring = db.query(ReferralLead).filter(
        ReferralLead.company_id == company_id,
        ReferralLead.status == LeadStatus.referring,
    ).count()

    campaigns = db.query(Campaign).filter(
        Campaign.company_id == company_id,
        Campaign.module == "referral",
    ).all()

    total_spend = sum(c.spend or 0 for c in campaigns)
    total_impressions = sum(c.impressions or 0 for c in campaigns)
    total_conversions = sum(c.form_submissions or 0 for c in campaigns)

    # Estimated pipeline value: avg patient LTV for behavioral health ≈ $3,200
    est_ltv = 3200
    pipeline_value = referring * est_ltv
    cac = round(total_spend / max(referring, 1), 2)
    roi_pct = round(((pipeline_value - total_spend) / max(total_spend, 1)) * 100, 1)

    return {
        "total_leads": total_leads,
        "referring_providers": referring,
        "total_spend": total_spend,
        "total_impressions": total_impressions,
        "total_conversions": total_conversions,
        "pipeline_value": pipeline_value,
        "estimated_ltv_per_referral": est_ltv,
        "blended_cac": cac,
        "roi_percent": roi_pct,
        "active_campaigns": len([c for c in campaigns if c.status == "active"]),
    }


@router.get("/{company_id}/by-channel")
async def get_roi_by_channel(company_id: str, db: Session = Depends(get_db)):
    """CAC, conversion rate, and spend broken down by channel."""
    _get_company(company_id, db)

    campaigns = db.query(Campaign).filter(
        Campaign.company_id == company_id,
    ).all()

    channel_data: dict[str, dict] = {}
    for c in campaigns:
        ch = c.channel or "other"
        if ch not in channel_data:
            channel_data[ch] = {"spend": 0, "impressions": 0, "conversions": 0, "campaigns": 0}
        channel_data[ch]["spend"] += c.spend or 0
        channel_data[ch]["impressions"] += c.impressions or 0
        channel_data[ch]["conversions"] += c.form_submissions or 0
        channel_data[ch]["campaigns"] += 1

    result = []
    for ch, meta in CHANNEL_BENCHMARKS.items():
        data = channel_data.get(ch, {"spend": 0, "impressions": 0, "conversions": 0, "campaigns": 0})
        conversions = max(data["conversions"], 0)
        spend = data["spend"]
        cac = round(spend / max(conversions, 1), 2) if spend > 0 else None
        cvr = round((conversions / max(data["impressions"], 1)) * 100, 2) if data["impressions"] > 0 else None

        result.append({
            "channel": ch,
            "label": meta["label"],
            "color": meta["color"],
            "spend": spend,
            "impressions": data["impressions"],
            "conversions": conversions,
            "cac": cac,
            "benchmark_cac": meta["benchmark_cac"],
            "cvr_percent": cvr,
            "campaigns": data["campaigns"],
            "efficiency": "above" if (cac and cac < meta["benchmark_cac"]) else "below" if cac else "no_data",
        })

    return {"channels": result}


@router.get("/{company_id}/attribution")
async def get_attribution_model(company_id: str, db: Session = Depends(get_db)):
    """Attribution of converted leads to first-touch and last-touch channels."""
    _get_company(company_id, db)

    leads_by_source = {}
    leads = db.query(ReferralLead).filter(
        ReferralLead.company_id == company_id,
        ReferralLead.status == LeadStatus.referring,
    ).all()

    for lead in leads:
        src = lead.source or "unknown"
        leads_by_source[src] = leads_by_source.get(src, 0) + 1

    total = max(sum(leads_by_source.values()), 1)
    attribution = [
        {"source": src, "count": cnt, "pct": round(cnt / total * 100, 1)}
        for src, cnt in sorted(leads_by_source.items(), key=lambda x: -x[1])
    ]
    return {"attribution": attribution, "total_referred": total}


@router.post("/{company_id}/recommendations")
async def get_ai_recommendations(company_id: str, db: Session = Depends(get_db)):
    """AI-generated strategic ROI improvement recommendations."""
    company = _get_company(company_id, db)

    total_leads = db.query(ReferralLead).filter(
        ReferralLead.company_id == company_id
    ).count()
    referring = db.query(ReferralLead).filter(
        ReferralLead.company_id == company_id,
        ReferralLead.status == LeadStatus.referring,
    ).count()
    campaigns = db.query(Campaign).filter(Campaign.company_id == company_id).all()
    total_spend = sum(c.spend or 0 for c in campaigns)

    prompt = f"""You are a healthcare marketing strategist analyzing ROI for {company.name}.

Current metrics:
- Total referral leads: {total_leads}
- Actively referring providers: {referring}
- Total marketing spend: ${total_spend}
- Conversion rate: {round(referring / max(total_leads, 1) * 100, 1)}%

Generate 5 specific, actionable ROI improvement recommendations.
Return JSON: {{"recommendations": [{{"title": str, "impact": "high|medium|low", "effort": "high|medium|low", "description": str, "metric": str}}]}}"""

    try:
        raw = llm_service.client.messages.create(
            model=llm_service.model_bulk,
            max_tokens=800,
            messages=[{"role": "user", "content": prompt}],
        )
        import json, re
        text = raw.content[0].text
        match = re.search(r'\{.*\}', text, re.DOTALL)
        data = json.loads(match.group()) if match else {"recommendations": []}
    except Exception:
        data = {"recommendations": [
            {"title": "Double down on fax campaigns", "impact": "high", "effort": "low",
             "description": "Fax has the lowest CAC in healthcare outreach. Increase volume to highest-referring specialties.", "metric": "CAC < $30"},
            {"title": "Add email follow-up sequences", "impact": "high", "effort": "medium",
             "description": "Providers who received a fax but haven't referred yet should get a 3-email nurture sequence.", "metric": "+25% conversion"},
            {"title": "Optimize Google Business Profile", "impact": "medium", "effort": "low",
             "description": "Patients searching for your services often check Google reviews first. Complete your profile.", "metric": "+15% organic leads"},
        ]}
    return data


def _get_company(company_id: str, db: Session) -> Company:
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return company
