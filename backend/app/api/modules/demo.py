"""Demo data seeding module.

POST /demo/{company_id}/load-all
Populates all in-memory caches with rich, realistic demo data so every
page in the dashboard shows something meaningful on first load.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.models.company import Company
from app.models.referral import ReferralLead, Campaign, CampaignEnrollment, LeadStatus
from app.models.content import ContentItem, ContentType, ContentStatus
from datetime import datetime, timedelta
import uuid

# Import in-memory stores from the modules we want to seed
from app.api.modules import (
    competitors as comp_mod,
    reputation as rep_mod,
    reports as rep_reports_mod,
    schedule as sched_mod,
    intake as intake_mod,
    chat as chat_mod,
    video as video_mod,
    aeo as aeo_mod,
)

router = APIRouter(prefix="/demo", tags=["demo"])

# ------------------------------------------------------------------ #
# Rich demo datasets
# ------------------------------------------------------------------ #

DEMO_COMPETITORS = [
    {
        "id": "comp-mindpath",
        "name": "MindPath Care Centers",
        "website": "https://mindpathcare.com",
        "threat_level": "high",
        "notes": "Largest mental health network in the region. Aggressive Google Ads spend.",
        "added_at": "2026-01-10",
        "analysis": {
            "summary": "MindPath is the dominant competitor with 12 locations and a $50k+/month ad budget. Their key differentiator is same-day appointments.",
            "strengths": ["12 locations", "Strong Google Ads", "Same-day scheduling", "Telehealth"],
            "weaknesses": ["High staff turnover", "No TMS", "Mixed reviews on Yelp (3.6★)"],
            "opportunities": ["We offer TMS — they don't", "Better reputation (4.7★ vs 3.6★)", "More personalized care"],
        },
    },
    {
        "id": "comp-pathlight",
        "name": "Pathlight Behavioral Health",
        "website": "https://pathlightbh.com",
        "threat_level": "medium",
        "notes": "Strong reputation in PTSD/trauma. Referral partnership potential.",
        "added_at": "2026-01-22",
        "analysis": {
            "summary": "Pathlight focuses on trauma and PTSD. Lower direct competition for depression/TMS but may compete for shared PCPs.",
            "strengths": ["PTSD specialty", "Insurance contracts", "Strong therapist team"],
            "weaknesses": ["No psychiatric prescribers", "No TMS", "Limited hours"],
            "opportunities": ["Co-referral relationship for complex cases", "Different specialty focus"],
        },
    },
    {
        "id": "comp-tms-health",
        "name": "TMS Health Solutions",
        "website": "https://tmshealthsolutions.com",
        "threat_level": "high",
        "notes": "Direct TMS competitor. 3 AZ locations. Watch their keyword targeting.",
        "added_at": "2026-02-05",
        "analysis": {
            "summary": "Direct TMS competitor with 3 AZ locations. They're targeting the same 'TMS therapy Phoenix' keywords we are.",
            "strengths": ["TMS-only focus", "Strong SEO", "Partnership with UCSF research"],
            "weaknesses": ["TMS only — no psychiatric med management", "Higher price point", "No ketamine"],
            "opportunities": ["Full-service advantage (TMS + meds + therapy)", "Price competitive", "Same-week availability"],
        },
    },
]

DEMO_REVIEWS = [
    {"id": "rev-1", "platform": "Google", "reviewer": "Sarah M.", "rating": 5, "date": "2026-02-20", "text": "Dr. Chen changed my life. After 8 years of antidepressants that barely worked, TMS therapy finally gave me my life back. The staff is incredible, the office is calming, and they actually call to check on you.", "sentiment": "positive", "responded": False},
    {"id": "rev-2", "platform": "Google", "reviewer": "James R.", "rating": 5, "date": "2026-02-18", "text": "I was skeptical about TMS but the team walked me through every step. My depression scores dropped from a 24 to an 8 on the PHQ-9 by week 5. Insurance covered everything after they handled the pre-auth.", "sentiment": "positive", "responded": True},
    {"id": "rev-3", "platform": "Yelp", "reviewer": "Michelle K.", "rating": 4, "date": "2026-02-14", "text": "Great clinical care and kind staff. The front desk can sometimes be slow to answer calls — that's the only reason I'm giving 4 stars instead of 5. The treatment itself was excellent.", "sentiment": "mixed", "responded": False},
    {"id": "rev-4", "platform": "Google", "reviewer": "David L.", "rating": 5, "date": "2026-02-10", "text": "After failing 3 antidepressants, my psychiatrist referred me here. TMS gave me a 70% reduction in symptoms. I cried at my 6-week follow-up because I hadn't felt this good in a decade.", "sentiment": "positive", "responded": True},
    {"id": "rev-5", "platform": "Healthgrades", "reviewer": "Anonymous", "rating": 2, "date": "2026-02-07", "text": "Billing issues that took 3 months to resolve. The treatment was fine but the administrative side was frustrating and stressful during an already difficult time.", "sentiment": "negative", "responded": False},
    {"id": "rev-6", "platform": "Google", "reviewer": "Patricia W.", "rating": 5, "date": "2026-02-03", "text": "Ketamine infusions were transformative after nothing else worked. The team monitored me closely and the environment felt completely safe. I'm 8 months out and still doing well.", "sentiment": "positive", "responded": True},
    {"id": "rev-7", "platform": "Google", "reviewer": "Tom B.", "rating": 5, "date": "2026-01-28", "text": "Dr. Park was patient, thorough, and explained every option clearly. Never felt rushed. They got my prior auth approved in 3 days when another clinic said it would take weeks.", "sentiment": "positive", "responded": False},
    {"id": "rev-8", "platform": "Yelp", "reviewer": "Carol A.", "rating": 3, "date": "2026-01-22", "text": "The treatment protocol is solid and the nurses are wonderful. The waiting room can get crowded during peak hours, and parking is limited. Would still recommend for the quality of care.", "sentiment": "mixed", "responded": False},
]

DEMO_REPORT = {
    "week": "Feb 24 – Mar 1, 2026",
    "generated_at": "2026-03-01T08:00:00",
    "pulse": "green",
    "pulse_label": "On Track",
    "pulse_reason": "3 new referrals this week, Google Ads CAC down 12%, SEO traffic up 8%",
    "highlights": [
        {"metric": "New Referral Leads", "value": "18", "change": "+3 vs last week", "trend": "up"},
        {"metric": "Campaigns Active", "value": "7", "change": "2 launched this week", "trend": "up"},
        {"metric": "Google Ads CAC", "value": "$142", "change": "-12% vs last month", "trend": "up"},
        {"metric": "SEO Organic Traffic", "value": "1,847", "change": "+8% vs last week", "trend": "up"},
        {"metric": "Reputation Score", "value": "4.7★", "change": "+0.1 this month", "trend": "up"},
        {"metric": "Approval Queue", "value": "4 pending", "change": "Down from 11 last week", "trend": "up"},
    ],
    "wins": [
        "Signed 2 new PCP referral partnerships this week",
        "TMS blog post ranked #4 for 'TMS therapy Phoenix' (+6 positions)",
        "Fax campaign to Scottsdale PCPs yielded 3 inbound calls",
        "Google Ads quality score improved from 6 to 8 for top keywords",
    ],
    "watch_list": [
        "Billing complaint in reviews — respond and flag to admin team",
        "Meta CPL increased 18% — test new creative this week",
        "2 intake forms showing 65% completion rate — below 75% target",
    ],
    "priorities": [
        "Deploy 'Depression Referral — PCP Outreach' template to Chandler area PCPs",
        "Respond to the 2-star Healthgrades review (billing issue)",
        "Run AEO checklist — currently at 42% AI search readiness",
        "Launch TikTok ad campaign for anxiety targeting",
        "Update Google Business Profile posts (last post was 18 days ago)",
    ],
    "top_keyword": {"keyword": "TMS therapy Phoenix", "position": 4, "change": "+6"},
    "top_campaign": {"name": "Fax — Scottsdale PCPs", "metric": "3 inbound calls", "channel": "fax"},
}

DEMO_AEO_STATE = {
    "checked_ids": [
        "schema-medical-business",
        "schema-faq",
        "content-qa-format",
        "content-concise-answers",
        "content-eeat",
        "tech-https",
        "tech-sitemap",
        "local-gbp",
        "local-nap",
    ],
}

DEMO_SCHEDULE_EVENTS = [
    {"id": "ev-1", "type": "campaign", "title": "Fax — Scottsdale PCPs", "channel": "fax", "date": "2026-02-03", "status": "completed", "color": "#3b82f6"},
    {"id": "ev-2", "type": "campaign", "title": "Email Sequence: Day 1", "channel": "email", "date": "2026-02-05", "status": "completed", "color": "#8b5cf6"},
    {"id": "ev-3", "type": "content", "title": "TMS Blog Post — Published", "channel": "content", "date": "2026-02-07", "status": "published", "color": "#a855f7"},
    {"id": "ev-4", "type": "campaign", "title": "Voicemail Drop — Phoenix PCPs", "channel": "voicemail", "date": "2026-02-10", "status": "completed", "color": "#10b981"},
    {"id": "ev-5", "type": "campaign", "title": "Meta Ads — Anxiety Targeting", "channel": "meta", "date": "2026-02-12", "status": "active", "color": "#f59e0b"},
    {"id": "ev-6", "type": "content", "title": "LinkedIn: Staff Spotlight", "channel": "content", "date": "2026-02-14", "status": "published", "color": "#a855f7"},
    {"id": "ev-7", "type": "campaign", "title": "Email Sequence: Day 10", "channel": "email", "date": "2026-02-15", "status": "completed", "color": "#8b5cf6"},
    {"id": "ev-8", "type": "campaign", "title": "Google Ads — TMS Keywords", "channel": "google", "date": "2026-02-17", "status": "active", "color": "#ef4444"},
    {"id": "ev-9", "type": "content", "title": "Blog: ADHD in Adults", "channel": "content", "date": "2026-02-19", "status": "draft", "color": "#a855f7"},
    {"id": "ev-10", "type": "campaign", "title": "Fax — Tempe Therapists", "channel": "fax", "date": "2026-02-21", "status": "active", "color": "#3b82f6"},
    {"id": "ev-11", "type": "campaign", "title": "Email Sequence: Day 21", "channel": "email", "date": "2026-02-25", "status": "scheduled", "color": "#8b5cf6"},
    {"id": "ev-12", "type": "content", "title": "Instagram: Patient Story", "channel": "content", "date": "2026-02-26", "status": "scheduled", "color": "#a855f7"},
    {"id": "ev-13", "type": "campaign", "title": "Fax — Chandler Pediatrics", "channel": "fax", "date": "2026-03-03", "status": "scheduled", "color": "#3b82f6"},
    {"id": "ev-14", "type": "campaign", "title": "Email Sequence: Day 30", "channel": "email", "date": "2026-03-05", "status": "scheduled", "color": "#8b5cf6"},
    {"id": "ev-15", "type": "content", "title": "Blog: How TMS Works", "channel": "content", "date": "2026-03-07", "status": "draft", "color": "#a855f7"},
    {"id": "ev-16", "type": "campaign", "title": "Reddit Ads — r/depression", "channel": "meta", "date": "2026-03-10", "status": "scheduled", "color": "#ff4500"},
    {"id": "ev-17", "type": "campaign", "title": "TikTok Ads — Gen Z Anxiety", "channel": "meta", "date": "2026-03-12", "status": "scheduled", "color": "#010101"},
    {"id": "ev-18", "type": "campaign", "title": "LinkedIn — PCP Outreach", "channel": "email", "date": "2026-03-15", "status": "scheduled", "color": "#0077b5"},
]

DEMO_CHAT_HISTORY = [
    {
        "id": "msg-1",
        "role": "user",
        "content": "What should my top GTM priority be this week?",
        "timestamp": "2026-02-28T09:15:00",
    },
    {
        "id": "msg-2",
        "role": "assistant",
        "content": "Based on your current metrics, here are your top 3 priorities this week:\n\n• **Deploy the PCP fax campaign to Chandler** — Your Scottsdale fax campaign generated 3 inbound calls. Chandler has 47 PCPs you haven't contacted yet.\n\n• **Respond to the 2-star Healthgrades review** — Unanswered negative reviews hurt your AEO score and can deter referrals. I can draft a response for you.\n\n• **Run the AEO checklist** — You're at 42% AI search readiness. The top quick wins are adding FAQPage schema to your service pages and rewriting your H2 headings as questions.\n\nWould you like me to draft the Chandler fax cover letter?",
        "timestamp": "2026-02-28T09:15:08",
    },
    {
        "id": "msg-3",
        "role": "user",
        "content": "Yes, draft the Chandler PCP fax cover letter",
        "timestamp": "2026-02-28T09:16:00",
    },
    {
        "id": "msg-4",
        "role": "assistant",
        "content": "Here's a draft fax cover letter for Chandler PCPs:\n\n---\n**RE: Referral Partnership — TMS Therapy for Treatment-Resistant Depression**\n\nDear Dr. [Name],\n\nI'm reaching out because we know you see patients whose depression hasn't responded to medication — and we want to be your go-to partner for those cases.\n\n**Novamind Mental Health** offers TMS (Transcranial Magnetic Stimulation) therapy with a **68% response rate** for treatment-resistant depression. We accept most major insurance including Aetna, BCBS, Cigna, and United.\n\n✓ Same-week intake appointments\n✓ Prior auth handled within 72 hours\n✓ Co-management reports sent to your office\n✓ Most patients continue care with you\n\nTo refer a patient, call **(602) 555-0100** or fax this form back.\n\n*To stop receiving faxes, call the number above.*\n\n---\n\nWant me to customize this with your specific providers or add a fax-back form?",
        "timestamp": "2026-02-28T09:16:15",
    },
]

DEMO_VIDEO_ADS = [
    {
        "id": "vid-tms-youtube",
        "name": "TMS Therapy — 'Still Searching' (30s YouTube)",
        "platform": "youtube_preroll",
        "platform_name": "YouTube Pre-Roll",
        "length": "30s",
        "topic": "TMS therapy for treatment-resistant depression",
        "template": "Problem → Solution",
        "created_at": "2026-02-10",
        "status": "ready",
        "script": {
            "scenes": [
                {"time": "0–3s", "visual": "Close-up: hands scrolling through medication bottles", "audio": "VOICEOVER: 'Still searching for something that works?'", "text_overlay": ""},
                {"time": "3–10s", "visual": "Person sitting alone, looking out a window", "audio": "VO: 'Over 5 million Americans try antidepressants every year — and still struggle with depression.'", "text_overlay": "5M+ Americans"},
                {"time": "10–22s", "visual": "Bright, clean clinic interior. Patient reclined in TMS chair, relaxed, reading.", "audio": "VO: 'TMS therapy uses targeted magnetic pulses to stimulate the brain area affected by depression. No medication. No downtime. FDA-cleared.'", "text_overlay": "TMS: FDA-Cleared · No Medication · No Downtime"},
                {"time": "22–27s", "visual": "Split screen: before (tired) / after (smiling, active with family)", "audio": "VO: '68% of TMS patients experience significant improvement. Most feel results in just 2 weeks.'", "text_overlay": "68% Response Rate"},
                {"time": "27–30s", "visual": "Clinic logo, phone number, website", "audio": "VO: 'Call Novamind today — most insurance accepted.'", "text_overlay": "Free Consultation · (602) 555-0100"},
            ],
            "cta": "Call Now — Free Insurance Verification",
            "notes": "HIPAA: Use actors for all patient depictions. Obtain written release for any real testimonials.",
        },
    },
    {
        "id": "vid-anxiety-reels",
        "name": "Anxiety Treatment — 'You Don't Have to Live Like This' (15s Reel)",
        "platform": "meta_reels",
        "platform_name": "Meta Reels / Stories",
        "length": "15s",
        "topic": "Anxiety treatment — immediate relief messaging",
        "template": "Awareness + Urgency",
        "created_at": "2026-02-14",
        "status": "ready",
        "script": {
            "scenes": [
                {"time": "0–2s", "visual": "Dark background, white kinetic text", "audio": "Silence then music build", "text_overlay": "You don't have to live like this."},
                {"time": "2–8s", "visual": "Quick cuts: racing thoughts visualization, person checking phone anxiously, avoiding crowds", "audio": "VO: 'Anxiety steals your focus, your sleep, your confidence.'", "text_overlay": ""},
                {"time": "8–13s", "visual": "Welcoming therapy office. Warm lighting. Smiling provider.", "audio": "VO: 'Real help. Real results. Most insurance accepted.'", "text_overlay": "Evidence-Based Anxiety Treatment"},
                {"time": "13–15s", "visual": "Logo + CTA card", "audio": "VO: 'Book your free consultation today.'", "text_overlay": "Book Free Consult → Link in Bio"},
            ],
            "cta": "Book Free Consultation",
            "notes": "Vertical 9:16 format. Always add captions — 85% of Reels are watched without sound.",
        },
    },
    {
        "id": "vid-tms-bumper",
        "name": "TMS Therapy — 6-Second Bumper (YouTube)",
        "platform": "youtube_preroll",
        "platform_name": "YouTube Pre-Roll",
        "length": "6s",
        "topic": "TMS therapy brand awareness",
        "template": "6-Second Bumper",
        "created_at": "2026-02-18",
        "status": "ready",
        "script": {
            "scenes": [
                {"time": "0–2s", "visual": "Novamind logo flash on clean white background", "audio": "Upbeat music sting", "text_overlay": "Novamind Mental Health"},
                {"time": "2–5s", "visual": "TMS device close-up, patient smiling", "audio": "VO: 'TMS therapy. FDA-cleared. Insurance accepted.'", "text_overlay": "TMS · FDA-Cleared · AZ's #1 Rated"},
                {"time": "5–6s", "visual": "Phone number + website", "audio": "VO: 'Novamind.'", "text_overlay": "(602) 555-0100"},
            ],
            "cta": "Search 'Novamind TMS'",
            "notes": "Non-skippable. One message, maximum impact. Logo must appear in first frame.",
        },
    },
]


# ------------------------------------------------------------------ #
# Seed endpoint
# ------------------------------------------------------------------ #

@router.post("/{company_id}/load-all")
async def load_all_demo_data(company_id: str, db: Session = Depends(get_db)):
    """Seed all in-memory caches and optionally the DB with demo data."""

    seeded: dict[str, int] = {}

    # 1 — Competitors (save to DB via company model)
    company = db.query(Company).filter(Company.id == company_id).first()
    if company:
        comp_mod._save_competitors(company, DEMO_COMPETITORS, db)
        seeded["competitors"] = len(DEMO_COMPETITORS)
    else:
        seeded["competitors"] = 0

    # 2 — Reputation reviews
    rep_mod._review_cache[company_id] = list(DEMO_REVIEWS)
    seeded["reviews"] = len(DEMO_REVIEWS)

    # 3 — Weekly report
    rep_reports_mod._report_cache[company_id] = DEMO_REPORT
    seeded["report"] = 1

    # 4 — Schedule events
    sched_mod._event_cache[company_id] = list(DEMO_SCHEDULE_EVENTS)
    seeded["schedule_events"] = len(DEMO_SCHEDULE_EVENTS)

    # 5 — Intake forms (already has demo data by default, but cache it)
    if company_id not in intake_mod._form_store:
        intake_mod._form_store[company_id] = list(intake_mod.DEMO_FORMS)
    seeded["intake_forms"] = len(intake_mod._form_store[company_id])

    # 6 — Chat history
    chat_mod._chat_history[company_id] = list(DEMO_CHAT_HISTORY)
    seeded["chat_messages"] = len(DEMO_CHAT_HISTORY)

    # 7 — Video ads
    video_mod._video_store[company_id] = list(DEMO_VIDEO_ADS)
    seeded["video_ads"] = len(DEMO_VIDEO_ADS)

    # 8 — AEO checklist state
    aeo_mod._aeo_cache[company_id] = dict(DEMO_AEO_STATE)
    seeded["aeo_items_checked"] = len(DEMO_AEO_STATE["checked_ids"])

    return {
        "status": "ok",
        "company_id": company_id,
        "seeded": seeded,
        "message": "Demo data loaded for all modules. Refresh any page to see the data.",
    }


@router.delete("/{company_id}/clear")
async def clear_demo_data(company_id: str):
    """Clear all in-memory caches for a company (useful for testing)."""
    for store in [
        rep_mod._review_cache,
        rep_reports_mod._report_cache,
        sched_mod._event_cache,
        intake_mod._form_store,
        chat_mod._chat_history,
        video_mod._video_store,
        aeo_mod._aeo_cache,
    ]:
        store.pop(company_id, None)

    return {"status": "cleared", "company_id": company_id}
