"""Module 1: Paid Ads Optimizer — Google, Meta, Reddit, Microsoft, Quora, TikTok, LinkedIn, Pinterest."""
import logging

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import Optional

from app.db.database import get_db, SessionLocal
from app.models.company import Company
from app.models.content import ContentItem, ApprovalItem, ContentType, ContentStatus
from app.models.referral import Campaign
from app.services.llm import llm_service

log = logging.getLogger(__name__)

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
        _generate_keyword_clusters_bg, company_id, _company_data(company)
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
        _generate_google_copy_bg, company_id, _company_data(company), cluster
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
        _generate_all_google_bg, company_id, _company_data(company)
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
        _generate_meta_copy_bg, company_id, _company_data(company), audience
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
            _generate_meta_copy_bg, company_id, _company_data(company), audience
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

async def _generate_keyword_clusters_bg(company_id: str, company_data: dict):
    db = SessionLocal()
    try:
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
    except Exception as exc:
        log.error("Keyword clusters generation failed: %s", exc, exc_info=True)
        db.rollback()
        return []
    finally:
        db.close()


async def _generate_google_copy_bg(company_id: str, company_data: dict, cluster: dict):
    db = SessionLocal()
    try:
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
    except Exception as exc:
        log.error("Google ad copy generation failed: %s", exc, exc_info=True)
        db.rollback()
    finally:
        db.close()


async def _generate_all_google_bg(company_id: str, company_data: dict):
    db = SessionLocal()
    try:
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
        if isinstance(clusters, list):
            for cluster in clusters[:6]:
                copy = llm_service.generate_google_ad_copy(company_data, cluster)
                copy_ci = ContentItem(
                    company_id=company_id,
                    content_type=ContentType.ad_copy_google,
                    status=ContentStatus.pending_review,
                    title=f"Google RSA — {cluster.get('cluster_name', 'Ad Group')}",
                    body="\n".join(copy.get("headlines", [])),
                    extra_data={**copy, "cluster": cluster},
                )
                db.add(copy_ci)
                db.flush()
                _add_approval(db, company_id, copy_ci, "paid_ads", "google_ad_copy")
        db.commit()
    except Exception as exc:
        log.error("Generate all Google ads failed: %s", exc, exc_info=True)
        db.rollback()
    finally:
        db.close()


async def _generate_meta_copy_bg(company_id: str, company_data: dict, audience: dict):
    db = SessionLocal()
    try:
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
    except Exception as exc:
        log.error("Meta ad copy generation failed: %s", exc, exc_info=True)
        db.rollback()
    finally:
        db.close()


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
    background_tasks.add_task(_generate_reddit_ads_bg, company_id, _company_data(company))
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
    background_tasks.add_task(_generate_platform_ads_bg, company_id, _company_data(company), "microsoft")
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
    background_tasks.add_task(_generate_quora_ads_bg, company_id, _company_data(company))
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
    background_tasks.add_task(_generate_platform_ads_bg, company_id, _company_data(company), "tiktok")
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
    background_tasks.add_task(_generate_platform_ads_bg, company_id, _company_data(company), "linkedin")
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
    background_tasks.add_task(_generate_pinterest_ads_bg, company_id, _company_data(company))
    return {"status": "generating", "platform": "pinterest"}


# ------------------------------------------------------------------ #
# Platform-specific background generators
# ------------------------------------------------------------------ #

# ── Simple inline-prompt platforms (Microsoft, TikTok, LinkedIn) ──────────────

