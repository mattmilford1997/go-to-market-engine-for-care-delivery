"""Module 4: SEO Optimizer API routes."""
import asyncio
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import Optional
import httpx

from app.db.database import get_db
from app.models.company import Company
from app.models.seo import SEOReport
from app.services.llm import llm_service

router = APIRouter(prefix="/seo", tags=["seo"])


@router.post("/{company_id}/audit")
async def run_audit(
    company_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Kick off a full SEO audit for this company's website."""
    company = _get_company(company_id, db)
    background_tasks.add_task(_run_full_audit, company_id, company.website_url, _company_data(company), db)
    return {"status": "running", "message": "SEO audit started"}


@router.get("/{company_id}/reports")
async def list_reports(company_id: str, db: Session = Depends(get_db)):
    reports = db.query(SEOReport).filter(SEOReport.company_id == company_id).order_by(SEOReport.created_at.desc()).all()
    return [_report_to_dict(r) for r in reports]


@router.get("/{company_id}/reports/latest")
async def get_latest_report(company_id: str, db: Session = Depends(get_db)):
    report = db.query(SEOReport).filter(
        SEOReport.company_id == company_id
    ).order_by(SEOReport.created_at.desc()).first()
    if not report:
        raise HTTPException(404, "No SEO reports found. Run an audit first.")
    return _report_to_dict(report)


@router.get("/{company_id}/keywords")
async def get_keyword_opportunities(
    company_id: str,
    db: Session = Depends(get_db),
):
    report = db.query(SEOReport).filter(
        SEOReport.company_id == company_id
    ).order_by(SEOReport.created_at.desc()).first()
    if not report:
        raise HTTPException(404, "No SEO data. Run an audit first.")
    return {
        "ranking_keywords": report.ranking_keywords or [],
        "opportunities": report.keyword_opportunities or [],
        "competitor_gaps": report.competitor_gaps or [],
    }


@router.post("/{company_id}/pagespeed")
async def run_pagespeed(company_id: str, db: Session = Depends(get_db)):
    """Run Google PageSpeed Insights for mobile + desktop."""
    company = _get_company(company_id, db)
    results = await _run_pagespeed(company.website_url)
    return results


@router.get("/{company_id}/recommendations")
async def get_recommendations(company_id: str, db: Session = Depends(get_db)):
    report = db.query(SEOReport).filter(
        SEOReport.company_id == company_id
    ).order_by(SEOReport.created_at.desc()).first()
    if not report:
        raise HTTPException(404, "No SEO report found")
    return {"recommendations": report.recommendations or []}


# ------------------------------------------------------------------ #
# Background Tasks + Helpers
# ------------------------------------------------------------------ #

async def _run_full_audit(company_id: str, url: str, company_data: dict, db: Session):
    """Run technical audit + keyword gap + LLM analysis."""
    # 1. PageSpeed
    pagespeed = await _run_pagespeed(url)

    # 2. Crawl (simplified for now — in production this uses Playwright)
    crawl_results = await _basic_crawl(url)

    # 3. GSC data (empty until credentials are provided)
    gsc_data = {}

    # 4. LLM analysis
    seo_analysis = llm_service.analyze_seo_data(company_data, gsc_data, crawl_results)

    report = SEOReport(
        company_id=company_id,
        report_type="full_audit",
        pagespeed_mobile=pagespeed.get("mobile", {}).get("score"),
        pagespeed_desktop=pagespeed.get("desktop", {}).get("score"),
        core_web_vitals=pagespeed.get("core_web_vitals", {}),
        crawl_errors=crawl_results.get("errors", []),
        meta_issues=crawl_results.get("meta_issues", []),
        keyword_opportunities=seo_analysis.get("content_opportunities", []),
        recommendations=seo_analysis.get("quick_wins", []) + seo_analysis.get("technical_fixes", []),
    )
    db.add(report)
    db.commit()


async def _run_pagespeed(url: str) -> dict:
    """Call Google PageSpeed Insights API (free, no key required for basic use)."""
    from app.core.config import settings
    results = {}
    async with httpx.AsyncClient(timeout=30.0) as client:
        for strategy in ["mobile", "desktop"]:
            params = {
                "url": url,
                "strategy": strategy,
                "category": ["performance", "accessibility", "best-practices", "seo"],
            }
            if settings.GOOGLE_PAGESPEED_API_KEY:
                params["key"] = settings.GOOGLE_PAGESPEED_API_KEY
            try:
                resp = await client.get(
                    "https://www.googleapis.com/pagespeedonline/v5/runPagespeed",
                    params=params,
                )
                data = resp.json()
                cats = data.get("lighthouseResult", {}).get("categories", {})
                audits = data.get("lighthouseResult", {}).get("audits", {})

                results[strategy] = {
                    "score": int(cats.get("performance", {}).get("score", 0) * 100),
                    "seo_score": int(cats.get("seo", {}).get("score", 0) * 100),
                    "accessibility_score": int(cats.get("accessibility", {}).get("score", 0) * 100),
                    "lcp": audits.get("largest-contentful-paint", {}).get("displayValue", ""),
                    "cls": audits.get("cumulative-layout-shift", {}).get("displayValue", ""),
                    "fid": audits.get("total-blocking-time", {}).get("displayValue", ""),
                }
            except Exception as e:
                results[strategy] = {"error": str(e), "score": None}

    results["core_web_vitals"] = {
        "lcp": results.get("mobile", {}).get("lcp", ""),
        "cls": results.get("mobile", {}).get("cls", ""),
        "fid": results.get("mobile", {}).get("fid", ""),
    }
    return results


async def _basic_crawl(url: str) -> dict:
    """Basic HTTP crawl to check status codes, meta tags, headings."""
    results = {"pages": [], "errors": [], "meta_issues": []}
    async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
        try:
            resp = await client.get(url)
            from bs4 import BeautifulSoup
            soup = BeautifulSoup(resp.text, "html.parser")

            title = soup.find("title")
            meta_desc = soup.find("meta", attrs={"name": "description"})
            h1_tags = soup.find_all("h1")
            canonical = soup.find("link", attrs={"rel": "canonical"})

            page_data = {
                "url": url,
                "status_code": resp.status_code,
                "title": title.get_text() if title else "",
                "title_length": len(title.get_text()) if title else 0,
                "meta_description": meta_desc.get("content", "") if meta_desc else "",
                "meta_description_length": len(meta_desc.get("content", "")) if meta_desc else 0,
                "h1_count": len(h1_tags),
                "h1_text": h1_tags[0].get_text()[:100] if h1_tags else "",
                "canonical": canonical.get("href", "") if canonical else "",
            }
            results["pages"].append(page_data)

            # Flag issues
            if not title:
                results["meta_issues"].append({"url": url, "issue": "missing_title", "severity": "high"})
            elif len(title.get_text()) > 60:
                results["meta_issues"].append({"url": url, "issue": "title_too_long", "severity": "medium"})
            if not meta_desc:
                results["meta_issues"].append({"url": url, "issue": "missing_meta_description", "severity": "high"})
            if len(h1_tags) == 0:
                results["meta_issues"].append({"url": url, "issue": "missing_h1", "severity": "high"})
            elif len(h1_tags) > 1:
                results["meta_issues"].append({"url": url, "issue": "multiple_h1s", "severity": "medium"})

        except Exception as e:
            results["errors"].append({"url": url, "error": str(e)})

    return results


def _get_company(company_id: str, db: Session) -> Company:
    c = db.query(Company).filter(Company.id == company_id).first()
    if not c:
        raise HTTPException(404, "Company not found")
    return c


def _company_data(company: Company) -> dict:
    return {
        "company_name": company.name,
        "website_url": company.website_url,
        "specialty_niche": company.specialty_niche or "",
        "services": company.services or [],
        "locations": company.locations or [],
    }


def _report_to_dict(r: SEOReport) -> dict:
    return {
        "id": str(r.id),
        "report_type": r.report_type,
        "pagespeed_mobile": r.pagespeed_mobile,
        "pagespeed_desktop": r.pagespeed_desktop,
        "core_web_vitals": r.core_web_vitals,
        "crawl_errors": r.crawl_errors,
        "meta_issues": r.meta_issues,
        "keyword_opportunities": r.keyword_opportunities,
        "ranking_keywords": r.ranking_keywords,
        "recommendations": r.recommendations,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }
