"""
Reputation & Review Management — aggregate patient reviews, track sentiment,
and generate AI-crafted response suggestions for each review.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import json, re
from datetime import date, timedelta
import random

from app.db.database import get_db
from app.models.company import Company
from app.services.llm import llm_service

router = APIRouter(prefix="/reputation", tags=["reputation"])

# In-memory review cache — seeded by /demo/{company_id}/load-all or persists reviews across requests
_review_cache: dict[str, list] = {}

# Demo review pool (populated with realistic behavioral-health reviews)
_DEMO_REVIEWS = [
    {"id": "r1", "platform": "Google", "author": "Jessica M.", "rating": 5,
     "text": "This practice changed my life. The TMS therapy was incredibly effective for my depression. The staff is compassionate and professional.",
     "date": str(date.today() - timedelta(days=3)), "responded": False},
    {"id": "r2", "platform": "Google", "author": "Anonymous", "rating": 2,
     "text": "Hard to get an appointment. Waited 3 weeks for my first session. The billing department was also confusing.",
     "date": str(date.today() - timedelta(days=8)), "responded": False},
    {"id": "r3", "platform": "Healthgrades", "author": "Thomas R.", "rating": 5,
     "text": "Dr. Chen is the best psychiatrist I've seen. She really listens and adjusted my treatment plan thoughtfully.",
     "date": str(date.today() - timedelta(days=14)), "responded": True,
     "response": "Thank you so much for this kind review, Thomas! We're thrilled to hear about your positive experience."},
    {"id": "r4", "platform": "Psychology Today", "author": "Sarah K.", "rating": 4,
     "text": "Good therapists, modern office. Would be 5 stars if scheduling was easier online.",
     "date": str(date.today() - timedelta(days=21)), "responded": False},
    {"id": "r5", "platform": "Google", "author": "Michael B.", "rating": 5,
     "text": "Ketamine infusion therapy here was life-changing after years of treatment-resistant depression. Highly recommend.",
     "date": str(date.today() - timedelta(days=28)), "responded": False},
    {"id": "r6", "platform": "Yelp", "author": "Patricia L.", "rating": 3,
     "text": "The therapists are good but the administrative side needs work. Billing errors and difficulty reaching the front desk.",
     "date": str(date.today() - timedelta(days=35)), "responded": False},
    {"id": "r7", "platform": "Google", "author": "David W.", "rating": 5,
     "text": "Amazing team. My son has been doing much better since starting treatment here. We're so grateful.",
     "date": str(date.today() - timedelta(days=42)), "responded": True,
     "response": "Thank you for sharing this, David. Supporting your son's journey means everything to us."},
    {"id": "r8", "platform": "Healthgrades", "author": "Rachel S.", "rating": 4,
     "text": "Very knowledgeable providers. Would appreciate better parking options at the main location.",
     "date": str(date.today() - timedelta(days=50)), "responded": False},
]


@router.get("/{company_id}/reviews")
async def get_reviews(
    company_id: str,
    platform: str = "all",
    limit: int = 50,
    db: Session = Depends(get_db),
):
    _get_company(company_id, db)
    reviews = _review_cache.get(company_id, _DEMO_REVIEWS)[:limit]
    if platform != "all":
        reviews = [r for r in reviews if r["platform"].lower() == platform.lower()]
    return {"reviews": reviews, "total": len(reviews)}


@router.get("/{company_id}/summary")
async def get_reputation_summary(company_id: str, db: Session = Depends(get_db)):
    company = _get_company(company_id, db)

    reviews = _review_cache.get(company_id, _DEMO_REVIEWS)
    total = len(reviews)
    avg_rating = round(sum(r["rating"] for r in reviews) / max(total, 1), 1)
    five_star = sum(1 for r in reviews if r["rating"] == 5)
    needs_response = sum(1 for r in reviews if not r.get("responded") and r["rating"] <= 3)

    # Sentiment by platform
    platforms: dict[str, list[float]] = {}
    for r in reviews:
        p = r["platform"]
        platforms.setdefault(p, []).append(r["rating"])
    by_platform = [
        {"platform": p, "avg": round(sum(ratings) / len(ratings), 1), "count": len(ratings)}
        for p, ratings in platforms.items()
    ]

    # Rating distribution
    dist = {str(i): sum(1 for r in reviews if r["rating"] == i) for i in range(1, 6)}

    # Monthly trend (mock)
    months = []
    base = date.today().replace(day=1)
    for i in range(6):
        m = base - timedelta(days=30 * i)
        months.append({
            "month": m.strftime("%b %Y"),
            "avg_rating": round(4.0 + random.uniform(-0.3, 0.4), 1),
            "review_count": random.randint(2, 8),
        })
    months.reverse()

    return {
        "total_reviews": total,
        "average_rating": avg_rating,
        "five_star_count": five_star,
        "needs_response": needs_response,
        "by_platform": by_platform,
        "rating_distribution": dist,
        "monthly_trend": months,
        "online_presence": getattr(company, "existing_online_presence", {}) or {},
    }


@router.post("/{company_id}/reviews/{review_id}/suggest-response")
async def suggest_response(
    company_id: str,
    review_id: str,
    db: Session = Depends(get_db),
):
    company = _get_company(company_id, db)
    review = next((r for r in _review_cache.get(company_id, _DEMO_REVIEWS) if r["id"] == review_id), None)
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")

    tone = "empathetic and grateful" if review["rating"] >= 4 else "empathetic, apologetic, and solution-focused"
    prompt = f"""You are writing a {tone} response on behalf of {company.name}, a behavioral health practice.

