"""AI Video Ad Generator module.

Generates video ad scripts, storyboards, and creative concepts
for Google Video Ads, Meta Reels, YouTube, TikTok, and Connected TV.
"""
import re
import json
import uuid
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.models.company import Company
from app.services.llm import llm_service
from datetime import datetime

router = APIRouter(prefix="/video", tags=["video"])

_video_store: dict[str, list] = {}

# ------------------------------------------------------------------ #
# Constants
# ------------------------------------------------------------------ #
PLATFORMS = [
    {"id": "youtube_preroll", "name": "YouTube Pre-Roll", "length": "15–30s", "format": "16:9", "icon": "▶", "color": "#ef4444"},
    {"id": "meta_reels", "name": "Meta Reels / Stories", "length": "15–30s", "format": "9:16", "icon": "◉", "color": "#6366f1"},
    {"id": "tiktok", "name": "TikTok", "length": "15–60s", "format": "9:16", "icon": "♪", "color": "#0f0f0f"},
    {"id": "ctv", "name": "Connected TV (CTV)", "length": "30–60s", "format": "16:9", "icon": "📺", "color": "#0ea5e9"},
    {"id": "google_display_video", "name": "Google Display Video", "length": "6–30s", "format": "16:9", "icon": "G", "color": "#f59e0b"},
    {"id": "linkedin_video", "name": "LinkedIn Video Ad", "length": "15–30s", "format": "1:1 / 16:9", "icon": "in", "color": "#0077b5"},
]

AD_TEMPLATES = [
    {
        "id": "tpl-problem-solution",
        "name": "Problem → Solution",
        "description": "Opens with a relatable patient struggle, positions the clinic as the answer",
        "best_for": ["YouTube", "Meta Reels", "CTV"],
        "structure": ["Hook: Patient's problem (0–3s)", "Empathy moment (3–8s)", "Solution reveal (8–20s)", "Social proof (20–25s)", "CTA (25–30s)"],
    },
    {
        "id": "tpl-social-proof",
        "name": "Testimonial / Social Proof",
        "description": "Real patient story (anonymized for HIPAA) or provider voiceover with statistics",
        "best_for": ["CTV", "YouTube", "LinkedIn"],
        "structure": ["Hook: Statistics (0–3s)", "Patient journey narrative (3–20s)", "Provider credential flash (20–25s)", "CTA (25–30s)"],
    },
    {
        "id": "tpl-education",
        "name": "Education / Explainer",
        "description": "Explains a treatment or condition in plain language, builds trust and authority",
        "best_for": ["YouTube", "Google Video", "LinkedIn"],
        "structure": ["Question hook (0–3s)", "What is it explained (3–15s)", "Who it helps (15–22s)", "How to start (22–28s)", "CTA (28–30s)"],
    },
    {
        "id": "tpl-urgency",
        "name": "Awareness + Urgency",
        "description": "Creates urgency around getting help, targeting high-intent searchers",
        "best_for": ["Meta Reels", "TikTok", "YouTube"],
        "structure": ["Relatable hook (0–3s)", "Pain point amplification (3–10s)", "Relief promise (10–18s)", "Proof point (18–24s)", "CTA with offer (24–30s)"],
    },
    {
        "id": "tpl-bumper",
        "name": "6-Second Bumper",
        "description": "Ultra-short brand awareness ad — one clear message, one CTA",
        "best_for": ["YouTube", "Google Display Video"],
        "structure": ["Logo + hook (0–2s)", "Core benefit (2–5s)", "CTA (5–6s)"],
    },
]

