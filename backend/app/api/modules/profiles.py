"""Module 5: Directory Profile Builder API routes."""
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import Optional

from app.db.database import get_db
from app.models.company import Company
from app.models.seo import DirectoryProfile
from app.models.content import ApprovalItem
from app.services.llm import llm_service

router = APIRouter(prefix="/profiles", tags=["profiles"])

SUPPORTED_PLATFORMS = [
    {"id": "google_business_profile", "name": "Google Business Profile", "has_api": True, "priority": 1},
    {"id": "psychology_today", "name": "Psychology Today", "has_api": False, "priority": 2},
    {"id": "therapyden", "name": "TherapyDen", "has_api": False, "priority": 3},
    {"id": "healthgrades", "name": "Healthgrades", "has_api": False, "priority": 4},
    {"id": "zocdoc", "name": "Zocdoc", "has_api": False, "priority": 5},
    {"id": "vitals", "name": "Vitals", "has_api": False, "priority": 6},
    {"id": "yelp", "name": "Yelp", "has_api": False, "priority": 7},
    {"id": "webmd", "name": "WebMD / Medscape", "has_api": False, "priority": 8},
    {"id": "samhsa", "name": "SAMHSA Locator", "has_api": False, "priority": 9},
]


@router.get("/platforms")
async def list_platforms():
    return {"platforms": SUPPORTED_PLATFORMS}


@router.get("/{company_id}/scorecard")
async def get_scorecard(company_id: str, db: Session = Depends(get_db)):
    """Directory Presence Scorecard — all platforms at a glance."""
    _get_company(company_id, db)
    profiles = db.query(DirectoryProfile).filter(
        DirectoryProfile.company_id == company_id
    ).all()

    profile_map = {p.platform: p for p in profiles}
    scorecard = []

    for platform in SUPPORTED_PLATFORMS:
        pid = platform["id"]
        profile = profile_map.get(pid)
        scorecard.append({
            "platform": pid,
            "platform_name": platform["name"],
            "exists": profile is not None,
            "is_claimed": profile.is_claimed if profile else False,
            "completeness_score": profile.completeness_score if profile else 0,
            "review_count": profile.review_count if profile else 0,
            "average_rating": profile.average_rating if profile else None,
            "last_updated": profile.last_updated if profile else None,
            "auto_create_status": profile.auto_create_status if profile else "not_started",
            "content_generated": bool(profile and profile.description_medium),
            "credentials_stored": profile.credentials_stored if profile else False,
            "missing_fields": profile.missing_fields if profile else [],
            "optimization_score": profile.optimization_score if profile else 0,
        })

    total_score = sum(s["completeness_score"] for s in scorecard) // max(len(scorecard), 1)
    claimed_count = sum(1 for s in scorecard if s["is_claimed"])

    return {
        "overall_score": total_score,
        "claimed_profiles": claimed_count,
        "total_platforms": len(SUPPORTED_PLATFORMS),
        "platforms": scorecard,
    }


