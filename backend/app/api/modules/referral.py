"""
Module 2: Referral Marketing Engine API routes.
Handles lead list management, collateral generation, and campaign orchestration.
"""
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, UploadFile, File, Form
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
import csv
import io
import re
import uuid

import logging

from app.db.database import get_db, SessionLocal

log = logging.getLogger(__name__)
from app.models.company import Company
from app.models.referral import ReferralLead, Touchpoint, Campaign, CampaignEnrollment, LeadStatus
from app.models.content import ApprovalItem, ContentItem, ContentType, ContentStatus
from app.services.llm import llm_service
from app.services.nppes import generate_lead_list_for_company

router = APIRouter(prefix="/referral", tags=["referral"])

# ------------------------------------------------------------------ #
# Smart CSV Column Mapping
# ------------------------------------------------------------------ #

# Comprehensive alias table — normalized (lowercase, alphanumeric only)
_FIELD_ALIASES: dict[str, list[str]] = {
    "npi": [
        "npi", "npinumber", "nationalprovidernumber", "nationalprovidernumberidentifier",
        "npiid", "npicode", "providernpi", "providernumber",
    ],
    "first_name": [
        "firstname", "first", "fname", "givenname", "providerfirst", "providerfirstname",
        "drfirst", "doctorfirst", "physfirst", "pfirst",
    ],
    "last_name": [
        "lastname", "last", "lname", "surname", "familyname", "providerlast",
        "providerlastname", "drlast", "doctorlast", "physlast", "plast",
    ],
    "credentials": [
        "credentials", "credential", "degree", "degrees", "suffix", "designation",
        "cert", "certification", "licensetype", "title", "mddodegree",
    ],
    "specialty": [
        "specialty", "speciality", "specialties", "primaryspecialty", "medicalspecialty",
        "taxonomy", "taxonomycode", "practicespecialty", "fieldofpractice", "discipline",
    ],
    "practice_name": [
        "practicename", "practice", "organization", "org", "groupname", "group",
        "clinic", "clinicname", "hospital", "hospitalname", "officename", "employer",
        "facilityname", "institutionname", "company",
    ],
    "fax": [
        "fax", "faxnumber", "faxno", "faxphone", "officefax", "directfax", "faxline",
    ],
    "phone": [
        "phone", "phonenumber", "telephone", "tel", "mobile", "cell", "officephone",
        "officetelephone", "workphone", "contactphone", "directphone", "mainnumber",
    ],
    "email": [
        "email", "emailaddress", "eaddress", "mail", "contactemail", "officeemail",
        "workemail", "electronicmail",
    ],
    "address": [
        "address", "address1", "streetaddress", "street", "officeaddress",
        "mailingaddress", "addr", "streetline1", "practiceaddress",
    ],
    "city": [
        "city", "town", "municipality", "officecity", "practicecity",
    ],
    "state": [
        "state", "statecode", "st", "province", "stateabbr", "officestate",
        "practicestate",
    ],
    "zip": [
        "zip", "zipcode", "postalcode", "postal", "postcode", "officezipcode",
        "practicezipcode",
    ],
}


def _normalize_col(header: str) -> str:
    """Lowercase + strip all non-alphanumeric characters for fuzzy matching."""
    return re.sub(r"[^a-z0-9]", "", header.lower().strip())


def _map_columns(fieldnames: list[str]) -> dict[str, str]:
    """Return {actual_csv_header: canonical_field_name} for all recognized columns."""
    mapping: dict[str, str] = {}
    for header in fieldnames:
        normalized = _normalize_col(header)
        for canonical, aliases in _FIELD_ALIASES.items():
            if normalized in aliases:
                mapping[header] = canonical
                break
    return mapping

# Campaign sequence template — 30-day multi-touch
CAMPAIGN_SEQUENCE = [
    {"day": 1,  "channel": "email",     "action": "introduction_email"},
    {"day": 3,  "channel": "fax",       "action": "referral_fax_sheet"},
    {"day": 7,  "channel": "email",     "action": "follow_up_email_1"},
    {"day": 10, "channel": "voicemail", "action": "voicemail_drop"},
    {"day": 14, "channel": "mail",      "action": "postcard"},
    {"day": 18, "channel": "email",     "action": "case_study_email"},
    {"day": 23, "channel": "email",     "action": "lunch_learn_email"},
    {"day": 28, "channel": "fax",       "action": "follow_up_fax"},
]


