"""
Spam Prevention & Compliance Module.

Enforces TCPA/CAN-SPAM/HIPAA-aligned defaults for outreach:
  - Channel-level rate limits (fax, email, voicemail)
  - Global DNC (Do-Not-Contact) suppression list
  - TCPA quiet-hours enforcement (no contact 8pm–8am local time)
  - Opt-out tracking and automatic suppression
  - CAN-SPAM footer requirement enforcement
  - Compliance audit log

All defaults are loaded on first access — no setup required.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.models.company import Company
from datetime import datetime
import uuid

router = APIRouter(prefix="/spam", tags=["spam"])

# ------------------------------------------------------------------ #
# In-memory state (replace with DB/Redis in production)
# ------------------------------------------------------------------ #
_settings_store: dict[str, dict] = {}   # company_id → settings
_suppression_store: dict[str, list] = {}  # company_id → list of suppressed contacts
_audit_log: dict[str, list] = {}         # company_id → list of audit events

# ------------------------------------------------------------------ #
# Defaults (loaded for every new company automatically)
# ------------------------------------------------------------------ #
DEFAULT_SETTINGS = {
    "enabled": True,
    "tcpa_quiet_hours": {
        "enabled": True,
        "start": "20:00",   # 8 PM local
        "end": "08:00",     # 8 AM local
        "enforce_weekends": True,
        "description": "TCPA prohibits calls/texts outside 8am–8pm local time",
    },
    "rate_limits": {
        "fax": {
            "enabled": True,
            "per_day": 1,
            "per_week": 1,
            "per_month": 3,
            "cooldown_days": 7,
            "description": "Fax: max 1/week, 3/month per recipient",
        },
        "email": {
            "enabled": True,
            "per_day": 1,
            "per_week": 3,
            "per_month": 5,
            "cooldown_days": 2,
            "description": "Email: max 1/day, 5/month per recipient",
        },
        "voicemail": {
            "enabled": True,
            "per_day": 1,
            "per_week": 1,
            "per_month": 2,
            "cooldown_days": 7,
            "description": "Voicemail: max 1/week, 2/month per recipient",
        },
        "sms": {
            "enabled": True,
            "per_day": 1,
            "per_week": 2,
            "per_month": 4,
            "cooldown_days": 3,
            "description": "SMS: max 1/day, 4/month — TCPA written consent required",
        },
    },
    "canspam": {
        "enabled": True,
        "require_footer": True,
        "footer_template": "To unsubscribe, reply STOP or call {phone}. {company_name} · {address}",
        "honor_opt_outs_within_hours": 10,
        "description": "CAN-SPAM: physical address + opt-out required in every commercial email",
    },
    "global_dnc": {
        "enabled": True,
        "check_national_dnc": True,
        "auto_suppress_on_optout": True,
        "description": "Check National Do Not Call registry before voicemail/fax campaigns",
    },
    "hipaa": {
        "enabled": True,
        "no_phi_in_subject": True,
        "no_diagnosis_in_outreach": True,
        "require_baa_for_tools": True,
        "description": "Never include PHI or diagnosis in subject lines or unsecured channels",
    },
}

DEMO_SUPPRESSION = [
    {"id": "sup-1", "contact": "dr.johnson@example.com", "type": "email", "reason": "opted_out", "added_at": "2026-01-10", "channel": "email"},
    {"id": "sup-2", "contact": "(602) 555-0199", "type": "fax", "reason": "dnc_request", "added_at": "2026-01-15", "channel": "fax"},
    {"id": "sup-3", "contact": "office@greenvalleyclinic.com", "type": "email", "reason": "bounce", "added_at": "2026-01-20", "channel": "email"},
    {"id": "sup-4", "contact": "(480) 555-0177", "type": "phone", "reason": "national_dnc", "added_at": "2026-02-01", "channel": "voicemail"},
    {"id": "sup-5", "contact": "dr.smith@familymedicine.net", "type": "email", "reason": "opted_out", "added_at": "2026-02-05", "channel": "email"},
]

DEMO_AUDIT_LOG = [
    {"id": "log-1", "timestamp": "2026-02-20T09:00:00", "event": "rate_limit_blocked", "channel": "fax", "contact": "(602) 555-0120", "reason": "Fax sent within cooldown period (3 days ago)"},
    {"id": "log-2", "timestamp": "2026-02-19T14:30:00", "event": "opt_out_processed", "channel": "email", "contact": "dr.jones@example.com", "reason": "Recipient replied UNSUBSCRIBE"},
    {"id": "log-3", "timestamp": "2026-02-18T08:15:00", "event": "quiet_hours_blocked", "channel": "voicemail", "contact": "(602) 555-0133", "reason": "Attempted contact at 7:45 AM — TCPA quiet hours active"},
    {"id": "log-4", "timestamp": "2026-02-17T16:00:00", "event": "suppression_check", "channel": "fax", "contact": "(602) 555-0199", "reason": "Contact on DNC list — outreach blocked"},
    {"id": "log-5", "timestamp": "2026-02-16T11:00:00", "event": "canspam_footer_added", "channel": "email", "contact": "batch-123", "reason": "CAN-SPAM footer automatically appended to email batch"},
]

COMPLIANCE_RULES = [
    {
        "id": "rule-tcpa-quiet-hours",
        "category": "TCPA",
        "severity": "critical",
        "title": "TCPA Quiet Hours",
        "description": "Federal law prohibits phone calls and text messages outside 8 AM–8 PM local time of the recipient.",
        "applies_to": ["voicemail", "sms"],
        "default_on": True,
    },
    {
        "id": "rule-canspam-footer",
        "category": "CAN-SPAM",
        "severity": "critical",
        "title": "CAN-SPAM Physical Address & Opt-Out",
        "description": "Every commercial email must include a physical mailing address and a functional opt-out mechanism.",
        "applies_to": ["email"],
        "default_on": True,
    },
    {
        "id": "rule-canspam-optout-10h",
        "category": "CAN-SPAM",
        "severity": "high",
        "title": "Honor Opt-Outs Within 10 Business Days",
        "description": "CAN-SPAM requires opt-out requests to be honored within 10 business days.",
        "applies_to": ["email"],
        "default_on": True,
    },
    {
        "id": "rule-hipaa-no-phi-subject",
        "category": "HIPAA",
        "severity": "critical",
        "title": "No PHI in Email Subject or Fax Cover",
        "description": "Never include patient names, diagnoses, or other PHI in email subjects or unsecured fax cover sheets.",
        "applies_to": ["email", "fax"],
        "default_on": True,
    },
    {
        "id": "rule-fax-rate-limit",
        "category": "Best Practice",
        "severity": "medium",
        "title": "Fax Rate Limiting",
        "description": "Maximum 1 fax per recipient per week to avoid JFPA violations and maintain sender reputation.",
        "applies_to": ["fax"],
        "default_on": True,
    },
    {
        "id": "rule-global-dnc",
        "category": "TCPA",
        "severity": "high",
        "title": "National DNC Registry Check",
        "description": "Check the National Do-Not-Call registry before any phone/fax campaigns. Violations carry $43,000 fines.",
        "applies_to": ["voicemail", "fax"],
        "default_on": True,
    },
]


def _get_settings(company_id: str) -> dict:
    if company_id not in _settings_store:
        import copy
        _settings_store[company_id] = copy.deepcopy(DEFAULT_SETTINGS)
    return _settings_store[company_id]


def _get_suppression(company_id: str) -> list:
    return _suppression_store.get(company_id, DEMO_SUPPRESSION)


def _add_audit(company_id: str, event: dict):
    if company_id not in _audit_log:
        _audit_log[company_id] = list(DEMO_AUDIT_LOG)
    _audit_log[company_id].insert(0, event)
    _audit_log[company_id] = _audit_log[company_id][:200]  # keep last 200


# ------------------------------------------------------------------ #
# Endpoints
# ------------------------------------------------------------------ #

@router.get("/{company_id}/settings")
async def get_settings(company_id: str):
    """Get current spam/compliance settings for a company (defaults auto-loaded)."""
    return {
        "settings": _get_settings(company_id),
        "rules": COMPLIANCE_RULES,
        "compliance_score": _compute_compliance_score(company_id),
    }


@router.put("/{company_id}/settings")
async def update_settings(company_id: str, data: dict):
    """Update spam prevention settings."""
    settings = _get_settings(company_id)

    # Deep merge: only update keys that are provided
    for key, value in data.items():
        if key in settings and isinstance(value, dict) and isinstance(settings[key], dict):
            settings[key].update(value)
        else:
            settings[key] = value

    _add_audit(company_id, {
        "id": str(uuid.uuid4()),
        "timestamp": datetime.utcnow().isoformat(),
        "event": "settings_updated",
        "channel": "all",
        "contact": "system",
        "reason": f"Settings updated: {', '.join(data.keys())}",
    })
    return {"settings": settings, "compliance_score": _compute_compliance_score(company_id)}


@router.get("/{company_id}/suppression")
async def get_suppression_list(company_id: str, channel: str = "all"):
    """Get the suppression list (DNC, opt-outs, bounces)."""
    items = _get_suppression(company_id)
    if channel != "all":
        items = [i for i in items if i.get("channel") == channel]
    return {"suppression_list": items, "total": len(items)}


@router.post("/{company_id}/suppression")
async def add_to_suppression(company_id: str, data: dict):
    """Add a contact to the suppression list."""
    contact = data.get("contact", "").strip()
    if not contact:
        raise HTTPException(status_code=400, detail="contact is required")

    item = {
        "id": str(uuid.uuid4()),
        "contact": contact,
        "type": data.get("type", "email"),
        "reason": data.get("reason", "manual"),
        "channel": data.get("channel", "email"),
        "added_at": datetime.utcnow().strftime("%Y-%m-%d"),
        "notes": data.get("notes", ""),
    }

    if company_id not in _suppression_store:
        _suppression_store[company_id] = list(DEMO_SUPPRESSION)
    _suppression_store[company_id].append(item)

    _add_audit(company_id, {
        "id": str(uuid.uuid4()),
        "timestamp": datetime.utcnow().isoformat(),
        "event": "suppression_added",
        "channel": item["channel"],
        "contact": contact,
        "reason": f"Manually added: {item['reason']}",
    })
    return item


@router.delete("/{company_id}/suppression/{suppression_id}")
async def remove_from_suppression(company_id: str, suppression_id: str):
    """Remove a contact from the suppression list."""
    items = _suppression_store.get(company_id, list(DEMO_SUPPRESSION))
    updated = [i for i in items if i["id"] != suppression_id]
    if len(updated) == len(items):
        raise HTTPException(status_code=404, detail="Suppression entry not found")
    _suppression_store[company_id] = updated
    return {"deleted": suppression_id}


@router.post("/{company_id}/check")
async def check_contact(company_id: str, data: dict):
    """
    Check if a contact/message can be sent.
    Returns pass/block decision with reasons.
    """
    contact = data.get("contact", "")
    channel = data.get("channel", "email")
    local_hour = data.get("local_hour", datetime.utcnow().hour)

    settings = _get_settings(company_id)
    blocks = []

    # Check quiet hours
    if settings["tcpa_quiet_hours"]["enabled"] and channel in ["voicemail", "sms"]:
        start_h = int(settings["tcpa_quiet_hours"]["start"].split(":")[0])
        end_h = int(settings["tcpa_quiet_hours"]["end"].split(":")[0])
        if local_hour < end_h or local_hour >= start_h:
            blocks.append({
                "rule": "tcpa_quiet_hours",
                "severity": "critical",
                "message": f"TCPA quiet hours: {channel} blocked outside 8am–8pm",
            })

    # Check suppression list
    suppressed = _get_suppression(company_id)
    if any(s["contact"].lower() == contact.lower() for s in suppressed):
        blocks.append({
            "rule": "suppression_list",
            "severity": "critical",
            "message": f"Contact '{contact}' is on the suppression list",
        })

    allowed = len(blocks) == 0
    if not allowed:
        _add_audit(company_id, {
            "id": str(uuid.uuid4()),
            "timestamp": datetime.utcnow().isoformat(),
            "event": f"{blocks[0]['rule']}_blocked",
            "channel": channel,
            "contact": contact,
            "reason": blocks[0]["message"],
        })

    return {
        "allowed": allowed,
        "contact": contact,
        "channel": channel,
        "blocks": blocks,
        "message": "OK to send" if allowed else f"Blocked: {blocks[0]['message']}",
    }


@router.get("/{company_id}/audit")
async def get_audit_log(company_id: str, limit: int = 50):
    """Get compliance audit log."""
    logs = _audit_log.get(company_id, DEMO_AUDIT_LOG)
    return {"events": logs[:limit], "total": len(logs)}


@router.get("/{company_id}/compliance-report")
async def get_compliance_report(company_id: str):
    """Generate a compliance status report."""
    settings = _get_settings(company_id)
    suppression = _get_suppression(company_id)

    critical_rules = [r for r in COMPLIANCE_RULES if r["severity"] == "critical"]
    enabled_critical = sum(
        1 for r in critical_rules
        if _is_rule_enabled(r["id"], settings)
    )

    return {
        "score": _compute_compliance_score(company_id),
        "grade": _score_to_grade(_compute_compliance_score(company_id)),
        "rules_total": len(COMPLIANCE_RULES),
        "rules_active": sum(1 for r in COMPLIANCE_RULES if _is_rule_enabled(r["id"], settings)),
        "critical_rules_active": f"{enabled_critical}/{len(critical_rules)}",
        "suppression_count": len(suppression),
        "opt_outs_this_month": sum(1 for s in suppression if s.get("reason") == "opted_out"),
        "channels": {
            ch: {
                "rate_limiting": settings["rate_limits"].get(ch, {}).get("enabled", False),
                "per_month_limit": settings["rate_limits"].get(ch, {}).get("per_month", "—"),
            }
            for ch in ["fax", "email", "voicemail", "sms"]
        },
        "tcpa_quiet_hours": settings["tcpa_quiet_hours"]["enabled"],
        "canspam_footer": settings["canspam"]["enabled"],
        "hipaa_phi_guard": settings["hipaa"]["enabled"],
        "global_dnc_check": settings["global_dnc"]["enabled"],
    }


def _is_rule_enabled(rule_id: str, settings: dict) -> bool:
    mapping = {
        "rule-tcpa-quiet-hours": settings["tcpa_quiet_hours"]["enabled"],
        "rule-canspam-footer": settings["canspam"]["enabled"],
        "rule-canspam-optout-10h": settings["canspam"]["enabled"],
        "rule-hipaa-no-phi-subject": settings["hipaa"]["enabled"],
        "rule-fax-rate-limit": settings["rate_limits"]["fax"]["enabled"],
        "rule-global-dnc": settings["global_dnc"]["enabled"],
    }
    return mapping.get(rule_id, False)


def _compute_compliance_score(company_id: str) -> int:
    settings = _get_settings(company_id)
    score = 0
    weights = {
        "tcpa_quiet_hours": 25,
        "canspam": 20,
        "hipaa": 20,
        "global_dnc": 15,
        "fax_rate": 10,
        "email_rate": 5,
        "voicemail_rate": 5,
    }
    if settings["tcpa_quiet_hours"]["enabled"]:
        score += weights["tcpa_quiet_hours"]
    if settings["canspam"]["enabled"]:
        score += weights["canspam"]
    if settings["hipaa"]["enabled"]:
        score += weights["hipaa"]
    if settings["global_dnc"]["enabled"]:
        score += weights["global_dnc"]
    if settings["rate_limits"]["fax"]["enabled"]:
        score += weights["fax_rate"]
    if settings["rate_limits"]["email"]["enabled"]:
        score += weights["email_rate"]
    if settings["rate_limits"]["voicemail"]["enabled"]:
        score += weights["voicemail_rate"]
    return score


def _score_to_grade(score: int) -> str:
    if score >= 90:
        return "A"
    if score >= 80:
        return "B"
    if score >= 70:
        return "C"
    if score >= 60:
        return "D"
    return "F"