PLATFORM_PROMPTS = {
    "microsoft": (
        "You are a Microsoft Advertising specialist for healthcare. "
        "Generate 3 Bing Responsive Search Ads for {name}, a {niche} clinic. "
        "Audience: 45+ adults, higher income, insurance-focused. "
        "Strict character limits: headlines ≤30 chars, descriptions ≤90 chars. "
        "Return ONLY valid JSON: "
        '{"ads": [{"headline_1": "≤30 chars", "headline_2": "≤30 chars", "headline_3": "≤30 chars", '
        '"description_1": "≤90 chars", "description_2": "≤90 chars", '
        '"sitelinks": [{"text": "sitelink label", "description": "one line"}]}]}'
    ),
    "tiktok": (
        "You are a TikTok Ads specialist for healthcare. "
        "Generate 3 TikTok In-Feed Video Ad scripts for {name}, a {niche} clinic. "
        "15-30 seconds. Gen Z / Millennial tone. Sound-off friendly. Hook within 2 seconds. "
        "Return ONLY valid JSON: "
        '{"ads": [{"hook": "attention-grabbing first 2 seconds", '
        '"voiceover": "full 15-30 second voiceover script", '
        '"on_screen_text": ["overlay 1", "overlay 2", "overlay 3", "overlay 4"], '
        '"hashtags": ["#tag1", "#tag2", "#tag3", "#tag4", "#tag5"], '
        '"cta": "end-card call to action"}]}'
    ),
    "linkedin": (
        "You are a LinkedIn Ads specialist for B2B healthcare marketing. "
        "Generate 3 LinkedIn Sponsored Content ads for {name}, a {niche} clinic. "
        "Target: PCPs, therapists, HR managers, EAP coordinators. "
        "Professional but warm. Focus on referral partnerships and patient outcomes. "
        "Return ONLY valid JSON: "
        '{"ads": [{"headline": "≤150 chars", "intro_text": "≤600 chars compelling intro", '
        '"cta_label": "Learn More|Contact Us|Get Started|Download"}]}'
    ),
}

_PLATFORM_BODY_FIELD = {
    "microsoft": "description_1",
    "tiktok": "voiceover",
    "linkedin": "intro_text",
}

_PLATFORM_AD_TITLE = {
    "microsoft": lambda ad, name, i: f"Bing RSA #{i} — {ad.get('headline_1', name)}",
    "tiktok": lambda ad, name, i: f"TikTok Script #{i} — {ad.get('hook', name)}",
    "linkedin": lambda ad, name, i: ad.get("headline", f"LinkedIn Ad #{i} — {name}"),
}


async def _generate_platform_ads_bg(company_id: str, company_data: dict, platform: str):
    """Background task for Microsoft, TikTok, and LinkedIn (inline-prompt platforms)."""
    db = SessionLocal()
    name = company_data.get("company_name", "our clinic")
    niche = company_data.get("specialty_niche", "behavioral health")

    prompt = (
        PLATFORM_PROMPTS.get(
            platform,
            'Generate 3 ads for {name}, a {niche} clinic. Return JSON: {"ads": [{"title": "...", "body": "..."}]}',
        )
        .replace("{name}", name)
        .replace("{niche}", niche)
    )

    ads: list = []
    try:
        result = llm_service._chat_json(prompt, max_tokens=2500)
        if isinstance(result, dict) and "ads" in result:
            ads = result["ads"]
        elif isinstance(result, list):
            ads = result
    except Exception:
        pass

    if not ads:
        ads = [{"title": f"{platform.title()} Ad — {name}", "body": f"[{platform.title()} ads pending]"}]

    body_field = _PLATFORM_BODY_FIELD.get(platform, "body")
    title_fn = _PLATFORM_AD_TITLE.get(platform, lambda ad, n, i: ad.get("title", f"{platform.title()} Ad #{i} — {n}"))

    try:
        for i, ad in enumerate(ads[:5], start=1):
            body_text = ad.get(body_field) or ad.get("body") or ad.get("voiceover") or str(ad)
            ad_title = title_fn(ad, name, i)
            ci = ContentItem(
                company_id=company_id,
                content_type=ContentType.ad_copy_google,
                status=ContentStatus.pending_review,
                title=str(ad_title)[:500],
                body=body_text,
                extra_data={**ad, "platform": platform, "body": body_text},
            )
            db.add(ci)
            db.flush()
            _add_approval(db, company_id, ci, "paid_ads", f"{platform}_ad_copy")
        db.commit()
    except Exception as exc:
        log.error("Platform ads DB save failed for %s: %s", platform, exc, exc_info=True)
        db.rollback()
    finally:
        db.close()


# ── World-class Quora Ads ─────────────────────────────────────────────────────

