from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models import Campaign, ContentItem
from datetime import datetime
import uuid

router = APIRouter(prefix="/schedule", tags=["schedule"])


def _channel_color(channel: str) -> str:
    return {
        "fax": "#3b82f6",
        "email": "#8b5cf6",
        "voicemail": "#10b981",
        "google": "#ef4444",
        "meta": "#f59e0b",
        "content": "#a855f7",
        "seo": "#0ea5e9",
    }.get(channel or "", "#6b7280")


@router.get("/{company_id}/events")
async def get_events(
    company_id: str,
    month: int = None,
    year: int = None,
    db: Session = Depends(get_db),
):
    now = datetime.utcnow()
    month = month or now.month
    year = year or now.year

    events: list[dict] = []

    try:
        campaigns = db.query(Campaign).filter(Campaign.company_id == company_id).limit(100).all()
        for c in campaigns:
            date = c.created_at or now
            events.append({
                "id": str(c.id),
                "type": "campaign",
                "title": c.name,
                "channel": c.channel,
                "date": date.strftime("%Y-%m-%d"),
                "status": c.status,
                "color": _channel_color(c.channel),
            })
    except Exception:
        pass

    try:
        content = db.query(ContentItem).filter(ContentItem.company_id == company_id).limit(50).all()
        for item in content:
            date = item.created_at or now
            events.append({
                "id": str(item.id),
                "type": "content",
                "title": item.title or item.content_type,
                "channel": "content",
                "date": date.strftime("%Y-%m-%d"),
                "status": item.status,
                "color": _channel_color("content"),
            })
    except Exception:
        pass

    return {"events": events, "month": month, "year": year}


@router.post("/{company_id}/events")
async def create_event(company_id: str, data: dict):
    return {
        "id": str(uuid.uuid4()),
        "type": "scheduled",
        **data,
    }
