"""
Shared fixtures for all tests.
Uses SQLite in-memory DB to avoid requiring a live Postgres instance.
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from unittest.mock import MagicMock, patch

from app.db.database import Base, get_db
from app.main import app

# ── In-memory SQLite database for tests ─────────────────────────────────────
SQLALCHEMY_DATABASE_URL = "sqlite:///./test.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="session", autouse=True)
def create_tables():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def db():
    connection = engine.connect()
    transaction = connection.begin()
    session = TestingSessionLocal(bind=connection)
    yield session
    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture
def client(db):
    def override_get_db():
        try:
            yield db
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


# ── Sample company data ──────────────────────────────────────────────────────
@pytest.fixture
def sample_company_data():
    return {
        "company_name": "Novamind Mental Health",
        "website_url": "https://novamindmentalhealth.com",
        "specialty_niche": "TMS therapy, ketamine infusions, psychiatric medication management",
        "services": [
            {"name": "TMS Therapy", "description": "Transcranial Magnetic Stimulation", "conditions_treated": ["Depression", "OCD"], "duration": "30 min", "cost_range": "$200-$400/session"},
            {"name": "Ketamine Infusions", "description": "IV ketamine for treatment-resistant depression", "conditions_treated": ["Treatment-Resistant Depression"], "duration": "45 min", "cost_range": "$400-$800/infusion"},
            {"name": "Psychiatric Evaluation", "description": "Comprehensive mental health evaluation", "conditions_treated": ["Various"], "duration": "60 min", "cost_range": "$250"},
        ],
        "providers": [
            {"name": "Dr. Sarah Chen", "title": "Medical Director", "credentials": "MD, MBA", "bio": "Board-certified psychiatrist", "specialties": ["TMS", "Ketamine"]},
            {"name": "Dr. James Park", "title": "Psychiatrist", "credentials": "MD", "bio": "Specializes in treatment-resistant depression", "specialties": ["Medication Management"]},
        ],
        "locations": [
            {"name": "Phoenix", "address": "123 Main St", "city": "Phoenix", "state": "AZ", "zip": "85001", "phone": "602-555-0100", "hours": "Mon-Fri 8am-6pm"},
            {"name": "Scottsdale", "address": "456 E Camelback Rd", "city": "Scottsdale", "state": "AZ", "zip": "85251", "phone": "480-555-0200", "hours": "Mon-Fri 9am-5pm"},
        ],
        "insurance_accepted": ["Aetna", "Blue Cross Blue Shield", "Cigna", "UnitedHealthcare", "Medicare"],
        "differentiators": ["Same-week intake", "All treatment options under one roof", "Board-certified providers"],
        "target_demographics": ["Adults 18-65", "Treatment-resistant depression patients", "Anxiety sufferers"],
        "brand_guidelines": {"tone": "warm, clinical, empathetic", "primary_color": "#2563EB", "fonts": {"heading": "Inter", "body": "Inter"}},
    }


@pytest.fixture
def created_company(client, db):
    """Create a company in the DB and return it."""
    from app.models.company import Company, CompanyStatus
    import uuid
    company = Company(
        id=str(uuid.uuid4()),
        name="Novamind Mental Health",
        website_url="https://novamindmentalhealth.com",
        slug="novamind-mental-health",
        status=CompanyStatus.active,
        specialty_niche="TMS therapy, ketamine infusions",
        services=[{"name": "TMS Therapy"}, {"name": "Ketamine Infusions"}],
        providers=[{"name": "Dr. Sarah Chen", "credentials": "MD"}],
        locations=[{"city": "Phoenix", "state": "AZ", "phone": "602-555-0100", "address": "123 Main St", "zip": "85001"}],
        insurance_accepted=["Aetna", "BCBS", "Cigna"],
        differentiators=["Same-week intake", "All options under one roof"],
        brand_guidelines={"tone": "warm and clinical"},
        is_pilot=True,
    )
    db.add(company)
    db.commit()
    db.refresh(company)
    return company


@pytest.fixture
def mock_llm():
    """Mock the LLM service to avoid real API calls.

    Patches the llm_service in both the services module AND every API module
    that imports it, so background task functions called directly also use mocks.
    """
    targets = [
        "app.services.llm.llm_service",
        "app.api.modules.content.llm_service",
        "app.api.modules.paid_ads.llm_service",
        "app.api.modules.profiles.llm_service",
        "app.api.modules.referral.llm_service",
        "app.api.modules.seo.llm_service",
        "app.api.modules.aeo.llm_service",
        "app.api.modules.video.llm_service",
        "app.api.modules.chat.llm_service",
        "app.api.modules.reputation.llm_service",
        "app.api.modules.reports.llm_service",
        "app.api.modules.competitors.llm_service",
    ]

    patches = [patch(t) for t in targets]
    mocks = [p.start() for p in patches]

    # Configure ALL mock instances with the same return values
    for m in mocks:
        m.generate_fax_sheet_content.return_value = {
            "headline": "Refer Your Patients to Novamind",
            "intro_paragraph": "We offer TMS therapy for treatment-resistant depression.",
            "key_services_for_this_specialty": ["TMS Therapy", "Ketamine Infusions"],
            "why_refer_points": ["Same-week intake", "Insurance accepted"],
            "insurance_section": "We accept Aetna, BCBS, Cigna",
            "fax_back_form": {"title": "Referral Request", "fields": ["Patient Name", "DOB"]},
            "opt_out_text": "To stop faxes, call 602-555-0100",
        }
        m.generate_voicemail_scripts.return_value = [
            {"variant": 1, "script": "Hi, this is Novamind Mental Health...", "word_count": 85, "estimated_duration_seconds": 35},
            {"variant": 2, "script": "Hello, calling from Novamind...", "word_count": 90, "estimated_duration_seconds": 38},
            {"variant": 3, "script": "Good day, Novamind Mental Health here...", "word_count": 80, "estimated_duration_seconds": 32},
        ]
        m.generate_email_sequence.return_value = [
            {"step": i, "day": i * 4, "subject": f"Email {i}", "body": f"Body {i}", "cta": "Schedule now"}
            for i in range(1, 8)
        ]
        m.generate_postcard_copy.return_value = {
            "front": {"headline": "Mental Health Care That Works", "key_points": ["TMS", "Ketamine"], "cta_text": "Call Today"},
            "back": {"body": "We help patients with treatment-resistant depression."},
        }
        m.generate_blog_post.return_value = {
            "title": "Is TMS Therapy Covered by Insurance?",
            "meta_description": "Learn about TMS therapy insurance coverage options.",
            "slug": "tms-therapy-insurance-coverage",
            "target_keyword": "TMS therapy insurance",
            "body_markdown": "# Is TMS Therapy Covered?\n\nTMS therapy is covered by many insurers...",
            "faq_schema": [{"question": "Does insurance cover TMS?", "answer": "Many plans do."}],
            "estimated_word_count": 1500,
        }
        m.generate_social_posts.return_value = [
            {"type": "educational", "caption": "Did you know TMS therapy...", "hashtags": ["#mentalhealth"], "image_concept": "Person smiling"},
        ] * 5
        m.generate_keyword_clusters.return_value = [
            {"cluster_name": "TMS Local", "keywords": ["tms therapy near me"], "service": "TMS Therapy"},
        ]
        m.generate_google_ad_copy.return_value = {
            "headlines": [f"Headline {i}" for i in range(15)],
            "descriptions": [f"Description {i}" for i in range(4)],
            "sitelinks": [],
            "callouts": ["Same-week intake", "Insurance accepted"],
        }
        m.generate_meta_ad_copy.return_value = {
            "primary_text": "Find relief from depression with TMS therapy.",
            "headline": "TMS Therapy Phoenix",
            "cta": "LEARN_MORE",
        }
        m.analyze_seo_data.return_value = {
            "quick_wins": [{"action": "Add meta descriptions", "priority": "high"}],
            "technical_fixes": [],
            "content_opportunities": [{"keyword": "tms therapy phoenix", "intent": "commercial"}],
        }
        m.generate_directory_profiles.return_value = {
            "practice_description_50": "Novamind offers TMS, ketamine, and psychiatric care.",
            "practice_description_150": "Novamind Mental Health provides cutting-edge treatments including TMS therapy and ketamine infusions for treatment-resistant depression in Phoenix, AZ.",
            "practice_description_500": "Novamind Mental Health is a comprehensive mental health practice...",
            "provider_bios": [{"provider_name": "Dr. Sarah Chen", "bio_first_person": "I specialize in...", "bio_third_person": "Dr. Chen specializes in..."}],
            "services": ["TMS Therapy", "Ketamine Infusions"],
            "conditions": ["Depression", "Anxiety", "OCD"],
            "insurance": ["Aetna", "BCBS"],
            "faq": [{"question": "Do you accept insurance?", "answer": "Yes, we accept most major insurers."}],
        }
        m.generate_content_calendar.return_value = {
            "weeks": [
                {
                    "week": i,
                    "theme": f"Week {i} theme",
                    "blog_topics": [{"title": f"Blog {i}", "target_keyword": f"keyword {i}", "word_count": 1500}],
                    "social_themes": [],
                }
                for i in range(1, 5)
            ]
        }
        # Platform-specific ad generation (reddit, microsoft, quora, tiktok, linkedin, pinterest)
        m._chat_json.return_value = {
            "ads": [
                {"title": "Ad 1 — Test Clinic", "body": "Body text for ad 1", "cta": "Learn More"},
                {"title": "Ad 2 — Test Clinic", "body": "Body text for ad 2", "cta": "Call Now"},
                {"title": "Ad 3 — Test Clinic", "body": "Body text for ad 3", "cta": "Get Started"},
            ]
        }

    try:
        yield mocks[0]  # primary mock for assertions
    finally:
        for p in patches:
            p.stop()
