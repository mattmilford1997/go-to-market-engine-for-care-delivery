from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from pydantic import BaseModel, HttpUrl
from typing import Optional
import uuid

from app.db.database import get_db
from app.models.company import Company, CompanyStatus
from app.services.ingestion import ingest_company

router = APIRouter(prefix="/companies", tags=["companies"])


class CompanyCreate(BaseModel):
    website_url: str
    is_pilot: bool = False


class CompanyUpdate(BaseModel):
    name: Optional[str] = None
    budget_google_ads: Optional[float] = None
    budget_meta_ads: Optional[float] = None
    budget_email: Optional[float] = None
    budget_fax: Optional[float] = None
    budget_voicemail: Optional[float] = None
    budget_mail: Optional[float] = None
    budget_tts: Optional[float] = None
    budget_social_boost: Optional[float] = None
    posting_frequency: Optional[dict] = None
    competitors: Optional[list] = None


class CredentialUpdate(BaseModel):
    credentials: dict


@router.get("/")
async def list_companies(db: Session = Depends(get_db)):
    companies = db.query(Company).all()
    return [_company_summary(c) for c in companies]


@router.post("/")
async def create_company(
    payload: CompanyCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    # Check if company already exists for this URL
    existing = db.query(Company).filter(Company.website_url == payload.website_url).first()
    if existing:
        raise HTTPException(status_code=409, detail="Company with this URL already exists")

    # Create placeholder company record
    company = Company(
        name=payload.website_url,
        website_url=payload.website_url,
        slug=str(uuid.uuid4())[:8],
        status=CompanyStatus.ingesting,
        is_pilot=payload.is_pilot,
    )
    db.add(company)
    db.commit()
    db.refresh(company)

    # Kick off ingestion in background
    background_tasks.add_task(_run_ingestion, company.id, payload.website_url, db)

    return {"id": str(company.id), "status": "ingesting", "message": "Ingestion started"}


@router.get("/{company_id}")
async def get_company(company_id: str, db: Session = Depends(get_db)):
    company = _get_or_404(company_id, db)
    return _company_detail(company)


@router.patch("/{company_id}")
async def update_company(
    company_id: str, payload: CompanyUpdate, db: Session = Depends(get_db)
):
    company = _get_or_404(company_id, db)
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(company, field, value)
    db.commit()
    db.refresh(company)
    return _company_detail(company)


@router.post("/{company_id}/credentials")
async def update_credentials(
    company_id: str, payload: CredentialUpdate, db: Session = Depends(get_db)
):
    """Merge new credentials into existing ones (never overwrite wholesale)."""
    company = _get_or_404(company_id, db)
    existing = company.credentials or {}
    existing.update(payload.credentials)
    company.credentials = existing
    db.commit()
    return {"status": "ok", "credential_keys": list(existing.keys())}


@router.get("/{company_id}/credential-status")
async def credential_status(company_id: str, db: Session = Depends(get_db)):
    """Return status (connected/missing) for all credential slots."""
    company = _get_or_404(company_id, db)
    creds = company.credentials or {}

    slots = [
        {"key": "google_ads_api_key", "label": "Google Ads API Key", "module": "Module 1", "type": "api_key"},
        {"key": "google_ads_customer_id", "label": "Google Ads Customer ID", "module": "Module 1", "type": "config"},
        {"key": "meta_ads_access_token", "label": "Meta Ads Access Token", "module": "Modules 1, 3", "type": "oauth"},
        {"key": "meta_ads_account_id", "label": "Meta Ad Account ID", "module": "Modules 1, 3", "type": "config"},
        {"key": "gtm_container_id", "label": "Google Tag Manager Container ID", "module": "Module 1", "type": "config"},
        {"key": "openfax_api_key", "label": "OpenFax API Key", "module": "Module 2", "type": "api_key"},
        {"key": "slybroadcast_username", "label": "Slybroadcast Username", "module": "Module 2", "type": "config"},
        {"key": "slybroadcast_password", "label": "Slybroadcast Password", "module": "Module 2", "type": "secret"},
        {"key": "lob_api_key", "label": "Lob API Key", "module": "Module 2", "type": "api_key"},
        {"key": "instantly_api_key", "label": "Instantly API Key", "module": "Module 2", "type": "api_key"},
        {"key": "google_search_console_token", "label": "Google Search Console OAuth", "module": "Module 4", "type": "oauth"},
        {"key": "google_business_profile_token", "label": "Google Business Profile OAuth", "module": "Modules 4, 5", "type": "oauth"},
        {"key": "cms_api_key", "label": "CMS API Key/Password", "module": "Modules 3, 4", "type": "api_key"},
        {"key": "elevenlabs_api_key", "label": "ElevenLabs API Key", "module": "Module 2", "type": "api_key"},
    ]

    for slot in slots:
        slot["connected"] = bool(creds.get(slot["key"]))

    return {"credentials": slots}


@router.post("/{company_id}/reingest")
async def reingest_company(
    company_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    company = _get_or_404(company_id, db)
    company.status = CompanyStatus.ingesting
    db.commit()
    background_tasks.add_task(_run_ingestion, company.id, company.website_url, db)
    return {"status": "ingesting"}


@router.get("/portfolio/overview")
async def portfolio_overview(db: Session = Depends(get_db)):
    """Arche admin view — aggregate stats across all companies."""
    companies = db.query(Company).all()
    from app.models.referral import Campaign
    from app.models.content import ApprovalItem

    result = []
    for company in companies:
        active_campaigns = db.query(Campaign).filter(
            Campaign.company_id == company.id,
            Campaign.status == "active",
        ).count()
        pending_approvals = db.query(ApprovalItem).filter(
            ApprovalItem.company_id == company.id,
            ApprovalItem.status == "pending",
        ).count()

        total_spend = sum([
            company.budget_google_ads or 0,
            company.budget_meta_ads or 0,
            company.budget_email or 0,
            company.budget_fax or 0,
            company.budget_voicemail or 0,
            company.budget_mail or 0,
        ])

        result.append({
            "id": str(company.id),
            "name": company.name,
            "status": company.status,
            "active_campaigns": active_campaigns,
            "pending_approvals": pending_approvals,
            "monthly_budget": total_spend,
            "health": _compute_health(company, active_campaigns, pending_approvals),
        })

    return result


# ------------------------------------------------------------------ #
# Helpers
# ------------------------------------------------------------------ #

def _get_or_404(company_id: str, db: Session) -> Company:
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return company


def _company_summary(company: Company) -> dict:
    return {
        "id": str(company.id),
        "name": company.name,
        "website_url": company.website_url,
        "slug": company.slug,
        "status": company.status,
        "is_pilot": company.is_pilot,
        "created_at": company.created_at.isoformat() if company.created_at else None,
    }


def _company_detail(company: Company) -> dict:
    return {
        **_company_summary(company),
        "brand_guidelines": company.brand_guidelines,
        "services": company.services,
        "providers": company.providers,
        "locations": company.locations,
        "insurance_accepted": company.insurance_accepted,
        "differentiators": company.differentiators,
        "target_demographics": company.target_demographics,
        "competitors": company.competitors,
        "specialty_niche": company.specialty_niche,
        "budgets": {
            "google_ads": company.budget_google_ads,
            "meta_ads": company.budget_meta_ads,
            "email": company.budget_email,
            "fax": company.budget_fax,
            "voicemail": company.budget_voicemail,
            "mail": company.budget_mail,
            "tts": company.budget_tts,
            "social_boost": company.budget_social_boost,
            "total": sum(filter(None, [
                company.budget_google_ads, company.budget_meta_ads,
                company.budget_email, company.budget_fax,
                company.budget_voicemail, company.budget_mail,
                company.budget_tts, company.budget_social_boost,
            ])),
        },
        "posting_frequency": company.posting_frequency,
        "updated_at": company.updated_at.isoformat() if company.updated_at else None,
    }


def _compute_health(company, active_campaigns: int, pending_approvals: int) -> str:
    if company.status == "ingesting":
        return "yellow"
    if active_campaigns == 0:
        return "red"
    if pending_approvals > 20:
        return "yellow"
    return "green"


async def _run_ingestion(company_id, url: str, db: Session):
    """Background task — run full ingestion pipeline and update company record."""
    import re
    from app.services.ingestion import ingest_company

    try:
        data = await ingest_company(url)
        company = db.query(Company).filter(Company.id == company_id).first()
        if not company:
            return

        company.name = data.get("company_name", company.name)
        company.slug = data.get("slug", company.slug)
        company.specialty_niche = data.get("specialty_niche", "")
        company.services = data.get("services", [])
        company.providers = data.get("providers", [])
        company.locations = data.get("locations", [])
        company.insurance_accepted = data.get("insurance_accepted", [])
        company.differentiators = data.get("differentiators", [])
        company.target_demographics = data.get("target_demographics", [])
        company.brand_guidelines = data.get("brand_guidelines", {})
        company.status = CompanyStatus.active
        db.commit()
    except Exception as e:
        company = db.query(Company).filter(Company.id == company_id).first()
        if company:
            company.status = CompanyStatus.onboarding
            db.commit()