Patient review ({review['rating']}/5 stars):
"{review['text']}"

Write a professional, HIPAA-compliant response (do NOT reference specific treatments or confirm care).
Keep it under 120 words. Be warm, genuine, and human — not corporate.
Return JSON: {{"response": str, "tone": str, "word_count": int}}"""

    try:
        raw = llm_service.client.messages.create(
            model=llm_service.model_bulk,
            max_tokens=300,
            messages=[{"role": "user", "content": prompt}],
        )
        text = raw.content[0].text
        match = re.search(r'\{.*\}', text, re.DOTALL)
        data = json.loads(match.group()) if match else {}
    except Exception:
        if review["rating"] >= 4:
            data = {
                "response": f"Thank you so much for taking the time to share your experience with us! We're truly grateful for your kind words and are so glad you're happy with your care. It means the world to our team. We look forward to continuing to support you.",
                "tone": "warm and grateful",
                "word_count": 45,
            }
        else:
            data = {
                "response": f"Thank you for your honest feedback. We sincerely apologize that your experience didn't meet your expectations. We take all concerns seriously and would love the opportunity to make this right. Please reach out to our team directly so we can address this personally.",
                "tone": "empathetic and solution-focused",
                "word_count": 48,
            }
    return {"review": review, **data}


@router.post("/{company_id}/analyze-sentiment")
async def analyze_overall_sentiment(company_id: str, db: Session = Depends(get_db)):
    company = _get_company(company_id, db)

    review_texts = "\n".join([f"[{r['rating']}★] {r['text']}" for r in _review_cache.get(company_id, _DEMO_REVIEWS)])
    prompt = f"""Analyze patient reviews for {company.name}:

{review_texts}

Return JSON: {{
  "overall_sentiment": "positive|mixed|negative",
  "sentiment_score": 0-100,
  "top_themes_positive": [str],
  "top_themes_negative": [str],
  "patient_priority": str,
  "recommended_actions": [str]
}}"""

    try:
        raw = llm_service.client.messages.create(
            model=llm_service.model_bulk,
            max_tokens=600,
            messages=[{"role": "user", "content": prompt}],
        )
        text = raw.content[0].text
        match = re.search(r'\{.*\}', text, re.DOTALL)
        data = json.loads(match.group()) if match else {}
    except Exception:
        data = {
            "overall_sentiment": "positive",
            "sentiment_score": 78,
            "top_themes_positive": ["Clinical quality", "Compassionate staff", "Treatment effectiveness"],
            "top_themes_negative": ["Scheduling difficulty", "Administrative processes", "Wait times"],
            "patient_priority": "Patients value clinical outcomes and staff empathy above all else",
            "recommended_actions": [
                "Implement online scheduling to address top complaint",
                "Train front desk staff on billing communication",
                "Add parking information to website and Google Maps listing",
            ],
        }
    return data


def _get_company(company_id: str, db: Session) -> Company:
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return company
