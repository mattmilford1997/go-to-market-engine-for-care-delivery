"""Module 3: Organic Content Engine API routes."""
import logging
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import Optional

from app.db.database import get_db, SessionLocal
from app.models.company import Company
from app.models.content import ContentItem, ApprovalItem, ContentType, ContentStatus
from app.services.llm import llm_service

log = logging.getLogger(__name__)

router = APIRouter(prefix="/content", tags=["content"])


@router.get("/{company_id}/calendar")
async def get_content_calendar(
    company_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Get or generate a 12-week content calendar."""
    company = _get_company(company_id, db)
    # Check if calendar exists in cache/content items
    existing = db.query(ContentItem).filter(
        ContentItem.company_id == company_id,
        ContentItem.content_type == ContentType.blog_post,
    ).count()

    if existing == 0:
        background_tasks.add_task(_generate_calendar_bg, company_id, _company_data(company))
        return {"status": "generating", "message": "Content calendar generation started"}

    posts = db.query(ContentItem).filter(
        ContentItem.company_id == company_id,
    ).order_by(ContentItem.created_at.desc()).limit(100).all()

    return {
        "status": "ok",
        "total_items": len(posts),
        "items": [_content_to_dict(p) for p in posts],
    }


@router.post("/{company_id}/generate/blog-post")
async def generate_blog_post(
    company_id: str,
    payload: dict,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Generate a single blog post. payload: {keyword: str, word_count: int}"""
    company = _get_company(company_id, db)
    keyword = payload.get("keyword", "mental health treatment")
    word_count = payload.get("word_count", 1500)
    background_tasks.add_task(
        _generate_blog_post_bg, company_id, _company_data(company), keyword, word_count
    )
    return {"status": "generating"}


@router.post("/{company_id}/generate/social-posts")
async def generate_social_posts(
    company_id: str,
    payload: dict,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    Generate social posts.
    payload: {platform: facebook|instagram|linkedin|all, count: int}
    """
    company = _get_company(company_id, db)
    platform = payload.get("platform", "all")
    count = payload.get("count", 5)

    platforms = ["facebook", "instagram", "linkedin"] if platform == "all" else [platform]
    for p in platforms:
        background_tasks.add_task(
            _generate_social_bg, company_id, _company_data(company), p, count
        )
    return {"status": "generating", "platforms": platforms}


@router.post("/{company_id}/generate/full-calendar")
async def generate_full_calendar(
    company_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Generate the full 12-week content calendar."""
    company = _get_company(company_id, db)
    background_tasks.add_task(_generate_calendar_bg, company_id, _company_data(company))
    return {"status": "generating"}


@router.get("/{company_id}/items")
async def list_content_items(
    company_id: str,
    content_type: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
):
    query = db.query(ContentItem).filter(ContentItem.company_id == company_id)
    if content_type:
        query = query.filter(ContentItem.content_type == content_type)
    if status:
        query = query.filter(ContentItem.status == status)
    total = query.count()
    items = query.order_by(ContentItem.created_at.desc()).offset(offset).limit(limit).all()
    return {"total": total, "items": [_content_to_dict(i) for i in items]}


@router.get("/{company_id}/items/{item_id}")
async def get_content_item(company_id: str, item_id: str, db: Session = Depends(get_db)):
    item = db.query(ContentItem).filter(
        ContentItem.id == item_id, ContentItem.company_id == company_id
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Content item not found")
    return _content_to_dict(item)


@router.patch("/{company_id}/items/{item_id}")
async def update_content_item(
    company_id: str, item_id: str, payload: dict, db: Session = Depends(get_db)
):
    item = db.query(ContentItem).filter(
        ContentItem.id == item_id, ContentItem.company_id == company_id
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Content item not found")
    for field in ("title", "body", "meta_description", "target_keyword", "reviewer_notes"):
        if field in payload:
            setattr(item, field, payload[field])
    db.commit()
    return _content_to_dict(item)


# ------------------------------------------------------------------ #
# Background Tasks
# ------------------------------------------------------------------ #

async def _generate_blog_post_bg(
    company_id: str, company_data: dict, keyword: str, word_count: int
):
    """Background task — owns its own DB session so the request session lifetime doesn't matter."""
    db = SessionLocal()
    try:
        post = llm_service.generate_blog_post(company_data, keyword, word_count)
        ci = ContentItem(
            company_id=company_id,
            content_type=ContentType.blog_post,
            status=ContentStatus.pending_review,
            title=post.get("title", keyword),
            body=post.get("body_markdown", ""),
            target_keyword=post.get("target_keyword", keyword),
            meta_description=post.get("meta_description", ""),
            extra_data={
                "slug": post.get("slug", ""),
                "secondary_keywords": post.get("secondary_keywords", []),
                "faq_schema": post.get("faq_schema", []),
                "word_count": post.get("estimated_word_count", word_count),
            },
        )
        db.add(ci)
        db.flush()
        _add_approval_item(db, company_id, ci, "content", "Blog Post")
        db.commit()
    except Exception as exc:
        log.error(
            "Blog post generation failed for company %s keyword=%r: %s",
            company_id, keyword, exc, exc_info=True,
        )
        db.rollback()
    finally:
        db.close()


async def _generate_social_bg(
    company_id: str, company_data: dict, platform: str, count: int,
    db: Session | None = None,
):
    """Background task — creates its own session when called directly; accepts a shared
    session when called from _generate_calendar_bg so all content commits together."""
    own_db = db is None
    if own_db:
        db = SessionLocal()
    try:
        posts = llm_service.generate_social_posts(company_data, platform, count)
        content_type_map = {
            "facebook": ContentType.social_facebook,
            "instagram": ContentType.social_instagram,
            "linkedin": ContentType.social_linkedin,
        }
        ct = content_type_map.get(platform, ContentType.social_facebook)

        for post in posts:
            ci = ContentItem(
                company_id=company_id,
                content_type=ct,
                status=ContentStatus.pending_review,
                title=f"{platform.title()} — {post.get('type', 'post').replace('_', ' ').title()}",
                body=post.get("caption", ""),
                extra_data={
                    "hashtags": post.get("hashtags", []),
                    "image_concept": post.get("image_concept", ""),
                    "best_days": post.get("best_days", []),
                    "best_times": post.get("best_times", []),
                    "platform": platform,
                },
            )
            db.add(ci)
            db.flush()
            _add_approval_item(db, company_id, ci, "content", f"{platform.title()} Post")
        if own_db:
            db.commit()
    except Exception as exc:
        log.error(
            "Social post generation failed for company %s platform=%s: %s",
            company_id, platform, exc, exc_info=True,
        )
        if own_db:
            db.rollback()
    finally:
        if own_db:
            db.close()


async def _generate_calendar_bg(company_id: str, company_data: dict):
    """Background task — owns its own DB session."""
    db = SessionLocal()
    try:
        # Single LLM call for the full 12-week plan
        calendar = llm_service.generate_content_calendar(company_data, weeks=12)
        weeks = calendar.get("weeks", [])

        # Create draft placeholder blog items — no per-post LLM call here.
        # This drops generation from 15+ sequential LLM calls (~10 min) to 4 total (~1 min).
        for week in weeks:
            for blog in week.get("blog_topics", []):
                ci = ContentItem(
                    company_id=company_id,
                    content_type=ContentType.blog_post,
                    status=ContentStatus.draft,
                    title=blog.get("title", "Blog Post"),
                    body="",
                    target_keyword=blog.get("target_keyword", ""),
                    extra_data={
                        "week": week.get("week"),
                        "theme": week.get("theme", ""),
                        "word_count": blog.get("word_count", 1500),
                        "planned": True,
                    },
                )
                db.add(ci)
                db.flush()
                # Add planned blog posts to approval queue so they appear for review/generation
                _add_approval_item(db, company_id, ci, "content", "Blog Post")
        db.flush()

        # Generate social posts (5 per platform, 3 platforms = 3 LLM calls)
        for platform in ["facebook", "instagram", "linkedin"]:
            await _generate_social_bg(company_id, company_data, platform, 5, db)

        db.commit()
    except Exception as exc:
        log.error("Calendar generation failed for company %s: %s", company_id, exc, exc_info=True)
        db.rollback()
    finally:
        db.close()


def _add_approval_item(db, company_id, content_item, module, type_label):
    item = ApprovalItem(
        company_id=company_id,
        content_item_id=content_item.id,
        item_type=type_label.lower().replace(" ", "_"),
        title=content_item.title,
        preview_data={
            "body_preview": (content_item.body or "")[:500],
            "content_type": content_item.content_type,
            **(content_item.extra_data or {}),
        },
        module=module,
    )
    db.add(item)


def _get_company(company_id: str, db: Session) -> Company:
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return company


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


def _content_to_dict(item: ContentItem) -> dict:
    return {
        "id": str(item.id),
        "content_type": item.content_type,
        "status": item.status,
        "title": item.title,
        "body": item.body or "",
        "target_keyword": item.target_keyword,
        "meta_description": item.meta_description,
        "extra_data": item.extra_data or {},
        "asset_url": item.asset_url,
        "published_url": item.published_url,
        "scheduled_for": item.scheduled_for,
        "created_at": item.created_at.isoformat() if item.created_at else None,
    }
