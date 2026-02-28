"""Module 1: Paid Ads Optimizer — Google, Meta, Reddit, Microsoft, Quora, TikTok, LinkedIn, Pinterest."""
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import Optional

from app.db.database import get_db
from app.models.company import Company
from app.models.content import ContentItem, ApprovalItem, ContentType, ContentStatus
from app.models.referral import Campaign
from app.services.llm import llm_service

router = APIRouter(prefix="/paid-ads", tags=["paid_ads"])

AD_PLATFORMS = [
    {
        "id": "google",
        "name": "Google Ads",
        "description": "Search & Display — highest intent traffic for mental health keywords",
        "formats": ["Responsive Search Ads", "Performance Max", "Display"],
        "best_for": "Treatment-ready patients searching by condition",
        "avg_cpc": "$8–$22",
        "color": "#4285f4",
        "icon": "G",
    },
    {
        "id": "meta",
        "name": "Meta (Facebook + Instagram)",
        "description": "Interest & behavior targeting — large audience, strong retargeting",
        "formats": ["Feed Image/Video", "Stories/Reels", "Carousel", "Lead Gen"],
        "best_for": "Awareness and retargeting of mental health seekers",
        "avg_cpc": "$2–$8",
        "color": "#1877f2",
        "icon": "f",
    },
    {
        "id": "reddit",
        "name": "Reddit Ads",
        "description": "Community-based targeting on mental health subreddits",
        "formats": ["Promoted Post", "Video", "Conversation Ad"],
        "best_for": "r/depression, r/anxiety, r/mentalhealth communities",
        "avg_cpc": "$1–$4",
        "color": "#ff4500",
        "icon": "R",
    },
    {
        "id": "microsoft",
        "name": "Microsoft / Bing Ads",
        "description": "Bing + LinkedIn audience network — older, higher-income demographic",
        "formats": ["Responsive Search Ads", "Dynamic Search Ads"],
        "best_for": "Older adults, higher-income patients, LinkedIn retargeting",
        "avg_cpc": "$5–$15",
        "color": "#00a4ef",
        "icon": "M",
    },
    {
        "id": "quora",
        "name": "Quora Ads",
        "description": "Question-intent targeting — people actively researching conditions",
        "formats": ["Promoted Answer", "Image Ad", "Text Ad"],
        "best_for": "Patients in research phase — 'What is TMS therapy?'",
        "avg_cpc": "$2–$6",
        "color": "#b92b27",
        "icon": "Q",
    },
    {
        "id": "tiktok",
        "name": "TikTok Ads",
        "description": "Short-form video ads reaching younger mental health audiences",
        "formats": ["In-Feed Video", "TopView", "Brand Takeover", "Spark Ads"],
        "best_for": "Gen Z and Millennials, ADHD/anxiety content",
        "avg_cpc": "$1–$3",
        "color": "#010101",
        "icon": "T",
    },
    {
        "id": "linkedin",
        "name": "LinkedIn Ads",
        "description": "Professional targeting — ideal for B2B referral provider outreach",
        "formats": ["Sponsored Content", "Message Ads", "Dynamic Ads"],
        "best_for": "PCPs, therapists, HR managers / EAP programs",
        "avg_cpc": "$8–$20",
        "color": "#0077b5",
        "icon": "in",
    },
    {
        "id": "pinterest",
        "name": "Pinterest Ads",
        "description": "Visual discovery platform — strong for wellness and mental health content",
        "formats": ["Promoted Pins", "Video Pins", "Carousel"],
        "best_for": "Women 25–54 searching wellness, therapy, self-care",
        "avg_cpc": "$1–$3",
        "color": "#e60023",
        "icon": "P",
    },
]

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


# ------------------------------------------------------------------ #
# All Platforms Index
# ------------------------------------------------------------------ #

@router.get("/platforms")
async def get_platforms():
    return {"platforms": AD_PLATFORMS}


# ------------------------------------------------------------------ #
# Reddit Ads
# ------------------------------------------------------------------ #

