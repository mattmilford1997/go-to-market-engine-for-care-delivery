from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.db.database import engine, Base
import app.models  # noqa — ensure all models are registered before create_all


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        Base.metadata.create_all(bind=engine)
        _seed_defaults()
    except Exception as exc:
        import logging
        logging.getLogger(__name__).error("DB startup failed: %s", exc)
    yield


def _seed_defaults():
    """Create default admin + Novamind company if they don't exist yet."""
    from app.db.database import SessionLocal
    from app.models.user import User, UserRole
    from app.models.company import Company, CompanyStatus
    from app.core.auth import hash_password
    db = SessionLocal()
    try:
        if db.query(User).filter(User.email == "admin@archestudios.com").first():
            return  # Already seeded

        company = db.query(Company).filter(Company.website_url == "https://novamindmentalhealth.com").first()
        if not company:
            company = Company(
                name="NovaMind Mental Health",
                website_url="https://novamindmentalhealth.com",
                slug="novamind",
                status=CompanyStatus.active,
                is_pilot=True,
                specialty_niche="Mental Health & Psychiatry",
                services=[
                    {"name": "Psychiatric Evaluation", "description": "Comprehensive psychiatric assessment"},
                    {"name": "Medication Management", "description": "Ongoing medication monitoring"},
                    {"name": "Psychotherapy", "description": "Individual therapy (CBT, DBT, EMDR)"},
                    {"name": "TMS Therapy", "description": "Transcranial Magnetic Stimulation"},
                    {"name": "Ketamine Therapy", "description": "IV ketamine infusions for depression"},
                ],
                locations=[{"name": "NovaMind HQ", "city": "Austin", "state": "TX", "zip": "78701"}],
                target_demographics=["Adults 25-65", "Treatment-resistant depression", "Anxiety disorders"],
                differentiators=["Advanced neuromodulation", "Ketamine therapy", "Integrative psychiatry"],
                insurance_accepted=["Aetna", "BCBS", "Cigna", "UnitedHealthcare", "Medicare"],
                brand_guidelines={"colors": {"primary": "#6366f1", "secondary": "#818cf8"}, "tone": "Professional, empathetic"},
            )
            db.add(company)
            db.commit()
            db.refresh(company)

        db.add(User(email="admin@archestudios.com", hashed_password=hash_password("arche2024!"),
                     full_name="Arche Admin", role=UserRole.admin, is_active=True, company_id=str(company.id)))
        db.add(User(email="demo@novamindmentalhealth.com", hashed_password=hash_password("novamind2024!"),
                     full_name="NovaMind Demo User", role=UserRole.user, is_active=True, company_id=str(company.id)))
        db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()


from app.api.companies import router as companies_router
from app.api.approval import router as approval_router
from app.api.modules.referral import router as referral_router
from app.api.modules.content import router as content_router
from app.api.modules.paid_ads import router as paid_ads_router
from app.api.modules.seo import router as seo_router
from app.api.modules.profiles import router as profiles_router
from app.api.modules.roi import router as roi_router
from app.api.modules.competitors import router as competitors_router
from app.api.modules.reputation import router as reputation_router
from app.api.modules.reports import router as reports_router
from app.api.modules.templates import router as templates_router
from app.api.modules.schedule import router as schedule_router
from app.api.modules.intake import router as intake_router
from app.api.modules.chat import router as chat_router
from app.api.modules.aeo import router as aeo_router
from app.api.modules.video import router as video_router
from app.api.modules.demo import router as demo_router
from app.api.modules.spam import router as spam_router
from app.api.modules.llm_settings import router as llm_settings_router
from app.api.modules.costs import router as costs_router
from app.api.modules.billing import router as billing_router
from app.api.auth import router as auth_router
from app.api.seed import router as seed_router

app = FastAPI(
    title=settings.APP_NAME,
    description="Arche Studios Healthcare GTM Marketing Engine",
    version="2.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

PREFIX = settings.API_V1_PREFIX
app.include_router(companies_router, prefix=PREFIX)
app.include_router(approval_router, prefix=PREFIX)
app.include_router(referral_router, prefix=PREFIX)
app.include_router(content_router, prefix=PREFIX)
app.include_router(paid_ads_router, prefix=PREFIX)
app.include_router(seo_router, prefix=PREFIX)
app.include_router(profiles_router, prefix=PREFIX)
app.include_router(roi_router, prefix=PREFIX)
app.include_router(competitors_router, prefix=PREFIX)
app.include_router(reputation_router, prefix=PREFIX)
app.include_router(reports_router, prefix=PREFIX)
app.include_router(templates_router, prefix=PREFIX)
app.include_router(schedule_router, prefix=PREFIX)
app.include_router(intake_router, prefix=PREFIX)
app.include_router(chat_router, prefix=PREFIX)
app.include_router(aeo_router, prefix=PREFIX)
app.include_router(video_router, prefix=PREFIX)
app.include_router(demo_router, prefix=PREFIX)
app.include_router(spam_router, prefix=PREFIX)
app.include_router(llm_settings_router, prefix=PREFIX)
app.include_router(costs_router, prefix=PREFIX)
app.include_router(billing_router, prefix=PREFIX)
app.include_router(auth_router, prefix=PREFIX)
app.include_router(seed_router, prefix=PREFIX)


@app.get("/health")
async def health():
    return {"status": "ok", "version": "2.0.0"}


@app.get("/health/detailed")
async def health_detailed():
    db_ok = False
    try:
        from app.db.database import SessionLocal
        import sqlalchemy
        db = SessionLocal()
        db.execute(sqlalchemy.text("SELECT 1"))
        db.close()
        db_ok = True
    except Exception:
        pass
    return {"status": "ok" if db_ok else "degraded", "db": db_ok, "version": "2.0.0"}


@app.get("/")
async def root():
    return {
        "app": settings.APP_NAME,
        "docs": "/api/docs",
        "version": "2.0.0",
    }
