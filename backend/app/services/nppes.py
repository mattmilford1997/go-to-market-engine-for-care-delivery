"""
NPPES Lead Generator — queries the free public NPPES NPI Registry API
to auto-generate referral lead lists based on specialty and location.
No API key required — public endpoint.
"""
import asyncio
from typing import Optional
import httpx

NPPES_API_BASE = "https://npiregistry.cms.hhs.gov/api/"

# Taxonomy codes for high-value referral sources for mental health practices
REFERRAL_TARGET_TAXONOMIES = {
    "primary_care": ["207Q00000X", "207QA0505X", "207QG0300X"],
    "internal_medicine": ["207R00000X"],
    "pediatrics": ["208000000X"],
    "family_medicine": ["207Q00000X"],
    "psychiatry": ["2084P0800X", "2084N0400X", "2084B0040X"],
    "psychology": ["103TC0700X", "103TP0814X", "103T00000X"],
    "licensed_therapist": ["101Y00000X", "101YP2500X", "101YS0200X"],
    "social_worker": ["1041C0700X", "104100000X"],
    "neurologist": ["2084N0600X"],
    "obgyn": ["207V00000X"],
}

# Specialty label → taxonomy codes mapping
SPECIALTY_TO_TAXONOMIES = {
    "tms_therapy": ["207Q00000X", "207R00000X", "2084P0800X", "101Y00000X", "2084N0600X"],
    "ketamine_therapy": ["207Q00000X", "207R00000X", "2084P0800X", "101Y00000X"],
    "psychiatry": ["207Q00000X", "207R00000X", "101Y00000X", "1041C0700X"],
    "therapy": ["207Q00000X", "207R00000X", "2084P0800X"],
    "mental_health": ["207Q00000X", "207R00000X", "208000000X", "207V00000X"],
}


async def query_nppes(
    city: str,
    state: str,
    taxonomy_code: str,
    limit: int = 200,
    skip: int = 0,
) -> list[dict]:
    """Query NPPES registry for providers matching taxonomy in a city/state."""
    params = {
        "version": "2.1",
        "enumeration_type": "NPI-1",  # Individual providers
        "taxonomy_description": "",
        "city": city,
        "state": state,
        "limit": min(limit, 200),
        "skip": skip,
    }

    # Use taxonomy code filter
    params["taxonomy_description"] = taxonomy_code

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            resp = await client.get(NPPES_API_BASE, params=params)
            resp.raise_for_status()
            data = resp.json()
            return data.get("results", [])
        except Exception as exc:
            import logging
            logging.getLogger(__name__).warning(
                "NPPES query failed city=%s state=%s taxonomy=%s: %s",
                city, state, taxonomy_code, exc,
            )
            return []


def parse_nppes_result(result: dict) -> dict:
    """Convert raw NPPES API result into our lead format."""
    basic = result.get("basic", {})
    addresses = result.get("addresses", [])
    taxonomies = result.get("taxonomies", [])

    # Get practice address (location type)
    practice_addr = next(
        (a for a in addresses if a.get("address_purpose") == "LOCATION"),
        addresses[0] if addresses else {},
    )

    # Primary specialty from taxonomies
    primary_taxonomy = next(
        (t for t in taxonomies if t.get("primary")),
        taxonomies[0] if taxonomies else {},
    )

    return {
        "npi": result.get("number", ""),
        "first_name": basic.get("first_name", ""),
        "last_name": basic.get("last_name", ""),
        "credentials": basic.get("credential", ""),
        "specialty": primary_taxonomy.get("desc", ""),
        "practice_name": basic.get("organization_name") or f"Dr. {basic.get('last_name', '')} Practice",
        "address": practice_addr.get("address_1", ""),
        "city": practice_addr.get("city", ""),
        "state": practice_addr.get("state", ""),
        "zip_code": practice_addr.get("postal_code", "")[:5],
        "phone": practice_addr.get("telephone_number", ""),
        "fax": practice_addr.get("fax_number", ""),
        "email": "",  # Not in NPPES — requires enrichment
        "linkedin_url": "",
        "source": "nppes",
    }


async def generate_lead_list_for_company(
    company_data: dict,
    radius_miles: int = 30,
    max_leads: int = 500,
) -> list[dict]:
    """
    Auto-generate a referral lead list for a company based on their specialty and locations.
    Queries NPPES for high-value referral sources near each company location.
    """
    specialty = company_data.get("specialty_niche", "mental_health").lower()
    locations = company_data.get("locations", [])

    if not locations:
        return []

    # Determine which taxonomies to target
    taxonomy_codes = []
    for key, codes in SPECIALTY_TO_TAXONOMIES.items():
        if key in specialty or key.replace("_", " ") in specialty:
            taxonomy_codes.extend(codes)
            break
    if not taxonomy_codes:
        taxonomy_codes = SPECIALTY_TO_TAXONOMIES["mental_health"]

    all_leads = {}  # NPI → lead dict to deduplicate

    tasks = []
    for location in locations[:3]:  # process up to 3 locations
        city = location.get("city", "")
        state = location.get("state", "")
        if not city or not state:
            continue
        for taxonomy in taxonomy_codes[:4]:  # limit taxonomy queries per location
            tasks.append(query_nppes(city=city, state=state, taxonomy_code=taxonomy, limit=200))

    results = await asyncio.gather(*tasks, return_exceptions=True)

    for result_set in results:
        if isinstance(result_set, Exception):
            continue
        for r in result_set:
            parsed = parse_nppes_result(r)
            npi = parsed.get("npi")
            if npi and npi not in all_leads:
                all_leads[npi] = parsed

    leads = list(all_leads.values())[:max_leads]

    # Filter out providers from the same practice (avoid self-referrals)
    company_name_lower = company_data.get("company_name", "").lower()
    leads = [
        l for l in leads
        if company_name_lower not in l.get("practice_name", "").lower()
    ]

    return leads
