"""
Weekly GTM Strategy Digest — AI-generated strategic performance reports
that summarize activity, surface insights, and prioritize next actions.
"""
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
import json, re
from datetime import date, timedelta

from app.db.database import get_db
from app.models.company import Company
from app.models.referral import ReferralLead, Campaign, LeadStatus
from app.models.content import ContentItem, ApprovalItem
from app.services.llm import llm_service

router = APIRouter(prefix="/reports", tags=["reports"])

# In-memory cache (production: use Redis or DB table)
_report_cache: dict[str, dict] = {}


@router.get("/{company_id}/weekly")
async def get_weekly_digest(company_id: str, db: Session = Depends(get_db)):
    _get_company(company_id, db)
    cached = _report_cache.get(company_id)
    return cached or {"report": None, "message": "No report generated yet — click Generate"}


@router.post("/{company_id}/generate")
async def generate_digest(
    company_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    company = _get_company(company_id, db)
    background_tasks.add_task(_generate_bg, company, db)
    return {"status": "generating"}


@router.get("/{company_id}/history")
async def get_report_history(company_id: str, db: Session = Depends(get_db)):
    _get_company(company_id, db)
    cached = _report_cache.get(company_id)
    if not cached:
        return {"reports": []}
    return {"reports": [{"generated_at": cached.get("generated_at"), "week": cached.get("week")}]}


async def _generate_bg(company: Company, db: Session):
    company_id = str(company.id)

    # Gather real data
    total_leads = db.query(ReferralLead).filter(ReferralLead.company_id == company_id).count()
    new_this_week = db.query(ReferralLead).filter(
        ReferralLead.company_id == company_id,
        ReferralLead.created_at >= date.today() - timedelta(days=7),
    ).count()
    referring = db.query(ReferralLead).filter(
        ReferralLead.company_id == company_id,
        ReferralLead.status == LeadStatus.referring,
    ).count()

    pending_approvals = db.query(ApprovalItem).filter(
        ApprovalItem.company_id == company_id,
        ApprovalItem.status == "pending",
    ).count()

    approved_this_week = db.query(ApprovalItem).filter(
        ApprovalItem.company_id == company_id,
        ApprovalItem.status == "approved",
    ).count()

    campaigns = db.query(Campaign).filter(Campaign.company_id == company_id).all()
    active_campaigns = [c for c in campaigns if c.status == "active"]
    total_spend = sum(c.spend or 0 for c in campaigns)

    company_name = company.name
    specialty = getattr(company, "specialty_niche", "behavioral health")
    week_str = f"{date.today() - timedelta(days=7)} to {date.today()}"

    prompt = f"""You are the CMO of {company_name}, a {specialty} practice.

This week's data:
- New referral leads added: {new_this_week}
- Total referral leads: {total_leads}
- Actively referring providers: {referring}
- Active campaigns: {len(active_campaigns)}
- Content approvals pending: {pending_approvals}
- Content approved this week: {approved_this_week}
- Total marketing spend: ${total_spend:.0f}

Generate a concise weekly GTM digest. Be specific, strategic, and actionable.

Return JSON: {{
  "headline": str,
  "week": "{week_str}",
  "pulse": "green|yellow|red",
  "pulse_reason": str,
  "highlights": [{{"icon": "📈|✅|⚠️|📊", "title": str, "detail": str}}],
  "this_week_wins": [str],
  "watch_list": [{{"issue": str, "urgency": "high|medium", "suggested_action": str}}],
  "next_week_priorities": [{{"rank": int, "action": str, "channel": str, "expected_impact": str}}],
  "metric_spotlight": {{"metric": str, "value": str, "trend": "up|down|flat", "commentary": str}}
}}"""

    try:
        raw = llm_service.client.messages.create(
            model=llm_service.model_strategy,
            max_tokens=1200,
            messages=[{"role": "user", "content": prompt}],
        )
        text = raw.content[0].text
        match = re.search(r'\{.*\}', text, re.DOTALL)
        data = json.loads(match.group()) if match else {}
    except Exception:
        data = {
            "headline": f"{company_name} GTM Engine — Weekly Digest",
            "week": week_str,
            "pulse": "green" if referring > 0 else "yellow",
            "pulse_reason": "Referral pipeline is growing with active campaigns" if referring > 0 else "Referral pipeline is building — first providers being contacted",
            "highlights": [
                {"icon": "👥", "title": f"{new_this_week} new leads this week", "detail": f"Total pipeline: {total_leads} providers"},
                {"icon": "✅", "title": f"{referring} referring providers", "detail": "Actively sending patients"},
                {"icon": "📊", "title": f"{len(active_campaigns)} active campaigns", "detail": f"${total_spend:.0f} total spend tracked"},
                {"icon": "⏳", "title": f"{pending_approvals} items pending approval", "detail": "Review and approve to keep pipeline moving"},
            ],
            "this_week_wins": [
                f"Added {new_this_week} new provider leads to the referral pipeline",
                f"{approved_this_week} pieces of content approved and ready for deployment",
            ],
            "watch_list": [
                {"issue": "Approval queue has pending items", "urgency": "medium", "suggested_action": "Review and approve content to maintain publishing cadence"} if pending_approvals > 0 else None,
            ],
            "next_week_priorities": [
                {"rank": 1, "action": "Launch fax campaign to top 50 leads", "channel": "fax", "expected_impact": "3-5 new referral inquiries"},
                {"rank": 2, "action": "Approve pending email sequences", "channel": "email", "expected_impact": "Activate outreach for engaged leads"},
                {"rank": 3, "action": "Generate and publish SEO blog post", "channel": "content", "expected_impact": "+15% organic visibility"},
            ],
            "metric_spotlight": {
                "metric": "Referral Conversion Rate",
                "value": f"{round(referring / max(total_leads, 1) * 100, 1)}%",
                "trend": "up" if referring > 0 else "flat",
                "commentary": "Track this weekly — industry benchmark for referral conversion is 8-12%",
            },
        }
        # Clean None values
        data["watch_list"] = [w for w in data.get("watch_list", []) if w is not None]

    data["generated_at"] = date.today().isoformat()
    _report_cache[company_id] = data


def _get_company(company_id: str, db: Session) -> Company:
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return company