async def _generate_quora_ads_bg(company_id: str, company_data: dict):
    """Background task for Quora — uses world-class llm_service.generate_quora_ads()."""
    db = SessionLocal()
    name = company_data.get("company_name", "our clinic")
    try:
        result = llm_service.generate_quora_ads(company_data)
        if not isinstance(result, dict):
            raise ValueError("LLM returned non-dict for Quora ads")

        # 1. Promoted Answers — the highest-value Quora format
        for i, ans in enumerate(result.get("promoted_answers", [])[:5], start=1):
            body = ans.get("answer_text", "")
            ci = ContentItem(
                company_id=company_id,
                content_type=ContentType.ad_copy_google,
                status=ContentStatus.pending_review,
                title=f"Quora Promoted Answer #{i} — {ans.get('target_question', name)[:200]}",
                body=body,
                extra_data={**ans, "platform": "quora", "format": "promoted_answer", "body": body},
            )
            db.add(ci)
            db.flush()
            _add_approval(db, company_id, ci, "paid_ads", "quora_promoted_answer")

        # 2. Text Ads
        for i, ad in enumerate(result.get("text_ads", [])[:3], start=1):
            body = ad.get("body", "")
            ci = ContentItem(
                company_id=company_id,
                content_type=ContentType.ad_copy_google,
                status=ContentStatus.pending_review,
                title=f"Quora Text Ad {ad.get('variant', i)} — {ad.get('headline', name)[:200]}",
                body=body,
                extra_data={**ad, "platform": "quora", "format": "text_ad", "body": body},
            )
            db.add(ci)
            db.flush()
            _add_approval(db, company_id, ci, "paid_ads", "quora_text_ad")

        # 3. Targeting strategy summary (single item)
        targeting = result.get("targeting_strategy", {})
        if targeting:
            summary = (
                f"Question targeting: {len(targeting.get('question_targeting', []))} questions | "
                f"Topic targeting: {len(targeting.get('topic_targeting', []))} topics | "
                f"Keyword targeting: {len(targeting.get('keyword_targeting', []))} keywords"
            )
            ci = ContentItem(
                company_id=company_id,
                content_type=ContentType.ad_copy_google,
                status=ContentStatus.pending_review,
                title=f"Quora Targeting Strategy — {name}",
                body=summary,
                extra_data={**targeting, "platform": "quora", "format": "targeting_strategy", "body": summary},
            )
            db.add(ci)
            db.flush()
            _add_approval(db, company_id, ci, "paid_ads", "quora_targeting_strategy")

        db.commit()
        log.info("Quora ads generated and saved for company %s", company_id)
    except Exception as exc:
        log.error("Quora ads generation failed for %s: %s", company_id, exc, exc_info=True)
        db.rollback()
    finally:
        db.close()


# ── World-class Reddit Ads ────────────────────────────────────────────────────

async def _generate_reddit_ads_bg(company_id: str, company_data: dict):
    """Background task for Reddit — uses world-class llm_service.generate_reddit_ads()."""
    db = SessionLocal()
    name = company_data.get("company_name", "our clinic")
    try:
        result = llm_service.generate_reddit_ads(company_data)
        if not isinstance(result, dict):
            raise ValueError("LLM returned non-dict for Reddit ads")

        # 1. Promoted Posts — the most effective Reddit format
        for i, post in enumerate(result.get("promoted_posts", [])[:5], start=1):
            body = post.get("post_body", "")
            ci = ContentItem(
                company_id=company_id,
                content_type=ContentType.ad_copy_google,
                status=ContentStatus.pending_review,
                title=f"Reddit Promoted Post #{i} ({post.get('target_subreddit', 'r/mentalhealth')}) — {post.get('post_title', name)[:200]}",
                body=body,
                extra_data={**post, "platform": "reddit", "format": "promoted_post", "body": body},
            )
            db.add(ci)
            db.flush()
            _add_approval(db, company_id, ci, "paid_ads", "reddit_promoted_post")

        # 2. Conversation Starter Posts
        for i, post in enumerate(result.get("conversation_starters", [])[:3], start=1):
            body = post.get("body", "")
            ci = ContentItem(
                company_id=company_id,
                content_type=ContentType.ad_copy_google,
                status=ContentStatus.pending_review,
                title=f"Reddit Conversation Starter #{i} ({post.get('subreddit', 'r/mentalhealth')}) — {post.get('title', name)[:200]}",
                body=body,
                extra_data={**post, "platform": "reddit", "format": "conversation_starter", "body": body},
            )
            db.add(ci)
            db.flush()
            _add_approval(db, company_id, ci, "paid_ads", "reddit_conversation_starter")

        # 3. Subreddit strategy summary
        strategy = result.get("subreddit_strategy", [])
        if strategy:
            summary = " | ".join(
                f"{s.get('subreddit', '')}: {s.get('content_angle', '')}"
                for s in strategy[:5]
            )
            ci = ContentItem(
                company_id=company_id,
                content_type=ContentType.ad_copy_google,
                status=ContentStatus.pending_review,
                title=f"Reddit Subreddit Strategy — {name}",
                body=summary,
                extra_data={"strategy": strategy, "platform": "reddit", "format": "subreddit_strategy", "body": summary},
            )
            db.add(ci)
            db.flush()
            _add_approval(db, company_id, ci, "paid_ads", "reddit_subreddit_strategy")

        db.commit()
        log.info("Reddit ads generated and saved for company %s", company_id)
    except Exception as exc:
        log.error("Reddit ads generation failed for %s: %s", company_id, exc, exc_info=True)
        db.rollback()
    finally:
        db.close()


