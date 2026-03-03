"""
Celery background tasks for campaign orchestration and async operations.
"""
from celery import shared_task
from app.workers.celery_app import celery_app


@celery_app.task(name="app.workers.tasks.ingest_company")
def ingest_company_task(company_id: str, url: str):
    """Async ingestion task for heavy scraping + LLM processing."""
    import asyncio
    from app.db.database import SessionLocal
    from app.api.companies import _run_ingestion

    db = SessionLocal()
    try:
        asyncio.run(_run_ingestion(company_id, url, db))
    finally:
        db.close()


@celery_app.task(name="app.workers.tasks.generate_referral_collateral")
def generate_referral_collateral_task(company_id: str):
    """Generate all referral collateral for a company."""
    import asyncio
    from app.db.database import SessionLocal
    from app.models.company import Company
    from app.api.modules.referral import (
        _generate_fax_sheet_bg,
        _generate_voicemail_bg,
        _generate_email_sequence_bg,
        _generate_postcard_bg,
    )

    db = SessionLocal()
    try:
        company = db.query(Company).filter(Company.id == company_id).first()
        if not company:
            return
        data = {
            "company_name": company.name,
            "website_url": company.website_url,
            "specialty_niche": company.specialty_niche or "",
            "services": company.services or [],
            "providers": company.providers or [],
            "locations": company.locations or [],
            "insurance_accepted": company.insurance_accepted or [],
            "differentiators": company.differentiators or [],
            "brand_guidelines": company.brand_guidelines or {},
        }
        specialties = ["primary care physician", "therapist / counselor", "neurologist"]
        for s in specialties:
            asyncio.run(_generate_fax_sheet_bg(company_id, data, s))
            asyncio.run(_generate_voicemail_bg(company_id, data, s))
        asyncio.run(_generate_email_sequence_bg(company_id, data, "primary care physician"))
        asyncio.run(_generate_postcard_bg(company_id, data))
    finally:
        db.close()


@celery_app.task(name="app.workers.tasks.generate_leads")
def generate_leads_task(company_id: str):
    """Auto-generate NPPES lead list for a company."""
    import asyncio
    from app.db.database import SessionLocal
    from app.models.company import Company
    from app.api.modules.referral import _generate_leads_bg

    db = SessionLocal()
    try:
        company = db.query(Company).filter(Company.id == company_id).first()
        if not company:
            return
        data = {
            "company_name": company.name,
            "specialty_niche": company.specialty_niche or "",
            "locations": company.locations or [],
            "referral_target_states": company.referral_target_states or [],
        }
        asyncio.run(_generate_leads_bg(company_id, data))
    finally:
        db.close()


@celery_app.task(name="app.workers.tasks.process_campaign_enrollments")
def process_campaign_enrollments():
    """
    Daily task: advance campaign enrollments to the next step.
    Sends faxes, emails, voicemails, postcards based on the 30-day sequence.
    """
    from datetime import date
    from app.db.database import SessionLocal
    from app.models.referral import CampaignEnrollment

    db = SessionLocal()
    try:
        today = date.today()
        due = db.query(CampaignEnrollment).filter(
            CampaignEnrollment.next_action_date <= today,
            CampaignEnrollment.status == "active",
        ).all()

        for enrollment in due:
            # In production: dispatch to the appropriate channel API
            # For now, advance the step and log
            enrollment.current_step += 1
            if enrollment.current_step >= 8:  # 8 steps in sequence
                enrollment.status = "completed"

        db.commit()
    finally:
        db.close()