DEMO_ADS = [
    {
        "id": "ad-tms-youtube",
        "name": "TMS Therapy — 'Still Searching' (30s YouTube)",
        "platform": "youtube_preroll",
        "length": "30s",
        "topic": "TMS therapy for treatment-resistant depression",
        "created_at": "2026-02-10",
        "status": "ready",
        "script": {
            "scenes": [
                {"time": "0–3s", "visual": "Close-up: hands scrolling through medication bottles", "audio": "VOICEOVER: 'Still searching for something that works?'", "text_overlay": ""},
                {"time": "3–10s", "visual": "Person sitting alone, looking out a window", "audio": "VO: 'Over 5 million Americans have tried antidepressants — and still struggle with depression every day.'", "text_overlay": "5M+ Americans"},
                {"time": "10–22s", "visual": "Bright, clean clinic interior. Patient reclined in TMS chair, relaxed, reading a tablet.", "audio": "VO: 'TMS therapy uses targeted magnetic pulses to stimulate the part of the brain affected by depression. No medication. No downtime. FDA-cleared.'", "text_overlay": "TMS: FDA-Cleared · No Medication"},
                {"time": "22–27s", "visual": "Split screen: before (sad, tired) / after (smiling, active)", "audio": "VO: '68% of TMS patients experience significant improvement. Many feel results in just 2 weeks.'", "text_overlay": "68% Response Rate"},
                {"time": "27–30s", "visual": "Clinic logo, phone number, website", "audio": "VO: 'Call [clinic name] today — most insurance accepted.'", "text_overlay": "Free Consultation · (602) 555-0100"},
            ],
            "cta": "Call Now — Free Insurance Verification",
            "notes": "HIPAA note: All patient depictions must use actors or stock footage. Obtain written release for any real testimonials.",
        },
    },
    {
        "id": "ad-anxiety-reels",
        "name": "Anxiety Treatment — 'You Don't Have to Live Like This' (15s Reel)",
        "platform": "meta_reels",
        "length": "15s",
        "topic": "Anxiety treatment",
        "created_at": "2026-02-14",
        "status": "ready",
        "script": {
            "scenes": [
                {"time": "0–2s", "visual": "Text on dark background, kinetic typography", "audio": "SILENCE then music build", "text_overlay": "You don't have to live like this."},
                {"time": "2–8s", "visual": "Quick cuts: racing thoughts visualization, person checking phone anxiously, avoiding crowds", "audio": "Upbeat music starts. VO: 'Anxiety steals your focus, your sleep, your confidence.'", "text_overlay": ""},
                {"time": "8–13s", "visual": "Welcoming therapy office. Smiling provider.", "audio": "VO: 'Real help. Real results. Most insurance accepted.'", "text_overlay": "Evidence-Based Anxiety Treatment"},
                {"time": "13–15s", "visual": "Logo + CTA card", "audio": "VO: 'Book your free consultation today.'", "text_overlay": "Book Free Consult → Link in Bio"},
            ],
            "cta": "Book Free Consultation",
            "notes": "Vertical 9:16 format. Add captions — 85% of Reels are watched without sound.",
        },
    },
]


def _get_company(company_id: str, db: Session):
    return db.query(Company).filter(Company.id == company_id).first()


# ------------------------------------------------------------------ #
# Endpoints
# ------------------------------------------------------------------ #
@router.get("/platforms")
async def get_platforms():
    return {"platforms": PLATFORMS, "templates": AD_TEMPLATES}


@router.get("/{company_id}/ads")
async def list_ads(company_id: str):
    ads = _video_store.get(company_id, DEMO_ADS)
    return {"ads": ads, "total": len(ads)}