@router.post("/{company_id}/reddit/generate-all")
async def generate_reddit_ads(
    company_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    company = _get_company(company_id, db)
    background_tasks.add_task(_generate_platform_ads_bg, company_id, _company_data(company), "reddit", db)
    return {"status": "generating", "platform": "reddit"}


# ------------------------------------------------------------------ #
# Microsoft / Bing Ads
# ------------------------------------------------------------------ #

@router.post("/{company_id}/microsoft/generate-all")
async def generate_microsoft_ads(
    company_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    company = _get_company(company_id, db)
    background_tasks.add_task(_generate_platform_ads_bg, company_id, _company_data(company), "microsoft", db)
    return {"status": "generating", "platform": "microsoft"}


# ------------------------------------------------------------------ #
# Quora Ads
# ------------------------------------------------------------------ #

@router.post("/{company_id}/quora/generate-all")
async def generate_quora_ads(
    company_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    company = _get_company(company_id, db)
    background_tasks.add_task(_generate_platform_ads_bg, company_id, _company_data(company), "quora", db)
    return {"status": "generating", "platform": "quora"}


# ------------------------------------------------------------------ #
# TikTok Ads
# ------------------------------------------------------------------ #

@router.post("/{company_id}/tiktok/generate-all")
async def generate_tiktok_ads(
    company_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    company = _get_company(company_id, db)
    background_tasks.add_task(_generate_platform_ads_bg, company_id, _company_data(company), "tiktok", db)
    return {"status": "generating", "platform": "tiktok"}


# ------------------------------------------------------------------ #
# LinkedIn Ads
# ------------------------------------------------------------------ #

@router.post("/{company_id}/linkedin/generate-all")
async def generate_linkedin_ads(
    company_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    company = _get_company(company_id, db)
    background_tasks.add_task(_generate_platform_ads_bg, company_id, _company_data(company), "linkedin", db)
    return {"status": "generating", "platform": "linkedin"}


# ------------------------------------------------------------------ #
# Pinterest Ads
# ------------------------------------------------------------------ #

@router.post("/{company_id}/pinterest/generate-all")
async def generate_pinterest_ads(
    company_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    company = _get_company(company_id, db)
    background_tasks.add_task(_generate_platform_ads_bg, company_id, _company_data(company), "pinterest", db)
    return {"status": "generating", "platform": "pinterest"}


# ------------------------------------------------------------------ #
# Platform-specific background generator
# ------------------------------------------------------------------ #

PLATFORM_PROMPTS = {
    "reddit": (
        "Write 3 Reddit Promoted Posts for a {niche} clinic called {name}. "
        "Tone: genuine, non-salesy, community-first — Reddit users hate obvious ads. "
        "Target subreddits: r/depression, r/anxiety, r/mentalhealth, r/TMS. "
        "Each post: title (Reddit post style), body (2–3 paragraphs), CTA. "
        "Include a native-feeling hook that adds value before mentioning the clinic."
    ),
    "microsoft": (
        "Write 3 Microsoft/Bing Responsive Search Ads for a {niche} clinic called {name}. "
        "Audience skews older (45+), higher income. "
        "Each ad: 3 headlines (30 chars max), 2 descriptions (90 chars max), 2 sitelink extensions. "
        "Focus on insurance coverage, credentials, and proven results."
    ),
    "quora": (
        "Write 3 Quora Promoted Answer Ads for a {niche} clinic called {name}. "
        "Format: answer to a question a patient would ask (e.g., 'What is TMS therapy?'). "
        "First 2–3 sentences must genuinely answer the question before softly mentioning the clinic. "
        "Each: question, answer body (4–6 sentences), CTA."
    ),
    "tiktok": (
        "Write 3 TikTok In-Feed Video Ad scripts for a {niche} clinic called {name}. "
        "15–30 seconds. Gen Z / Millennial tone. Hook in first 2 seconds. "
        "Include: hook line, on-screen text (3–5 overlays), voiceover script, hashtag suggestions. "
        "Sound-off friendly — key message readable without audio."
    ),
    "linkedin": (
        "Write 3 LinkedIn Sponsored Content ads for a {niche} clinic called {name}. "
        "Target: PCPs, therapists, HR managers, EAP coordinators. "
        "Professional tone but warm. Focus on referral partnerships and patient outcomes. "
        "Each: headline (150 chars), intro text (600 chars), CTA button label."
    ),
    "pinterest": (
        "Write 3 Pinterest Promoted Pin descriptions for a {niche} clinic called {name}. "
        "Target: women 25–54 interested in wellness, mental health, self-care. "
        "Warm, aspirational tone. Each: pin title (100 chars), description (500 chars), "
        "suggested image description, 5 relevant hashtags."
    ),
}


async def _generate_platform_ads_bg(company_id: str, company_data: dict, platform: str, db: Session):
    name = company_data.get("company_name", "our clinic")
    niche = company_data.get("specialty_niche", "behavioral health")
    prompt_template = PLATFORM_PROMPTS.get(platform, "Write 3 ads for {name}, a {niche} clinic.")
    prompt = prompt_template.format(name=name, niche=niche)

    try:
        result = llm_service.client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=1000,
            messages=[{"role": "user", "content": prompt}],
        )
        body = result.content[0].text
    except Exception:
        body = f"[{platform.title()} ads pending — connect ANTHROPIC_API_KEY to generate]"

    ci = ContentItem(
        company_id=company_id,
        content_type=ContentType.ad_copy_google,  # reuse existing type
        status=ContentStatus.pending_review,
        title=f"{platform.title()} Ads — {name}",
        body=body,
        extra_data={"platform": platform, "type": f"{platform}_ad_copy", "company": name},
    )
    db.add(ci)
    db.flush()
    _add_approval(db, company_id, ci, "paid_ads", f"{platform}_ad_copy")
    db.commit()


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
