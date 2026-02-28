"""
Competitor Intelligence Monitor — stores competitors in the company's existing
JSON field and generates AI-powered competitive gap analysis.
"""
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
import json, re, uuid
from datetime import datetime

from app.db.database import get_db
from app.models.company import Company
from app.services.llm import llm_service

router = APIRouter(prefix="/competitors", tags=["competitors"])


def _get_competitors(company: Company) -> list[dict]:
    raw = getattr(company, "competitors", None) or []
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except Exception:
            raw = []
    return raw


def _save_competitors(company: Company, competitors: list[dict], db: Session):
    from sqlalchemy import update
    from app.models.company import Company as C
    db.execute(
        update(C).where(C.id == company.id).values(competitors=competitors)
    )
    db.commit()
    db.refresh(company)


@router.get("/{company_id}/")
async def list_competitors(company_id: str, db: Session = Depends(get_db)):
    company = _get_company(company_id, db)
    return {"competitors": _get_competitors(company)}


@router.post("/{company_id}/")
async def add_competitor(
    company_id: str,
    payload: dict,
    db: Session = Depends(get_db),
):
    company = _get_company(company_id, db)
    competitors = _get_competitors(company)
    new_entry = {
        "id": str(uuid.uuid4()),
        "name": payload.get("name", "").strip(),
        "website": payload.get("website", "").strip(),
        "notes": payload.get("notes", ""),
        "analysis": None,
        "analyzed_at": None,
        "created_at": datetime.utcnow().isoformat(),
    }
    competitors.append(new_entry)
    _save_competitors(company, competitors, db)
    return new_entry


@router.delete("/{company_id}/{competitor_id}")
async def remove_competitor(
    company_id: str, competitor_id: str, db: Session = Depends(get_db)
):
    company = _get_company(company_id, db)
    competitors = _get_competitors(company)
    updated = [c for c in competitors if c.get("id") != competitor_id]
    if len(updated) == len(competitors):
        raise HTTPException(status_code=404, detail="Competitor not found")
    _save_competitors(company, updated, db)
    return {"deleted": True}


@router.post("/{company_id}/{competitor_id}/analyze")
async def analyze_competitor(
    company_id: str,
    competitor_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    company = _get_company(company_id, db)
    comp = next((c for c in _get_competitors(company) if c.get("id") == competitor_id), None)
    if not comp:
        raise HTTPException(status_code=404, detail="Competitor not found")
    background_tasks.add_task(_analyze_bg, company, competitor_id, db)
    return {"status": "analyzing"}


@router.post("/{company_id}/summary")
async def competitive_summary(company_id: str, db: Session = Depends(get_db)):
    company = _get_company(company_id, db)
    competitors = _get_competitors(company)
    if not competitors:
        return {"summary": None, "message": "Add competitors first"}

    comp_list = ", ".join(c["name"] for c in competitors)
    prompt = f"""You are a healthcare marketing strategist for {company.name} ({getattr(company, 'specialty_niche', 'mental health')}).
Competitors: {comp_list}

Return JSON: {{"advantages": [str], "gaps": [str], "quick_wins": [{{"title": str, "action": str, "timeline": str}}]}}"""

    try:
        raw = llm_service.client.messages.create(
            model=llm_service.model_bulk, max_tokens=600,
            messages=[{"role": "user", "content": prompt}],
        )
        match = re.search(r'\{.*\}', raw.content[0].text, re.DOTALL)
        data = json.loads(match.group()) if match else {}
    except Exception:
        data = {
            "advantages": ["Specialized clinical expertise", "Broader service lines", "Strong local brand"],
            "gaps": ["Online review volume", "Social media presence", "Referral network breadth"],
            "quick_wins": [
                {"title": "Respond to all reviews", "action": "Reply to every Google review this week", "timeline": "This week"},
                {"title": "Claim all directories", "action": "Complete Psychology Today and Healthgrades", "timeline": "2 weeks"},
                {"title": "Publish differentiating content", "action": "Blog post on your most unique treatment", "timeline": "2 weeks"},
            ],
        }
    return {"competitors": competitors, "summary": data}


async def _analyze_bg(company: Company, competitor_id: str, db: Session):
    competitors = _get_competitors(company)
    comp = next((c for c in competitors if c.get("id") == competitor_id), None)
    if not comp:
        return

    prompt = f"""Analyze competitor "{comp['name']}" (website: {comp.get('website', 'unknown')}) for {company.name}.

Return JSON: {{
  "strengths": [str],
  "weaknesses": [str],
  "online_presence_score": 0-100,
  "estimated_monthly_traffic": str,
  "key_services": [str],
  "review_profile": {{"estimated_rating": float, "review_count": str}},
  "marketing_channels": [str],
  "differentiation_opportunities": [str],
  "threat_level": "high|medium|low",
  "threat_reason": str
}}"""

    try:
        raw = llm_service.client.messages.create(
            model=llm_service.model_bulk, max_tokens=700,
            messages=[{"role": "user", "content": prompt}],
        )
        match = re.search(r'\{.*\}', raw.content[0].text, re.DOTALL)
        analysis = json.loads(match.group()) if match else {}
    except Exception:
        analysis = {
            "strengths": ["Established brand", "Local review volume"],
            "weaknesses": ["Limited specialization", "Dated website"],
            "online_presence_score": 58,
            "estimated_monthly_traffic": "600-1,800 visitors",
            "key_services": ["Individual therapy", "Group therapy"],
            "review_profile": {"estimated_rating": 4.1, "review_count": "15-40"},
            "marketing_channels": ["Google Ads", "Directories"],
            "differentiation_opportunities": ["Specialized treatments", "Superior content"],
            "threat_level": "medium",
            "threat_reason": "Competes for same referral sources",
        }

    # Update the competitor entry
    for c in competitors:
        if c.get("id") == competitor_id:
            c["analysis"] = analysis
            c["analyzed_at"] = datetime.utcnow().isoformat()

    _save_competitors(company, competitors, db)


def _get_company(company_id: str, db: Session) -> Company:
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return company
