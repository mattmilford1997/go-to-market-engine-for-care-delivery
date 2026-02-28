from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from app.db.database import get_db
from app.models.content import ApprovalItem, ContentItem, ContentStatus

router = APIRouter(prefix="/approval", tags=["approval"])


class ApprovalAction(BaseModel):
    action: str  # approve | reject | edit_and_approve
    reviewer_notes: Optional[str] = None
    edited_content: Optional[dict] = None  # For edit_and_approve


@router.get("/{company_id}/queue")
async def get_approval_queue(
    company_id: str,
    module: Optional[str] = None,
    db: Session = Depends(get_db),
):
    query = db.query(ApprovalItem).filter(
        ApprovalItem.company_id == company_id,
        ApprovalItem.status == "pending",
    )
    if module:
        query = query.filter(ApprovalItem.module == module)

    items = query.order_by(ApprovalItem.created_at.desc()).all()
    return [_item_to_dict(item) for item in items]


@router.get("/{company_id}/queue/count")
async def queue_count(company_id: str, db: Session = Depends(get_db)):
    count = db.query(ApprovalItem).filter(
        ApprovalItem.company_id == company_id,
        ApprovalItem.status == "pending",
    ).count()
    return {"pending": count}


@router.post("/{company_id}/items/{item_id}/action")
async def process_approval(
    company_id: str,
    item_id: str,
    payload: ApprovalAction,
    db: Session = Depends(get_db),
):
    item = db.query(ApprovalItem).filter(
        ApprovalItem.id == item_id,
        ApprovalItem.company_id == company_id,
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Approval item not found")

    if payload.action == "approve":
        item.status = "approved"
        item.reviewer_notes = payload.reviewer_notes
        # Update linked content item if exists
        if item.content_item_id:
            ci = db.query(ContentItem).filter(ContentItem.id == item.content_item_id).first()
            if ci:
                ci.status = ContentStatus.approved
    elif payload.action == "reject":
        item.status = "rejected"
        item.reviewer_notes = payload.reviewer_notes
        if item.content_item_id:
            ci = db.query(ContentItem).filter(ContentItem.id == item.content_item_id).first()
            if ci:
                ci.status = ContentStatus.rejected
                ci.rejection_reason = payload.reviewer_notes
    elif payload.action == "edit_and_approve":
        item.status = "approved"
        item.reviewer_notes = payload.reviewer_notes
        if payload.edited_content:
            item.preview_data = {**item.preview_data, **payload.edited_content}
        if item.content_item_id:
            ci = db.query(ContentItem).filter(ContentItem.id == item.content_item_id).first()
            if ci:
                ci.status = ContentStatus.approved
                if payload.edited_content and "body" in payload.edited_content:
                    ci.body = payload.edited_content["body"]
    else:
        raise HTTPException(status_code=400, detail=f"Unknown action: {payload.action}")

    db.commit()
    return {"status": "ok", "item_id": item_id, "action": payload.action}


@router.post("/{company_id}/bulk-approve")
async def bulk_approve(
    company_id: str,
    payload: dict,  # {"item_ids": [...]} or {"module": "..."} for approve-all
    db: Session = Depends(get_db),
):
    query = db.query(ApprovalItem).filter(
        ApprovalItem.company_id == company_id,
        ApprovalItem.status == "pending",
    )

    if payload.get("item_ids"):
        query = query.filter(ApprovalItem.id.in_(payload["item_ids"]))
    elif payload.get("module"):
        query = query.filter(ApprovalItem.module == payload["module"])

    items = query.all()
    for item in items:
        item.status = "approved"
        if item.content_item_id:
            ci = db.query(ContentItem).filter(ContentItem.id == item.content_item_id).first()
            if ci:
                ci.status = ContentStatus.approved

    db.commit()
    return {"approved_count": len(items)}


@router.get("/{company_id}/history")
async def approval_history(
    company_id: str,
    status: Optional[str] = None,
    limit: int = 50,
    db: Session = Depends(get_db),
):
    query = db.query(ApprovalItem).filter(ApprovalItem.company_id == company_id)
    if status:
        query = query.filter(ApprovalItem.status == status)
    items = query.order_by(ApprovalItem.created_at.desc()).limit(limit).all()
    return [_item_to_dict(item) for item in items]


def _item_to_dict(item: ApprovalItem) -> dict:
    return {
        "id": str(item.id),
        "company_id": str(item.company_id),
        "content_item_id": str(item.content_item_id) if item.content_item_id else None,
        "item_type": item.item_type,
        "title": item.title,
        "preview_data": item.preview_data,
        "status": item.status,
        "module": item.module,
        "reviewer_notes": item.reviewer_notes,
        "created_at": item.created_at.isoformat() if item.created_at else None,
    }