@router.post("/{company_id}/generate-script")
async def generate_script(company_id: str, data: dict, db: Session = Depends(get_db)):
    platform = data.get("platform", "youtube_preroll")
    topic = data.get("topic", "mental health treatment")
    length = data.get("length", "30s")
    template_id = data.get("template_id", "tpl-problem-solution")
    company = _get_company(company_id, db)
    company_name = company.name if company else "our clinic"
    specialty = getattr(company, "specialty_niche", "behavioral health") if company else "behavioral health"

    template = next((t for t in AD_TEMPLATES if t["id"] == template_id), AD_TEMPLATES[0])
    plat_info = next((p for p in PLATFORMS if p["id"] == platform), PLATFORMS[0])

    # Try LLM generation
    script_scenes = None
    try:
        structure_str = " → ".join(template["structure"])
        prompt = (
            f"Write a {length} video ad script for {company_name}, a {specialty} clinic. "
            f"Platform: {plat_info['name']} ({plat_info['format']}). "
            f"Topic: {topic}. Template: {template['name']} ({structure_str}). "
            "For each scene include: time, visual description, audio/voiceover, and text overlay. "
            "Be specific, compelling, and HIPAA-aware (no real patient stories without consent). "
            "Return JSON: {\"scenes\": [{\"time\": \"0-3s\", \"visual\": \"...\", \"audio\": \"...\", \"text_overlay\": \"...\"}], \"cta\": \"...\", \"notes\": \"...\"}"
        )
        response = llm_service.client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=900,
            messages=[{"role": "user", "content": prompt}],
        )
        text = response.content[0].text
        match = re.search(r'\{.*\}', text, re.DOTALL)
        if match:
            script_scenes = json.loads(match.group())
    except Exception:
        pass

    if not script_scenes:
        script_scenes = DEMO_ADS[0]["script"]

    ad = {
        "id": str(uuid.uuid4()),
        "name": f"{topic[:40]} — {length} {plat_info['name']}",
        "platform": platform,
        "platform_name": plat_info["name"],
        "length": length,
        "topic": topic,
        "template": template["name"],
        "created_at": datetime.utcnow().strftime("%Y-%m-%d"),
        "status": "ready",
        "script": script_scenes,
    }

    if company_id not in _video_store:
        _video_store[company_id] = list(DEMO_ADS)
    _video_store[company_id].insert(0, ad)
    return ad


@router.post("/{company_id}/generate-concepts")
async def generate_concepts(company_id: str, data: dict, db: Session = Depends(get_db)):
    """Generate 3 creative video ad concepts without full scripts."""
    topic = data.get("topic", "behavioral health treatment")
    company = _get_company(company_id, db)
    company_name = company.name if company else "our practice"

    demo_concepts = [
        {
            "title": "The Scroll Stop",
            "hook": "Text on black screen: 'What if you could feel like yourself again?'",
            "concept": "Quick-cut montage of daily life moments (morning coffee, laughing with family, work focus) intercut with before/after emotional states. Ends with clinic name and phone number.",
            "best_platform": "Meta Reels / TikTok",
            "length": "15s",
            "emotional_driver": "Hope",
        },
        {
            "title": "The Expert",
            "hook": "Provider on camera: 'I've been treating depression for 15 years. Here's what actually works.'",
            "concept": "30-second provider talking-head style video. Establishes credibility, explains one key treatment benefit in plain language, ends with 'Call today — most insurance accepted.'",
            "best_platform": "YouTube Pre-Roll / LinkedIn",
            "length": "30s",
            "emotional_driver": "Trust",
        },
        {
            "title": "The Statistic Shock",
            "hook": "Large text: '1 in 3 people with depression don't respond to medication.'",
            "concept": "Data-driven opening grabs attention. Transitions to TMS/alternative treatment explanation. Ends with social proof stat and CTA. B-roll of clean, welcoming clinic space.",
            "best_platform": "CTV / YouTube",
            "length": "30s",
            "emotional_driver": "Urgency + Authority",
        },
    ]

    try:
        prompt = (
            f"Generate 3 video ad concepts for {company_name} targeting {topic}. "
            "Each concept should have: title, hook (first 3 seconds), concept description, best_platform, length, emotional_driver. "
            "Be creative and specific to healthcare/mental health. "
            "Return JSON: {\"concepts\": [{\"title\": \"...\", \"hook\": \"...\", \"concept\": \"...\", \"best_platform\": \"...\", \"length\": \"...\", \"emotional_driver\": \"...\"}]}"
        )
        response = llm_service.client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=700,
            messages=[{"role": "user", "content": prompt}],
        )
        text = response.content[0].text
        match = re.search(r'\{.*\}', text, re.DOTALL)
        if match:
            result = json.loads(match.group())
            return {"concepts": result.get("concepts", demo_concepts), "topic": topic}
    except Exception:
        pass

    return {"concepts": demo_concepts, "topic": topic}


@router.delete("/{company_id}/ads/{ad_id}")
async def delete_ad(company_id: str, ad_id: str):
    ads = _video_store.get(company_id, [])
    _video_store[company_id] = [a for a in ads if a["id"] != ad_id]
    return {"deleted": ad_id}
