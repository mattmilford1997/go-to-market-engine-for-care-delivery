"""
Patient Journey Templates — pre-built, condition-specific campaign templates
for common behavioral health service lines. One-click deploys generate all
collateral (email sequence, fax, voicemail, postcard) for that journey.
"""
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.company import Company
from app.models.content import ApprovalItem, ContentItem, ContentType, ContentStatus
from app.services.llm import llm_service

router = APIRouter(prefix="/templates", tags=["templates"])

# Template library — each template maps to a specific patient journey
JOURNEY_TEMPLATES = [
    {
        "id": "tms_pcp",
        "name": "TMS Therapy — PCP Referral Campaign",
        "description": "30-day multi-touch campaign targeting PCPs to refer treatment-resistant depression patients for TMS.",
        "condition": "Treatment-Resistant Depression",
        "target_specialty": "primary care physician",
        "channels": ["fax", "email", "voicemail", "mail"],
        "touchpoints": 8,
        "avg_conversion_rate": "9.2%",
        "time_to_first_referral": "14 days",
        "icon": "🧠",
        "color": "#6366f1",
        "tags": ["TMS", "depression", "PCP", "referral"],
        "included_assets": ["Referral fax sheet", "4-email sequence", "2 voicemail scripts", "Postcard"],
    },
    {
        "id": "ketamine_psych",
        "name": "Ketamine Infusion — Psychiatrist Outreach",
        "description": "Educate psychiatrists on ketamine as a next-step treatment for severe depression and PTSD.",
        "condition": "Severe Depression / PTSD",
        "target_specialty": "psychiatrist",
        "channels": ["email", "fax"],
        "touchpoints": 5,
        "avg_conversion_rate": "6.8%",
        "time_to_first_referral": "21 days",
        "icon": "💊",
        "color": "#8b5cf6",
        "tags": ["ketamine", "depression", "PTSD", "psychiatry"],
        "included_assets": ["Clinical overview fax", "3-email sequence", "1 voicemail script"],
    },
    {
        "id": "iop_er_physicians",
        "name": "IOP Program — ER & Hospital Discharge",
        "description": "Partner with hospital discharge planners and ER physicians to route patients to your IOP program.",
        "condition": "Acute Mental Health / Substance Use",
        "target_specialty": "emergency medicine",
        "channels": ["fax", "mail", "voicemail"],
        "touchpoints": 6,
        "avg_conversion_rate": "12.1%",
        "time_to_first_referral": "7 days",
        "icon": "🏥",
        "color": "#ef4444",
        "tags": ["IOP", "hospital", "discharge", "crisis"],
        "included_assets": ["Step-down care fax sheet", "Postcard", "2 voicemail scripts"],
    },
    {
        "id": "therapy_pediatrics",
        "name": "Child & Teen Therapy — Pediatrician Referral",
        "description": "Campaign targeting pediatricians for referrals of anxious, depressed, or behaviorally-challenged youth.",
        "condition": "Pediatric Mental Health",
        "target_specialty": "pediatrician",
        "channels": ["fax", "email", "mail"],
        "touchpoints": 7,
        "avg_conversion_rate": "8.5%",
        "time_to_first_referral": "18 days",
        "icon": "👶",
        "color": "#10b981",
        "tags": ["children", "adolescents", "anxiety", "pediatrics"],
        "included_assets": ["Referral fax sheet", "3-email sequence", "Postcard"],
    },
    {
        "id": "addiction_obgyn",
        "name": "MAT / Addiction — OB/GYN Outreach",
        "description": "Connect OB/GYN providers with your medication-assisted treatment program for pregnant women.",
        "condition": "Substance Use Disorder / Perinatal",
        "target_specialty": "OB/GYN",
        "channels": ["fax", "email"],
        "touchpoints": 4,
        "avg_conversion_rate": "7.3%",
        "time_to_first_referral": "12 days",
        "icon": "💙",
        "color": "#3b82f6",
        "tags": ["MAT", "addiction", "pregnancy", "OB/GYN"],
        "included_assets": ["Clinical fax sheet", "2-email sequence"],
    },
    {
        "id": "geriatric_pcp_specialist",
        "name": "Geriatric Psychiatry — Internal Medicine Referral",
        "description": "Target internal medicine and geriatrics specialists to refer elderly patients with depression or cognitive decline.",
        "condition": "Geriatric Mental Health",
        "target_specialty": "internal medicine",
        "channels": ["fax", "email", "mail"],
        "touchpoints": 6,
        "avg_conversion_rate": "10.4%",
        "time_to_first_referral": "16 days",
        "icon": "🧓",
        "color": "#f59e0b",
        "tags": ["geriatric", "dementia", "depression", "internal medicine"],
        "included_assets": ["Referral fax sheet", "3-email sequence", "Postcard"],
    },
    {
        "id": "adhd_school_counselors",
        "name": "ADHD Assessment — School Counselor Outreach",
        "description": "Introduce your ADHD evaluation and treatment services to school counselors and educational psychologists.",
        "condition": "ADHD",
        "target_specialty": "school counselor",
        "channels": ["email", "mail"],
        "touchpoints": 4,
        "avg_conversion_rate": "5.9%",
        "time_to_first_referral": "25 days",
        "icon": "📚",
        "color": "#f97316",
        "tags": ["ADHD", "children", "schools", "assessment"],
        "included_assets": ["Welcome email", "2 follow-up emails", "Postcard"],
    },
    {
        "id": "eating_disorder_gp",
        "name": "Eating Disorder Treatment — GP Network",
        "description": "Build awareness with GPs about your specialized eating disorder program and referral pathway.",
        "condition": "Eating Disorders",
        "target_specialty": "family medicine",
        "channels": ["fax", "email", "voicemail"],
        "touchpoints": 5,
        "avg_conversion_rate": "6.1%",
        "time_to_first_referral": "20 days",
        "icon": "🌿",
        "color": "#14b8a6",
        "tags": ["eating disorders", "anorexia", "bulimia", "GP"],
        "included_assets": ["Clinical fax sheet", "2-email sequence", "Voicemail script"],
    },
]