# ── World-class Pinterest Ads ─────────────────────────────────────────────────

async def _generate_pinterest_ads_bg(company_id: str, company_data: dict):
    """Background task for Pinterest — uses world-class llm_service.generate_pinterest_ads()."""
    db = SessionLocal()
    name = company_data.get("company_name", "our clinic")
    try:
        result = llm_service.generate_pinterest_ads(company_data)
        if not isinstance(result, dict):
            raise ValueError("LLM returned non-dict for Pinterest ads")

        # 1. Standard Pins — the core Pinterest format
        for i, pin in enumerate(result.get("standard_pins", [])[:5], start=1):
            body = pin.get("description", "")
            image = pin.get("image_concept", {})
            image_summary = (
                image.get("text_overlay", "") if isinstance(image, dict)
                else str(image)
            )
            ci = ContentItem(
                company_id=company_id,
                content_type=ContentType.ad_copy_google,
                status=ContentStatus.pending_review,
                title=f"Pinterest Standard Pin #{i} — {pin.get('title', name)[:200]}",
                body=body,
                extra_data={**pin, "platform": "pinterest", "format": "standard_pin", "body": body, "image_summary": image_summary},
            )
            db.add(ci)
            db.flush()
            _add_approval(db, company_id, ci, "paid_ads", "pinterest_standard_pin")

        # 2. Carousel Pins
        for i, carousel in enumerate(result.get("carousel_pins", [])[:2], start=1):
            cards = carousel.get("cards", [])
            body = carousel.get("theme", "") or f"{len(cards)}-card carousel"
            ci = ContentItem(
                company_id=company_id,
                content_type=ContentType.ad_copy_google,
                status=ContentStatus.pending_review,
                title=f"Pinterest Carousel Pin #{i} — {carousel.get('concept_name', name)[:200]}",
                body=body,
                extra_data={**carousel, "platform": "pinterest", "format": "carousel_pin", "body": body},
            )
            db.add(ci)
            db.flush()
            _add_approval(db, company_id, ci, "paid_ads", "pinterest_carousel_pin")

        # 3. Video Pins
        for i, video in enumerate(result.get("video_pins", [])[:2], start=1):
            body = video.get("full_voiceover_script", "") or video.get("hook_frame", "")
            ci = ContentItem(
                company_id=company_id,
                content_type=ContentType.ad_copy_google,
                status=ContentStatus.pending_review,
                title=f"Pinterest Video Pin #{i} ({video.get('duration', '30s')}) — {name}",
                body=body,
                extra_data={**video, "platform": "pinterest", "format": "video_pin", "body": body},
            )
            db.add(ci)
            db.flush()
            _add_approval(db, company_id, ci, "paid_ads", "pinterest_video_pin")

        # 4. Board strategy + SEO summary
        seo = result.get("pinterest_seo", {})
        boards = result.get("board_strategy", [])
        if seo or boards:
            summary = (
                f"Profile bio: {seo.get('profile_bio', '')} | "
                f"{len(boards)} boards recommended | "
                f"{len(seo.get('top_keywords', []))} SEO keywords"
            )
            ci = ContentItem(
                company_id=company_id,
                content_type=ContentType.ad_copy_google,
                status=ContentStatus.pending_review,
                title=f"Pinterest Board Strategy & SEO — {name}",
                body=summary,
                extra_data={"seo": seo, "boards": boards, "platform": "pinterest", "format": "board_strategy", "body": summary},
            )
            db.add(ci)
            db.flush()
            _add_approval(db, company_id, ci, "paid_ads", "pinterest_board_strategy")

        db.commit()
        log.info("Pinterest ads generated and saved for company %s", company_id)
    except Exception as exc:
        log.error("Pinterest ads generation failed for %s: %s", company_id, exc, exc_info=True)
        db.rollback()
    finally:
        db.close()


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
