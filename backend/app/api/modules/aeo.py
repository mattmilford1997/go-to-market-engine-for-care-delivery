"""AI Engine Optimization (AEO / GEO) module.

Optimizes content for Google AI Overviews, Perplexity, ChatGPT Search,
Bing Copilot, and other generative-AI search surfaces.
"""
import re
import json
from fastapi import APIRouter, Depends, BackgroundTasks
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.models.company import Company
from app.services.llm import llm_service

router = APIRouter(prefix="/aeo", tags=["aeo"])

# ------------------------------------------------------------------ #
# In-memory cache for generated content
# ------------------------------------------------------------------ #
_aeo_cache: dict[str, dict] = {}


# ------------------------------------------------------------------ #
# Static scoring data
# ------------------------------------------------------------------ #
AEO_CHECKLIST_ITEMS = [
    {
        "category": "Structured Data",
        "items": [
            {"id": "schema-medical-business", "label": "MedicalBusiness JSON-LD schema on homepage", "impact": "high", "engine": "Google AI Overviews"},
            {"id": "schema-faq", "label": "FAQPage schema on service pages", "impact": "high", "engine": "All AI engines"},
            {"id": "schema-physician", "label": "Physician schema on provider profiles", "impact": "medium", "engine": "Google AI Overviews"},
            {"id": "schema-how-to", "label": "HowTo schema for treatment process pages", "impact": "medium", "engine": "Perplexity / ChatGPT"},
        ],
    },
    {
        "category": "Content for AI Citation",
        "items": [
            {"id": "content-qa-format", "label": "Pages use Question → Answer format with clear H2/H3 structure", "impact": "high", "engine": "All AI engines"},
            {"id": "content-concise-answers", "label": "Each service page answers 'What is X?' in first 100 words", "impact": "high", "engine": "Google AI Overviews"},
            {"id": "content-eeat", "label": "Provider credentials and clinical expertise prominently featured", "impact": "high", "engine": "Google / Perplexity"},
            {"id": "content-citations", "label": "Links to peer-reviewed research and authoritative sources", "impact": "medium", "engine": "Perplexity / ChatGPT"},
            {"id": "content-statistics", "label": "Specific statistics and outcome data included (e.g., '68% response rate')", "impact": "medium", "engine": "All AI engines"},
        ],
    },
    {
        "category": "Technical AEO",
        "items": [
            {"id": "tech-https", "label": "Site served over HTTPS with valid SSL certificate", "impact": "high", "engine": "All AI engines"},
            {"id": "tech-sitemap", "label": "XML sitemap submitted to Google Search Console", "impact": "medium", "engine": "Google AI Overviews"},
            {"id": "tech-robots", "label": "robots.txt allows AI crawlers (GPTBot, PerplexityBot, etc.)", "impact": "medium", "engine": "ChatGPT / Perplexity"},
            {"id": "tech-page-speed", "label": "Core Web Vitals passing (LCP < 2.5s, CLS < 0.1)", "impact": "medium", "engine": "Google AI Overviews"},
        ],
    },
    {
        "category": "Local AI Search",
        "items": [
            {"id": "local-gbp", "label": "Google Business Profile fully optimized with recent posts", "impact": "high", "engine": "Google AI Overviews (local)"},
            {"id": "local-nap", "label": "NAP (Name, Address, Phone) consistent across 50+ directories", "impact": "high", "engine": "Google AI Overviews (local)"},
            {"id": "local-reviews", "label": "20+ Google reviews with average 4.5+ stars", "impact": "high", "engine": "Google AI Overviews (local)"},
        ],
    },
]