@router.get("/library")
async def list_templates():
    """Return all available journey templates."""
    return {"templates": JOURNEY_TEMPLATES, "total": len(JOURNEY_TEMPLATES)}


@router.get("/library/{template_id}")
async def get_template(template_id: str):
    tmpl = _find_template(template_id)
    return tmpl


@router.post("/{company_id}/deploy/{template_id}")
async def deploy_template(
    company_id: str,
    template_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Deploy a journey template — generates all included collateral for the company."""
    company = _get_company(company_id, db)
    tmpl = _find_template(template_id)

    background_tasks.add_task(
        _deploy_bg, company_id, company.dict_data(), tmpl, db
    )
    return {
        "status": "deploying",
        "template": tmpl["name"],
        "assets_queued": len(tmpl["included_assets"]),
        "message": f"Generating {len(tmpl['included_assets'])} assets — check Approval Queue in 30-60 seconds",
    }


async def _deploy_bg(company_id: str, company_data: dict, tmpl: dict, db: Session):
    from app.api.modules.referral import (
        _generate_fax_sheet_bg,
        _generate_email_sequence_bg,
        _generate_voicemail_bg,
        _generate_postcard_bg,
        _add_to_approval_queue,
    )
    import asyncio

    specialty = tmpl["target_specialty"]
    tasks = []

    if "fax" in tmpl["channels"]:
        tasks.append(_generate_fax_sheet_bg(company_id, company_data, specialty, db))
    if "email" in tmpl["channels"]:
        tasks.append(_generate_email_sequence_bg(company_id, company_data, specialty, db))
    if "voicemail" in tmpl["channels"]:
        tasks.append(_generate_voicemail_bg(company_id, company_data, specialty, db))
    if "mail" in tmpl["channels"]:
        tasks.append(_generate_postcard_bg(company_id, company_data, db))

    for task in tasks:
        await task


def _find_template(template_id: str) -> dict:
    tmpl = next((t for t in JOURNEY_TEMPLATES if t["id"] == template_id), None)
    if not tmpl:
        raise HTTPException(status_code=404, detail="Template not found")
    return tmpl


def _get_company(company_id: str, db: Session) -> Company:
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    company.dict_data = lambda: {
        "company_name": company.name,
        "website_url": company.website_url,
        "specialty_niche": company.specialty_niche or "",
        "services": company.services or [],
        "providers": company.providers or [],
        "locations": company.locations or [],
        "insurance_accepted": company.insurance_accepted or [],
        "differentiators": company.differentiators or [],
        "target_demographics": company.target_demographics or [],
        "brand_guidelines": company.brand_guidelines or {},
    }
    return company