# ------------------------------------------------------------------ #
# Lead List Management
# ------------------------------------------------------------------ #

@router.get("/{company_id}/leads")
async def list_leads(
    company_id: str,
    status: Optional[str] = None,
    specialty: Optional[str] = None,
    state: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    db: Session = Depends(get_db),
):
    query = db.query(ReferralLead).filter(ReferralLead.company_id == company_id)
    if status:
        query = query.filter(ReferralLead.status == status)
    if specialty:
        query = query.filter(ReferralLead.specialty.ilike(f"%{specialty}%"))
    if state:
        query = query.filter(ReferralLead.state == state.upper())

    total = query.count()
    leads = query.offset(offset).limit(limit).all()
    return {"total": total, "leads": [_lead_to_dict(l) for l in leads]}


@router.post("/{company_id}/leads/generate")
async def generate_leads(
    company_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Auto-generate lead list from NPPES for this company's locations + specialty."""
    company = _get_company(company_id, db)
    background_tasks.add_task(_generate_leads_bg, company_id, company.dict_data())
    return {"status": "generating", "message": "Lead generation started via NPPES"}


@router.post("/{company_id}/leads/upload")
async def upload_leads_csv(
    company_id: str,
    file: UploadFile = File(...),
    list_name: Optional[str] = Form(None),
    db: Session = Depends(get_db),
):
    """Upload leads from CSV with automatic column name detection.

    Recognizes common header variations — "First Name", "firstname", "fname",
    "Provider First Name", "NPI Number", "Fax #", etc. — automatically.
    Pass an optional list_name to label this batch (e.g. "Pediatricians in Texas"),
    which creates a named Campaign and enrolls all uploaded leads into it.
    """
    _get_company(company_id, db)

    # Decode — handle Excel UTF-8 BOM and Latin-1 fallback
    raw = await file.read()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw.decode("latin-1")

    reader = csv.DictReader(io.StringIO(text))
    fieldnames: list[str] = list(reader.fieldnames or [])
    col_map = _map_columns(fieldnames)
    unrecognized = [h for h in fieldnames if h not in col_map]

    created = 0
    errors: list[dict] = []
    lead_ids: list[str] = []

    for i, row in enumerate(reader):
        try:
            # Apply alias mapping; strip whitespace from values
            mapped = {
                col_map.get(k, k): (v.strip() if isinstance(v, str) else v)
                for k, v in row.items()
            }
            lead = ReferralLead(
                company_id=company_id,
                npi=mapped.get("npi", ""),
                first_name=mapped.get("first_name", ""),
                last_name=mapped.get("last_name", ""),
                credentials=mapped.get("credentials", ""),
                specialty=mapped.get("specialty", ""),
                practice_name=mapped.get("practice_name", ""),
                fax=mapped.get("fax", ""),
                phone=mapped.get("phone", ""),
                email=mapped.get("email", ""),
                address=mapped.get("address", ""),
                city=mapped.get("city", ""),
                state=mapped.get("state", ""),
                zip_code=mapped.get("zip", ""),
                source="csv_upload",
            )
            db.add(lead)
            db.flush()
            lead_ids.append(str(lead.id))
            created += 1
        except Exception as e:
            errors.append({"row": i + 1, "error": str(e)})

    # If a list name was provided, create a Campaign and enroll all leads
    campaign_id: Optional[str] = None
    if list_name and lead_ids:
        from datetime import date
        campaign = Campaign(
            company_id=company_id,
            name=list_name.strip()[:200],
            module="referral",
            channel="csv_upload",
            status="draft",
            settings={
                "source_file": file.filename,
                "column_mapping": col_map,
                "lead_count": created,
            },
        )
        db.add(campaign)
        db.flush()
        for lid in lead_ids:
            enrollment = CampaignEnrollment(
                campaign_id=campaign.id,
                lead_id=lid,
                current_step=0,
                next_action_date=date.today(),
            )
            db.add(enrollment)
        campaign_id = str(campaign.id)

    db.commit()
    return {
        "created": created,
        "errors": errors,
        "list_name": list_name,
        "campaign_id": campaign_id,
        "column_mapping": col_map,
        "unrecognized_columns": unrecognized,
    }


@router.get("/{company_id}/leads/{lead_id}")
async def get_lead(company_id: str, lead_id: str, db: Session = Depends(get_db)):
    lead = _get_lead(company_id, lead_id, db)
    touchpoints = db.query(Touchpoint).filter(Touchpoint.lead_id == lead_id).order_by(Touchpoint.created_at.desc()).all()
    result = _lead_to_dict(lead)
    result["touchpoints"] = [_touchpoint_to_dict(t) for t in touchpoints]
    return result


@router.patch("/{company_id}/leads/{lead_id}")
async def update_lead(
    company_id: str, lead_id: str, payload: dict, db: Session = Depends(get_db)
):
    lead = _get_lead(company_id, lead_id, db)
    allowed = {"status", "email", "fax", "phone", "linkedin_url", "notes"}
    for k, v in payload.items():
        if k in allowed:
            setattr(lead, k, v)
    db.commit()
    return _lead_to_dict(lead)


@router.post("/{company_id}/leads/{lead_id}/suppress")
async def suppress_lead(
    company_id: str, lead_id: str, channel: str, db: Session = Depends(get_db)
):
    lead = _get_lead(company_id, lead_id, db)
    lead.is_suppressed = True
    lead.suppression_channel = channel
    lead.status = LeadStatus.suppressed
    db.commit()
    return {"suppressed": True}


# ------------------------------------------------------------------ #
# Collateral Generation
# ------------------------------------------------------------------ #

@router.post("/{company_id}/generate/fax-sheet")
async def generate_fax_sheet(
    company_id: str,
    payload: dict,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Generate referral fax sheet. payload: {target_specialty: str}"""
    company = _get_company(company_id, db)
    target_specialty = payload.get("target_specialty", "primary care physician")
    background_tasks.add_task(
        _generate_fax_sheet_bg, company_id, company.dict_data(), target_specialty
    )
    return {"status": "generating"}


@router.post("/{company_id}/generate/voicemail-scripts")
async def generate_voicemail_scripts(
    company_id: str,
    payload: dict,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    company = _get_company(company_id, db)
    target_specialty = payload.get("target_specialty", "primary care physician")
    background_tasks.add_task(
        _generate_voicemail_bg, company_id, company.dict_data(), target_specialty
    )
    return {"status": "generating"}


@router.post("/{company_id}/generate/email-sequence")
async def generate_email_sequence(
    company_id: str,
    payload: dict,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    company = _get_company(company_id, db)
    target_specialty = payload.get("target_specialty", "primary care physician")
    background_tasks.add_task(
        _generate_email_sequence_bg, company_id, company.dict_data(), target_specialty
    )
    return {"status": "generating"}


@router.post("/{company_id}/generate/postcard")
async def generate_postcard(
    company_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    company = _get_company(company_id, db)
    background_tasks.add_task(_generate_postcard_bg, company_id, company.dict_data())
    return {"status": "generating"}


@router.post("/{company_id}/generate/all-collateral")
async def generate_all_collateral(
    company_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Generate all referral collateral for all target specialties."""
    company = _get_company(company_id, db)
    company_data = company.dict_data()
    specialties = ["primary care physician", "therapist / counselor", "neurologist", "OB/GYN"]
    for specialty in specialties:
        background_tasks.add_task(_generate_fax_sheet_bg, company_id, company_data, specialty)
        background_tasks.add_task(_generate_voicemail_bg, company_id, company_data, specialty)
    background_tasks.add_task(_generate_email_sequence_bg, company_id, company_data, "primary care physician")
    background_tasks.add_task(_generate_postcard_bg, company_id, company_data)
    return {"status": "generating", "tasks": 4 * 2 + 2}


# ------------------------------------------------------------------ #
# Campaign Orchestration
# ------------------------------------------------------------------ #

@router.post("/{company_id}/campaigns/launch")
async def launch_campaign(
    company_id: str,
    payload: dict,
    db: Session = Depends(get_db),
):
    """
    Launch a multi-channel referral campaign.
    payload: {name: str, lead_ids: [uuid], channels: [email, fax, voicemail, mail]}
    """
    company = _get_company(company_id, db)

    campaign = Campaign(
        company_id=company_id,
        name=payload.get("name", "Referral Campaign"),
        module="referral",
        channel="multi",
        status="active",
        settings={
            "channels": payload.get("channels", ["email", "fax"]),
            "sequence": CAMPAIGN_SEQUENCE,
        },
    )
    db.add(campaign)
    db.flush()

    # Enroll leads
    from datetime import date, timedelta
    for lead_id in payload.get("lead_ids", []):
        enrollment = CampaignEnrollment(
            campaign_id=campaign.id,
            lead_id=lead_id,
            current_step=0,
            next_action_date=date.today(),
        )
        db.add(enrollment)

    db.commit()
    return {
        "campaign_id": str(campaign.id),
        "enrolled_leads": len(payload.get("lead_ids", [])),
        "status": "active",
    }


@router.get("/{company_id}/campaigns")
async def list_campaigns(company_id: str, db: Session = Depends(get_db)):
    campaigns = db.query(Campaign).filter(
        Campaign.company_id == company_id,
        Campaign.module == "referral",
    ).all()
    return [_campaign_to_dict(c) for c in campaigns]


@router.get("/{company_id}/campaigns/{campaign_id}/sequence")
async def get_campaign_sequence(
    company_id: str, campaign_id: str, db: Session = Depends(get_db)
):
    return {"sequence": CAMPAIGN_SEQUENCE, "description": "30-day multi-touch referral sequence"}


# ------------------------------------------------------------------ #
# Background Tasks
# ------------------------------------------------------------------ #

async def _generate_leads_bg(company_id: str, company_data: dict):
    from app.models.referral import ReferralLead
    db = SessionLocal()
    try:
        locations = company_data.get("locations", [])
        target_states = company_data.get("referral_target_states") or []
        if not locations and not target_states:
            log.warning("Lead generation skipped for company %s — no locations or target states configured", company_id)
            return
        leads = await generate_lead_list_for_company(company_data)
        if not leads:
            log.warning(
                "Lead generation returned 0 results for company %s. "
                "Locations: %s, specialty: %s",
                company_id,
                [(loc.get("city"), loc.get("state")) for loc in locations],
                company_data.get("specialty_niche"),
            )
            return
        added = 0
        for lead_data in leads:
            # Skip if NPI already exists for this company
            existing = db.query(ReferralLead).filter(
                ReferralLead.company_id == company_id,
                ReferralLead.npi == lead_data["npi"],
            ).first()
            if not existing:
                lead = ReferralLead(company_id=company_id, **lead_data)
                db.add(lead)
                added += 1
        db.commit()
        log.info("Lead generation complete for company %s — %d leads added", company_id, added)
    except Exception as exc:
        log.error(
            "Lead generation failed for company %s: %s",
            company_id, exc, exc_info=True,
        )
        db.rollback()
    finally:
        db.close()


async def _generate_fax_sheet_bg(company_id: str, company_data: dict, target_specialty: str):
    db = SessionLocal()
    try:
        content = llm_service.generate_fax_sheet_content(company_data, target_specialty)
        ci = ContentItem(
            company_id=company_id,
            content_type=ContentType.fax_sheet,
            status=ContentStatus.pending_review,
            title=f"Referral Fax Sheet — {target_specialty.title()}",
            body=content.get("intro_paragraph", ""),
            extra_data={**content, "target_specialty": target_specialty},
        )
        db.add(ci)
        db.flush()
        _add_to_approval_queue(db, company_id, ci, "referral", "Fax Sheet")
        db.commit()
    except Exception as exc:
        log.error("Fax sheet generation failed: %s", exc, exc_info=True)
        db.rollback()
    finally:
        db.close()


async def _generate_voicemail_bg(company_id: str, company_data: dict, target_specialty: str):
    db = SessionLocal()
    try:
        scripts = llm_service.generate_voicemail_scripts(company_data, target_specialty)
        for script in scripts:
            ci = ContentItem(
                company_id=company_id,
                content_type=ContentType.voicemail_script,
                status=ContentStatus.pending_review,
                title=f"Voicemail Script v{script.get('variant', 1)} — {target_specialty.title()}",
                body=script.get("script", ""),
                extra_data=script,
            )
            db.add(ci)
            db.flush()
            _add_to_approval_queue(db, company_id, ci, "referral", "Voicemail Script")
        db.commit()
    except Exception as exc:
        log.error("Voicemail scripts generation failed: %s", exc, exc_info=True)
        db.rollback()
    finally:
        db.close()


async def _generate_email_sequence_bg(company_id: str, company_data: dict, target_specialty: str):
    db = SessionLocal()
    try:
        emails = llm_service.generate_email_sequence(company_data, target_specialty)
        ci = ContentItem(
            company_id=company_id,
            content_type=ContentType.email_sequence,
            status=ContentStatus.pending_review,
            title=f"Email Sequence — {target_specialty.title()} (7 emails)",
            body=emails[0].get("body", "") if emails else "",
            extra_data={"emails": emails, "target_specialty": target_specialty},
        )
        db.add(ci)
        db.flush()
        _add_to_approval_queue(db, company_id, ci, "referral", "Email Sequence")
        db.commit()
    except Exception as exc:
        log.error("Email sequence generation failed: %s", exc, exc_info=True)
        db.rollback()
    finally:
        db.close()


async def _generate_postcard_bg(company_id: str, company_data: dict):
    db = SessionLocal()
    try:
        content = llm_service.generate_postcard_copy(company_data)
        ci = ContentItem(
            company_id=company_id,
            content_type=ContentType.postcard,
            status=ContentStatus.pending_review,
            title="Referral Postcard (6x9)",
            body=content.get("front", {}).get("headline", ""),
            extra_data=content,
        )
        db.add(ci)
        db.flush()
        _add_to_approval_queue(db, company_id, ci, "referral", "Postcard Design")
        db.commit()
    except Exception as exc:
        log.error("Postcard generation failed: %s", exc, exc_info=True)
        db.rollback()
    finally:
        db.close()


# ------------------------------------------------------------------ #
# Helpers
# ------------------------------------------------------------------ #

def _add_to_approval_queue(db, company_id, content_item, module, type_label):
    # Always include body_preview so the approval UI can render the content.
    # Merge extra_data with body_preview and content_type so the frontend
    # ApprovalPreview component has everything it needs.
    preview: dict = dict(content_item.extra_data or {})
    if content_item.body:
        preview["body_preview"] = content_item.body[:500]
    preview["content_type"] = content_item.content_type
    item = ApprovalItem(
        company_id=company_id,
        content_item_id=content_item.id,
        item_type=type_label.lower().replace(" ", "_"),
        title=content_item.title,
        preview_data=preview,
        module=module,
    )
    db.add(item)


def _get_company(company_id: str, db: Session) -> Company:
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    # Attach a helper method
    company.dict_data = lambda: {
        "company_name": company.name,
        "website_url": company.website_url,
        "specialty_niche": company.specialty_niche or "",
        "services": company.services or [],
        "providers": company.providers or [],
        "locations": company.locations or [],
        "insurance_accepted": company.insurance_accepted or [],
        "differentiators": company.differentiators or [],
        "target_demographics": company.target_demographics or [],
        "brand_guidelines": company.brand_guidelines or {},
        "referral_target_states": company.referral_target_states or [],
    }
    return company


def _get_lead(company_id: str, lead_id: str, db: Session) -> ReferralLead:
    lead = db.query(ReferralLead).filter(
        ReferralLead.id == lead_id,
        ReferralLead.company_id == company_id,
    ).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    return lead


def _lead_to_dict(lead: ReferralLead) -> dict:
    return {
        "id": str(lead.id),
        "npi": lead.npi,
        "name": f"{lead.first_name} {lead.last_name}".strip(),
        "first_name": lead.first_name,
        "last_name": lead.last_name,
        "credentials": lead.credentials,
        "specialty": lead.specialty,
        "practice_name": lead.practice_name,
        "city": lead.city,
        "state": lead.state,
        "fax": lead.fax,
        "phone": lead.phone,
        "email": lead.email,
        "linkedin_url": lead.linkedin_url,
        "status": lead.status,
        "is_suppressed": lead.is_suppressed,
        "source": lead.source,
        "created_at": lead.created_at.isoformat() if lead.created_at else None,
    }


def _touchpoint_to_dict(t: Touchpoint) -> dict:
    return {
        "id": str(t.id),
        "channel": t.channel,
        "direction": t.direction,
        "status": t.status,
        "subject": t.subject,
        "created_at": t.created_at.isoformat() if t.created_at else None,
    }


def _campaign_to_dict(c: Campaign) -> dict:
    return {
        "id": str(c.id),
        "name": c.name,
        "status": c.status,
        "channel": c.channel,
        "impressions": c.impressions,
        "clicks": c.clicks,
        "form_submissions": c.form_submissions,
        "spend": c.spend,
        "budget_cap": c.budget_cap,
        "created_at": c.created_at.isoformat() if c.created_at else None,
    }