@router.post("/{company_id}/generate-content")
async def generate_profile_content(
    company_id: str,
    payload: dict,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Generate profile content for one or all platforms. payload: {platform: str | 'all'}"""
    company = _get_company(company_id, db)
    platform = payload.get("platform", "all")

    platforms_to_generate = (
        [p["id"] for p in SUPPORTED_PLATFORMS]
        if platform == "all"
        else [platform]
    )

    for p in platforms_to_generate:
        background_tasks.add_task(
            _generate_profile_content_bg, company_id, _company_data(company), p, db
        )

    return {"status": "generating", "platforms": platforms_to_generate}


@router.post("/{company_id}/auto-create/{platform}")
async def auto_create_profile(
    company_id: str,
    platform: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Trigger Playwright auto-creation for a platform."""
    _get_company(company_id, db)
    profile = db.query(DirectoryProfile).filter(
        DirectoryProfile.company_id == company_id,
        DirectoryProfile.platform == platform,
    ).first()

    if not profile or not profile.description_medium:
        raise HTTPException(400, "Generate profile content first before auto-creating")

    # Update status to in_progress
    profile.auto_create_status = "in_progress"
    db.commit()

    background_tasks.add_task(_auto_create_profile_bg, company_id, platform, db)
    return {"status": "in_progress", "platform": platform}


@router.get("/{company_id}/profiles")
async def list_profiles(company_id: str, db: Session = Depends(get_db)):
    profiles = db.query(DirectoryProfile).filter(
        DirectoryProfile.company_id == company_id
    ).all()
    return [_profile_to_dict(p) for p in profiles]


@router.get("/{company_id}/profiles/{platform}")
async def get_profile(company_id: str, platform: str, db: Session = Depends(get_db)):
    profile = db.query(DirectoryProfile).filter(
        DirectoryProfile.company_id == company_id,
        DirectoryProfile.platform == platform,
    ).first()
    if not profile:
        raise HTTPException(404, f"No profile for {platform}")
    return _profile_to_dict(profile)


@router.post("/{company_id}/profiles/{platform}/credentials")
async def save_directory_credentials(
    company_id: str, platform: str, payload: dict, db: Session = Depends(get_db)
):
    """Store login credentials for an existing directory profile."""
    company = _get_company(company_id, db)
    creds = company.credentials or {}
    creds[f"directory_{platform}_username"] = payload.get("username", "")
    creds[f"directory_{platform}_password"] = payload.get("password", "")
    company.credentials = creds

    profile = db.query(DirectoryProfile).filter(
        DirectoryProfile.company_id == company_id,
        DirectoryProfile.platform == platform,
    ).first()
    if profile:
        profile.credentials_stored = True
        profile.is_claimed = True

    db.commit()
    return {"status": "ok", "platform": platform, "credentials_stored": True}


# ------------------------------------------------------------------ #
# Background Tasks
# ------------------------------------------------------------------ #

async def _generate_profile_content_bg(
    company_id: str, company_data: dict, platform: str, db: Session
):
    content = llm_service.generate_directory_profiles(company_data, platform)

    # Upsert profile record
    profile = db.query(DirectoryProfile).filter(
        DirectoryProfile.company_id == company_id,
        DirectoryProfile.platform == platform,
    ).first()

    if not profile:
        profile = DirectoryProfile(company_id=company_id, platform=platform)
        db.add(profile)

    profile.description_short = content.get("practice_description_50", "")
    profile.description_medium = content.get("practice_description_150", "")
    profile.description_long = content.get("practice_description_500", "")
    profile.provider_bios = content.get("provider_bios", [])
    profile.services_listed = content.get("services", [])
    profile.conditions_listed = content.get("conditions", [])
    profile.insurance_listed = content.get("insurance", [])
    profile.optimization_score = _compute_optimization_score(content)
    db.flush()

    # Add to approval queue
    platform_name = next((p["name"] for p in SUPPORTED_PLATFORMS if p["id"] == platform), platform)
    approval = ApprovalItem(
        company_id=company_id,
        item_type="directory_profile",
        title=f"Directory Profile — {platform_name}",
        preview_data={
            "platform": platform,
            "description_medium": content.get("practice_description_150", ""),
            "provider_count": len(content.get("provider_bios", [])),
        },
        module="profiles",
    )
    db.add(approval)
    db.commit()


async def _auto_create_profile_bg(company_id: str, platform: str, db: Session):
    """
    Playwright browser automation for auto-creating directory profiles.
    Currently marks as needing manual completion if Playwright not fully configured.
    """
    try:
        from playwright.async_api import async_playwright
        profile = db.query(DirectoryProfile).filter(
            DirectoryProfile.company_id == company_id,
            DirectoryProfile.platform == platform,
        ).first()

        if not profile:
            return

        # Platform-specific auto-create logic
        # For now, mark as needs_manual with pre-filled content
        # Full Playwright automation per platform is implemented in the workers module
        profile.auto_create_status = "needs_manual"
        db.commit()

    except ImportError:
        profile = db.query(DirectoryProfile).filter(
            DirectoryProfile.company_id == company_id,
            DirectoryProfile.platform == platform,
        ).first()
        if profile:
            profile.auto_create_status = "needs_manual"
            db.commit()


def _compute_optimization_score(content: dict) -> int:
    score = 0
    if content.get("practice_description_500"): score += 25
    if content.get("practice_description_150"): score += 15
    if content.get("provider_bios"): score += 20
    if content.get("services"): score += 15
    if content.get("insurance"): score += 10
    if content.get("faq"): score += 10
    if content.get("conditions"): score += 5
    return min(score, 100)


def _get_company(company_id: str, db: Session) -> Company:
    c = db.query(Company).filter(Company.id == company_id).first()
    if not c:
        raise HTTPException(404, "Company not found")
    return c


def _company_data(company: Company) -> dict:
    return {
        "company_name": company.name,
        "website_url": company.website_url,
        "specialty_niche": company.specialty_niche or "",
        "services": company.services or [],
        "providers": company.providers or [],
        "locations": company.locations or [],
        "insurance_accepted": company.insurance_accepted or [],
        "differentiators": company.differentiators or [],
        "brand_guidelines": company.brand_guidelines or {},
    }


def _profile_to_dict(p: DirectoryProfile) -> dict:
    return {
        "id": str(p.id),
        "platform": p.platform,
        "profile_url": p.profile_url,
        "is_claimed": p.is_claimed,
        "is_created": p.is_created,
        "completeness_score": p.completeness_score,
        "review_count": p.review_count,
        "average_rating": p.average_rating,
        "last_updated": p.last_updated,
        "description_short": p.description_short,
        "description_medium": p.description_medium,
        "provider_bios": p.provider_bios,
        "auto_create_status": p.auto_create_status,
        "optimization_score": p.optimization_score,
        "credentials_stored": p.credentials_stored,
        "missing_fields": p.missing_fields,
        "created_at": p.created_at.isoformat() if p.created_at else None,
    }
