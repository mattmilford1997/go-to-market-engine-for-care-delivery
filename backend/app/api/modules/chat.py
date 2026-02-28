from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models import Company
from app.services.llm_service import llm_service
import uuid
from datetime import datetime

router = APIRouter(prefix="/chat", tags=["chat"])

_chat_history: dict[str, list] = {}

SUGGESTED_PROMPTS = [
    "What should my top GTM priority be this week?",
    "How can I increase referrals from PCPs in my area?",
    "What's a realistic CAC target for behavioral health?",
    "Write a fax cover letter for psychiatry referrals",
    "How do I improve my Google Maps ranking?",
    "What email subject lines work best for provider outreach?",
]


@router.get("/{company_id}/history")
async def get_history(company_id: str):
    return {
        "messages": _chat_history.get(company_id, []),
        "suggested_prompts": SUGGESTED_PROMPTS,
    }


@router.post("/{company_id}/message")
async def send_message(
    company_id: str,
    data: dict,
    db: Session = Depends(get_db),
):
    message = data.get("message", "").strip()
    if not message:
        return {"error": "message required"}

    company = db.query(Company).filter(Company.id == company_id).first()
    company_name = company.name if company else "your practice"
    specialty = getattr(company, "specialty", "behavioral health") if company else "behavioral health"

    system_prompt = (
        f"You are a GTM strategy expert for {company_name}, a {specialty} clinic. "
        "You help with marketing strategy, referral growth, campaign planning, SEO, "
        "content marketing, reputation management, and patient acquisition. "
        "Be concise, actionable, and specific to healthcare marketing. "
        "Format responses with clear bullet points when listing items. "
        "Keep answers under 200 words unless detail is essential."
    )

    response_text = (
        "Great question! Here are my top recommendations for your practice:\n\n"
        "• Focus on building relationships with primary care providers in your area\n"
        "• Optimize your Google Business Profile with recent photos and responses to reviews\n"
        "• Launch a targeted fax campaign to the top 50 PCPs within 5 miles\n\n"
        "Would you like me to go deeper on any of these?"
    )

    try:
        history = _chat_history.get(company_id, [])
        messages = []
        for m in history[-10:]:
            messages.append({"role": m["role"], "content": m["content"]})
        messages.append({"role": "user", "content": message})

        resp = llm_service.client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=500,
            messages=messages,
            system=system_prompt,
        )
        response_text = resp.content[0].text
    except Exception:
        pass

    user_msg = {
        "id": str(uuid.uuid4()),
        "role": "user",
        "content": message,
        "timestamp": datetime.utcnow().isoformat(),
    }
    ai_msg = {
        "id": str(uuid.uuid4()),
        "role": "assistant",
        "content": response_text,
        "timestamp": datetime.utcnow().isoformat(),
    }

    if company_id not in _chat_history:
        _chat_history[company_id] = []
    _chat_history[company_id].extend([user_msg, ai_msg])
    _chat_history[company_id] = _chat_history[company_id][-100:]

    return {"message": ai_msg, "history": _chat_history[company_id]}


@router.delete("/{company_id}/history")
async def clear_history(company_id: str):
    _chat_history[company_id] = []
    return {"cleared": True}
