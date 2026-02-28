from fastapi import APIRouter
from datetime import datetime
import uuid

router = APIRouter(prefix="/intake", tags=["intake"])

_form_store: dict[str, list] = {}

DEMO_FORMS = [
    {
        "id": "form-depression",
        "name": "Depression & Anxiety Intake",
        "description": "Screens for PHQ-9, GAD-7, and collects insurance + referral source",
        "fields_count": 12,
        "responses": 47,
        "completion_rate": 86,
        "created_at": "2026-01-15",
        "status": "active",
        "embed_url": "https://forms.example.com/depression",
    },
    {
        "id": "form-tms",
        "name": "TMS Therapy Pre-Screening",
        "description": "Checks TMS eligibility criteria, medication history, and prior treatment",
        "fields_count": 8,
        "responses": 23,
        "completion_rate": 91,
        "created_at": "2026-01-28",
        "status": "active",
        "embed_url": "https://forms.example.com/tms-screening",
    },
    {
        "id": "form-general",
        "name": "General Mental Health Intake",
        "description": "Comprehensive new patient intake with demographics, insurance, and history",
        "fields_count": 15,
        "responses": 89,
        "completion_rate": 78,
        "created_at": "2026-02-05",
        "status": "active",
        "embed_url": "https://forms.example.com/general-intake",
    },
    {
        "id": "form-med-management",
        "name": "Medication Management Intake",
        "description": "Current medications, pharmacy info, and symptom tracker for psychiatric follow-up",
        "fields_count": 10,
        "responses": 34,
        "completion_rate": 82,
        "created_at": "2026-02-12",
        "status": "active",
        "embed_url": "https://forms.example.com/med-management",
    },
]

FIELD_TEMPLATES = [
    {"type": "text", "label": "Full Name", "required": True},
    {"type": "email", "label": "Email Address", "required": True},
    {"type": "phone", "label": "Phone Number", "required": True},
    {"type": "date", "label": "Date of Birth", "required": True},
    {"type": "select", "label": "Insurance Provider", "required": True, "options": ["Aetna", "BCBS", "Cigna", "United", "Self-pay", "Other"]},
    {"type": "select", "label": "How did you hear about us?", "required": False, "options": ["Doctor Referral", "Google Search", "Insurance Directory", "Social Media", "Friend/Family", "Other"]},
    {"type": "textarea", "label": "Chief Complaint", "required": True},
    {"type": "scale", "label": "Rate your current mood (1–10)", "required": True, "min": 1, "max": 10},
    {"type": "checkbox", "label": "Current symptoms", "required": False, "options": ["Depression", "Anxiety", "Insomnia", "ADHD", "Bipolar", "PTSD"]},
    {"type": "textarea", "label": "Previous mental health treatment?", "required": False},
]


@router.get("/{company_id}/forms")
async def list_forms(company_id: str):
    return {"forms": _form_store.get(company_id, DEMO_FORMS)}


@router.post("/{company_id}/forms")
async def create_form(company_id: str, data: dict):
    form = {
        "id": str(uuid.uuid4()),
        "name": data.get("name", "New Intake Form"),
        "description": data.get("description", ""),
        "fields_count": len(data.get("fields", [])),
        "responses": 0,
        "completion_rate": 0,
        "created_at": datetime.utcnow().strftime("%Y-%m-%d"),
        "status": "draft",
        "fields_data": data.get("fields", []),
        "embed_url": f"https://forms.example.com/{str(uuid.uuid4())[:8]}",
    }
    if company_id not in _form_store:
        _form_store[company_id] = list(DEMO_FORMS)
    _form_store[company_id].append(form)
    return form


@router.get("/{company_id}/forms/{form_id}")
async def get_form(company_id: str, form_id: str):
    forms = _form_store.get(company_id, DEMO_FORMS)
    for f in forms:
        if f["id"] == form_id:
            return f
    return {**DEMO_FORMS[0], "fields_data": FIELD_TEMPLATES}


@router.get("/field-templates")
async def get_field_templates():
    return {"fields": FIELD_TEMPLATES}
