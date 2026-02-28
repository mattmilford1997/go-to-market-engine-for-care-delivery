"""
Company Ingestion Pipeline — orchestrates scraping + LLM extraction for a company URL.
"""
import re
from app.services.scraper import scraper
from app.services.llm import llm_service


async def ingest_company(url: str) -> dict:
    """
    Full ingestion pipeline:
    1. Scrape website with Playwright
    2. Extract structured data via LLM
    3. Merge CSS brand hints with LLM tone/style analysis
    4. Return ready-to-save company data dict
    """
    # Step 1: Scrape
    scrape_result = await scraper.scrape_website(url)
    raw_html = scrape_result.get("raw_html", "")
    css_brand = scrape_result.get("brand_hints", {})

    if not raw_html:
        raise ValueError(f"Failed to scrape {url}: {scrape_result.get('error', 'No content')}")

    # Step 2: LLM extraction
    company_data = llm_service.extract_company_data(raw_html, url)

    # Step 3: Merge CSS brand hints into brand_guidelines
    brand = company_data.get("brand_guidelines", {})
    if css_brand.get("colors"):
        # Deduplicate and clean RGB → keep raw values for now
        raw_colors = [c for c in css_brand["colors"] if c and "rgba(0" not in c][:10]
        brand.setdefault("css_colors_raw", raw_colors)
    if css_brand.get("fonts"):
        brand.setdefault("css_fonts_raw", css_brand["fonts"][:5])
    company_data["brand_guidelines"] = brand

    # Step 4: Merge structured data (JSON-LD schemas) if useful
    schemas = scrape_result.get("structured_data", [])
    for schema in schemas:
        schema_type = schema.get("@type", "")
        if schema_type in ("MedicalOrganization", "LocalBusiness", "Physician"):
            # Supplement missing data
            if not company_data.get("locations") and schema.get("address"):
                addr = schema["address"]
                company_data["locations"] = [{
                    "name": schema.get("name", ""),
                    "address": addr.get("streetAddress", ""),
                    "city": addr.get("addressLocality", ""),
                    "state": addr.get("addressRegion", ""),
                    "zip": addr.get("postalCode", ""),
                    "phone": schema.get("telephone", ""),
                    "hours": "",
                }]

    # Step 5: Generate slug
    company_name = company_data.get("company_name", "company")
    company_data["slug"] = _slugify(company_name)
    company_data["website_url"] = url

    return company_data


def _slugify(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[\s_]+", "-", text)
    text = re.sub(r"-{2,}", "-", text)
    return text[:80]
