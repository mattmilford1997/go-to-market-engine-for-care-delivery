"""Module 1: Paid Ads Optimizer — Google Ads + Meta Ads."""
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import Optional

from app.db.database import get_db
from app.models.company import Company
from app.models.content import ContentItem, ApprovalItem, ContentType, ContentStatus
from app.models.referral import Campaign
from app.services.llm import llm_service

router = APIRouter(prefix="/paid-ads", tags=["paid_ads"])

META_AUDIENCE_TEMPLATES = [
    {
        "name": "Local Mental Health Seekers",
        "geo": "radius around each location",
        "interests": ["mental health", "therapy", "self-improvement", "mindfulness"],
        "behaviors": ["engaged shoppers"],
        "age_range": "25-65",
    },
    {
        "name": "Treatment-Resistant Depression",
        "geo": "radius around each location",
        "interests": ["depression treatment", "TMS therapy", "ketamine therapy"],
        "behaviors": [],
        "age_range": "25-65",
    },
    {
        "name": "Healthcare Professionals (Referral Awareness)",
        "geo": "radius around each location",
        "interests": ["medicine", "nursing", "psychiatry"],
        "behaviors": ["small business owners"],
        "age_range": "28-60",
    },
]


# ------------------------------------------------------------------ #
# Google Ads
# ------------------------------------------------------------------ #

@router.post("/{company_id}/google/generate-keywords")
async def generate_keywords(
    company_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    company = _get_company(company_id, db)
    background_tasks.add_task(
        _generate_keyword_clusters_bg, company_id, _company_data(company), db
    )
    return {"status": "generating"}


@router.post("/{company_id}/google/generate-ad-copy")
async def generate_google_ad_copy(
    company_id: str,
    payload: dict,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Generate RSA copy for a keyword cluster. payload: {cluster: dict}"""
    company = _get_company(company_id, db)
    cluster = payload.get("cluster", {})
    if not cluster:
        raise HTTPException(status_code=400, detail="cluster required")
    background_tasks.add_task(
        _generate_google_copy_bg, company_id, _company_data(company), cluster, db
    )
    return {"status": "generating"}


@router.post("/{company_id}/google/generate-all")
async def generate_all_google_ads(
    company_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Generate keyword clusters + ad copy for each cluster."""
    company = _get_company(company_id, db)
    background_tasks.add_task(
        _generate_all_google_bg, company_id, _company_data(company), db
    )
    return {"status": "generating"}


# ------------------------------------------------------------------ #
# Meta Ads
# ------------------------------------------------------------------ #

@router.get("/{company_id}/meta/audiences")
async def get_meta_audiences(company_id: str):
    """Return pre-defined audience templates; these need per-company location overlay."""
    return {"audiences": META_AUDIENCE_TEMPLATES}


@router.post("/{company_id}/meta/generate-ad-copy")
async def generate_meta_ad_copy(
    company_id: str,
    payload: dict,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Generate Meta ad copy + creative brief. payload: {audience: dict}"""
    company = _get_company(company_id, db)
    audience = payload.get("audience", META_AUDIENCE_TEMPLATES[0])
    background_tasks.add_task(
        _generate_meta_copy_bg, company_id, _company_data(company), audience, db
    )
    return {"status": "generating"}


@router.post("/{company_id}/meta/generate-all")
async def generate_all_meta_ads(
    company_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Generate ad copy for all Meta audience templates."""
    company = _get_company(company_id, db)
    for audience in META_AUDIENCE_TEMPLATES:
        background_tasks.add_task(
            _generate_meta_copy_bg, company_id, _company_data(company), audience, db
        )
    return {"status": "generating", "audience_count": len(META_AUDIENCE_TEMPLATES)}


# ------------------------------------------------------------------ #
# Budget Recommendations
# ------------------------------------------------------------------ #

@router.get("/{company_id}/budget-recommendations")
async def budget_recommendations(company_id: str, db: Session = Depends(get_db)):
    company = _get_company(company_id, db)
    locations = company.locations or []
    location_count = max(len(locations), 1)

    if location_count == 1:
        google_rec = (2000, 4000)
        meta_rec = (1000, 2000)
        rationale = "Single-location specialty practice"
    elif location_count <= 3:
        google_rec = (4000, 8000)
        meta_rec = (2000, 4000)
        rationale = "Multi-location practice"
    else:
        google_rec = (6000, 12000)
        meta_rec = (3000, 6000)
        rationale = "Large multi-location network"

    return {
        "google_ads": {
            "recommended_min": google_rec[0],
            "recommended_max": google_rec[1],
            "current_budget": company.budget_google_ads,
            "allocation_pct": 65,
        },
        "meta_ads": {
            "recommended_min": meta_rec[0],
            "recommended_max": meta_rec[1],
            "current_budget": company.budget_meta_ads,
            "allocation_pct": 35,
        },
        "rationale": rationale,
        "locations": location_count,
        "note": "Adjust after first 2 weeks based on performance data",
    }


# ------------------------------------------------------------------ #
# Background Tasks
# ------------------------------------------------------------------ #

async def _generate_keyword_clusters_bg(company_id: str, company_data: dict, db: Session):
    clusters = llm_service.generate_keyword_clusters(company_data)
    ci = ContentItem(
        company_id=company_id,
        content_type=ContentType.ad_copy_google,
        status=ContentStatus.pending_review,
        title="Google Ads Keyword Clusters",
        body=f"{len(clusters)} keyword clusters generated",
        extra_data={"clusters": clusters, "type": "keyword_research"},
    )
    db.add(ci)
    db.flush()
    _add_approval(db, company_id, ci, "paid_ads", "keyword_clusters")
    db.commit()
    return clusters


async def _generate_google_copy_bg(company_id: str, company_data: dict, cluster: dict, db: Session):
    copy = llm_service.generate_google_ad_copy(company_data, cluster)
    ci = ContentItem(
        company_id=company_id,
        content_type=ContentType.ad_copy_google,
        status=ContentStatus.pending_review,
        title=f"Google RSA — {cluster.get('cluster_name', 'Ad Group')}",
        body="\n".join(copy.get("headlines", [])),
        extra_data={**copy, "cluster": cluster},
    )
    db.add(ci)
    db.flush()
    _add_approval(db, company_id, ci, "paid_ads", "google_ad_copy")
    db.commit()


async def _generate_all_google_bg(company_id: str, company_data: dict, db: Session):
    clusters = await _generate_keyword_clusters_bg(company_id, company_data, db)
    if isinstance(clusters, list):
        for cluster in clusters[:6]:  # generate copy for first 6 clusters
            await _generate_google_copy_bg(company_id, company_data, cluster, db)


async def _generate_meta_copy_bg(company_id: str, company_data: dict, audience: dict, db: Session):
    copy = llm_service.generate_meta_ad_copy(company_data, audience)
    ci = ContentItem(
        company_id=company_id,
        content_type=ContentType.ad_copy_meta,
        status=ContentStatus.pending_review,
        title=f"Meta Ad — {audience.get('name', 'Audience')}",
        body=copy.get("primary_text", ""),
        extra_data={**copy, "audience": audience},
    )
    db.add(ci)
    db.flush()
    _add_approval(db, company_id, ci, "paid_ads", "meta_ad_creative")
    db.commit()


def _add_approval(db, company_id, content_item, module, type_label):
    item = ApprovalItem(
        company_id=company_id,
        content_item_id=content_item.id,
        item_type=type_label,
        title=content_item.title,
        preview_data=content_item.extra_data or {},
        module=module,
    )
    db.add(item)


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