DEMO_FAQ_SETS = {
    "depression": [
        {"q": "What treatments are available for treatment-resistant depression?", "a": "Treatment-resistant depression (TRD) can be addressed with TMS (Transcranial Magnetic Stimulation), ketamine infusion therapy, or ECT. Our clinic specializes in TMS therapy, which has a 60–70% response rate for patients who haven't responded to medications."},
        {"q": "How long does TMS therapy take to work for depression?", "a": "Most TMS patients begin to notice improvement after 2–3 weeks of daily sessions. A full course of TMS consists of 30–36 sessions over 6–7 weeks. Many patients experience significant relief by week 4."},
        {"q": "Is TMS therapy covered by insurance for depression?", "a": "Yes — most major insurance plans including Blue Cross Blue Shield, Aetna, Cigna, and United Healthcare cover TMS therapy when two or more antidepressants have not worked. We verify benefits before your first session."},
        {"q": "What is the success rate of TMS therapy?", "a": "Clinical studies show TMS has a 58–67% response rate and a 37% full remission rate for major depression. Results are maintained in approximately 60% of patients at 12-month follow-up."},
    ],
    "anxiety": [
        {"q": "What is the fastest way to treat severe anxiety disorder?", "a": "For severe anxiety, a combination of evidence-based psychotherapy (CBT or ERP), medication management, and lifestyle interventions produces the fastest results. Most patients see significant improvement within 8–12 weeks of starting treatment."},
        {"q": "Can anxiety disorder be cured without medication?", "a": "Yes — many anxiety disorders respond well to Cognitive Behavioral Therapy (CBT) alone. Studies show CBT has a 60–80% success rate for generalized anxiety, panic disorder, and social anxiety without medication."},
    ],
}

DEMO_SCHEMA_TEMPLATES = {
    "MedicalBusiness": {
        "@context": "https://schema.org",
        "@type": "MedicalBusiness",
        "name": "{practice_name}",
        "url": "{website_url}",
        "telephone": "{phone}",
        "medicalSpecialty": "Psychiatry",
        "address": {"@type": "PostalAddress", "streetAddress": "{address}", "addressLocality": "{city}", "addressRegion": "{state}", "postalCode": "{zip}"},
        "openingHours": "Mo-Fr 08:00-17:00",
        "availableService": [
            {"@type": "MedicalTherapy", "name": "TMS Therapy"},
            {"@type": "MedicalTherapy", "name": "Medication Management"},
            {"@type": "MedicalTherapy", "name": "Psychotherapy"},
        ],
    },
    "FAQPage": {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": [
            {"@type": "Question", "name": "{question}", "acceptedAnswer": {"@type": "Answer", "text": "{answer}"}},
        ],
    },
}


# ------------------------------------------------------------------ #
# Helpers
# ------------------------------------------------------------------ #
def _get_company(company_id: str, db: Session):
    return db.query(Company).filter(Company.id == company_id).first()


def _score_from_checklist(checked_ids: list[str]) -> int:
    total = sum(len(cat["items"]) for cat in AEO_CHECKLIST_ITEMS)
    return round((len(checked_ids) / total) * 100) if total else 0


# ------------------------------------------------------------------ #
# Endpoints
# ------------------------------------------------------------------ #
@router.get("/{company_id}/score")
async def get_aeo_score(company_id: str, db: Session = Depends(get_db)):
    company = _get_company(company_id, db)
    cached = _aeo_cache.get(company_id, {})
    checked_ids = cached.get("checked_ids", [])
    score = _score_from_checklist(checked_ids) if checked_ids else 42  # demo default

    return {
        "score": score,
        "grade": "A" if score >= 85 else "B" if score >= 70 else "C" if score >= 55 else "D",
        "checked_ids": checked_ids,
        "engines": {
            "google_ai_overviews": min(100, score + 5),
            "perplexity": max(0, score - 8),
            "chatgpt_search": max(0, score - 12),
            "bing_copilot": max(0, score - 5),
        },
        "checklist": AEO_CHECKLIST_ITEMS,
        "company_name": company.name if company else "",
        "website_url": company.website_url if company else "",
    }


@router.post("/{company_id}/checklist")
async def update_checklist(company_id: str, data: dict):
    checked_ids = data.get("checked_ids", [])
    if company_id not in _aeo_cache:
        _aeo_cache[company_id] = {}
    _aeo_cache[company_id]["checked_ids"] = checked_ids
    score = _score_from_checklist(checked_ids)
    return {"score": score, "checked_ids": checked_ids}


@router.post("/{company_id}/generate-faqs")
async def generate_faqs(company_id: str, data: dict, db: Session = Depends(get_db)):
    topic = data.get("topic", "mental health treatment")
    company = _get_company(company_id, db)
    company_name = company.name if company else "our clinic"
    specialty = getattr(company, "specialty_niche", "behavioral health") if company else "behavioral health"

    demo_key = "depression" if "depress" in topic.lower() or "tms" in topic.lower() else "anxiety"
    demo_faqs = DEMO_FAQ_SETS.get(demo_key, DEMO_FAQ_SETS["depression"])

    try:
        prompt = (
            f"Generate 5 FAQ pairs optimized for Google AI Overviews and Perplexity for "
            f"{company_name}, a {specialty} practice. Topic: '{topic}'. "
            "Each question should be what a patient would ask a search engine. "
            "Answers should be 2–4 sentences, factual, and include specific numbers/statistics where possible. "
            "Return JSON: {\"faqs\": [{\"q\": \"...\", \"a\": \"...\"}]}"
        )
        response = llm_service.client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=800,
            messages=[{"role": "user", "content": prompt}],
        )
        text = response.content[0].text
        match = re.search(r'\{.*\}', text, re.DOTALL)
        if match:
            faqs = json.loads(match.group())["faqs"]
            return {"faqs": faqs, "topic": topic, "schema_ready": True}
    except Exception:
        pass

    return {"faqs": demo_faqs, "topic": topic, "schema_ready": True}


@router.post("/{company_id}/generate-schema")
async def generate_schema(company_id: str, data: dict, db: Session = Depends(get_db)):
    schema_type = data.get("schema_type", "MedicalBusiness")
    company = _get_company(company_id, db)

    schema = dict(DEMO_SCHEMA_TEMPLATES.get(schema_type, DEMO_SCHEMA_TEMPLATES["MedicalBusiness"]))
    if company:
        locations = company.locations or [{}]
        loc = locations[0] if locations else {}
        replacements = {
            "{practice_name}": company.name or "",
            "{website_url}": company.website_url or "",
            "{phone}": loc.get("phone", ""),
            "{address}": loc.get("address", ""),
            "{city}": loc.get("city", ""),
            "{state}": loc.get("state", ""),
            "{zip}": loc.get("zip", ""),
        }
        schema_str = json.dumps(schema)
        for k, v in replacements.items():
            schema_str = schema_str.replace(k, v)
        schema = json.loads(schema_str)

    return {
        "schema_type": schema_type,
        "schema": schema,
        "json_ld": f"<script type=\"application/ld+json\">\n{json.dumps(schema, indent=2)}\n</script>",
        "placement": "Add to <head> of your homepage or relevant service page",
    }


@router.post("/{company_id}/optimize-content")
async def optimize_content(company_id: str, data: dict, db: Session = Depends(get_db)):
    content = data.get("content", "")
    page_type = data.get("page_type", "service page")
    company = _get_company(company_id, db)
    company_name = company.name if company else "the clinic"

    demo_suggestions = [
        {"issue": "No direct answer in opening paragraph", "suggestion": "Start with a 1–2 sentence answer to 'What is [service]?' before any other content", "impact": "high", "engine": "Google AI Overviews"},
        {"issue": "Missing question-format headings", "suggestion": "Rewrite H2/H3 headings as questions (e.g., 'How long does TMS take?' instead of 'TMS Duration')", "impact": "high", "engine": "All AI engines"},
        {"issue": "No outcome statistics cited", "suggestion": "Add specific data points: 'Clinical studies show 68% of patients improve with TMS (NEJM 2021)'", "impact": "medium", "engine": "Perplexity / ChatGPT"},
        {"issue": "No FAQ section", "suggestion": "Add an FAQ section with 5–8 Q&A pairs at the bottom of the page and apply FAQPage schema", "impact": "high", "engine": "Google AI Overviews"},
        {"issue": "Author/provider credentials not visible", "suggestion": "Add a 'Medically Reviewed By' section with provider name, credentials, and experience", "impact": "medium", "engine": "Google / Perplexity"},
    ]

    if not content:
        return {"suggestions": demo_suggestions, "ai_overview_score": 38, "improvements": 5}

    try:
        prompt = (
            f"Analyze this {page_type} content for AI search optimization (Google AI Overviews, Perplexity, ChatGPT Search). "
            f"Content: {content[:2000]}\n\n"
            "Return JSON: {\"suggestions\": [{\"issue\": \"...\", \"suggestion\": \"...\", \"impact\": \"high|medium|low\", \"engine\": \"...\"}], \"ai_overview_score\": 0-100}"
        )
        response = llm_service.client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=600,
            messages=[{"role": "user", "content": prompt}],
        )
        text = response.content[0].text
        match = re.search(r'\{.*\}', text, re.DOTALL)
        if match:
            result = json.loads(match.group())
            return {"suggestions": result.get("suggestions", []), "ai_overview_score": result.get("ai_overview_score", 50)}
    except Exception:
        pass

    return {"suggestions": demo_suggestions, "ai_overview_score": 38, "improvements": len(demo_suggestions)}
