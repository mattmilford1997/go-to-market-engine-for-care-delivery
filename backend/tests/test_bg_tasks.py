"""
Tests for background task functions (called directly, not via BackgroundTasks).
Covers the _generate_*_bg helpers in content, paid_ads, referral, profiles, and seo.
"""
import pytest
import asyncio
from unittest.mock import patch, MagicMock, AsyncMock


# ── Helpers ───────────────────────────────────────────────────────────────────

def _company_data():
    return {
        "company_name": "Novamind Mental Health",
        "website_url": "https://novamindmentalhealth.com",
        "specialty_niche": "TMS therapy",
        "services": [{"name": "TMS Therapy"}],
        "providers": [{"name": "Dr. Chen", "credentials": "MD"}],
        "locations": [{"city": "Phoenix", "state": "AZ"}],
        "insurance_accepted": ["Aetna"],
        "differentiators": ["Same-week intake"],
        "target_demographics": ["Adults"],
        "brand_guidelines": {"tone": "warm"},
    }


# ══════════════════════════════════════════════════════════════════════════════
# Content module background tasks
# ══════════════════════════════════════════════════════════════════════════════

class TestContentBgTasks:

    @pytest.mark.asyncio
    async def test_generate_blog_post_bg(self, created_company, db, mock_llm):
        from app.api.modules.content import _generate_blog_post_bg
        from app.models.content import ContentItem, ContentType, ContentStatus

        # _generate_blog_post_bg now owns its own DB session via SessionLocal().
        # Patch SessionLocal so the bg task uses the test session instead of
        # opening a second connection to the real DB.
        mock_session = MagicMock(wraps=db)
        mock_session.close = MagicMock()  # prevent closing the shared test session

        with patch("app.api.modules.content.SessionLocal", return_value=mock_session):
            await _generate_blog_post_bg(
                created_company.id, _company_data(), "TMS therapy insurance", 1500
            )

        item = db.query(ContentItem).filter(
            ContentItem.company_id == created_company.id,
            ContentItem.content_type == ContentType.blog_post,
        ).first()
        assert item is not None
        assert item.status == ContentStatus.pending_review
        assert item.title  # title is set from LLM response

    @pytest.mark.asyncio
    async def test_generate_social_bg_facebook(self, created_company, db, mock_llm):
        from app.api.modules.content import _generate_social_bg
        from app.models.content import ContentItem, ContentType

        await _generate_social_bg(
            created_company.id, _company_data(), "facebook", 5, db
        )

        items = db.query(ContentItem).filter(
            ContentItem.company_id == created_company.id,
            ContentItem.content_type == ContentType.social_facebook,
        ).all()
        assert len(items) > 0

    @pytest.mark.asyncio
    async def test_generate_social_bg_instagram(self, created_company, db, mock_llm):
        from app.api.modules.content import _generate_social_bg
        from app.models.content import ContentItem, ContentType

        await _generate_social_bg(
            created_company.id, _company_data(), "instagram", 5, db
        )

        items = db.query(ContentItem).filter(
            ContentItem.company_id == created_company.id,
            ContentItem.content_type == ContentType.social_instagram,
        ).all()
        assert len(items) > 0

    @pytest.mark.asyncio
    async def test_generate_social_bg_linkedin(self, created_company, db, mock_llm):
        from app.api.modules.content import _generate_social_bg
        from app.models.content import ContentItem, ContentType

        await _generate_social_bg(
            created_company.id, _company_data(), "linkedin", 3, db
        )

        items = db.query(ContentItem).filter(
            ContentItem.company_id == created_company.id,
            ContentItem.content_type == ContentType.social_linkedin,
        ).all()
        assert len(items) > 0

    @pytest.mark.asyncio
    async def test_generate_social_bg_unknown_platform_uses_facebook(self, created_company, db, mock_llm):
        from app.api.modules.content import _generate_social_bg
        from app.models.content import ContentItem, ContentType

        await _generate_social_bg(
            created_company.id, _company_data(), "twitter", 2, db
        )

        items = db.query(ContentItem).filter(
            ContentItem.company_id == created_company.id,
            ContentItem.content_type == ContentType.social_facebook,
        ).all()
        assert len(items) > 0

    @pytest.mark.asyncio
    async def test_generate_calendar_bg(self, created_company, db, mock_llm):
        from app.api.modules.content import _generate_calendar_bg
        from app.models.content import ContentItem

        # _generate_calendar_bg now owns its own DB session via SessionLocal().
        mock_session = MagicMock(wraps=db)
        mock_session.close = MagicMock()

        with patch("app.api.modules.content.SessionLocal", return_value=mock_session):
            await _generate_calendar_bg(created_company.id, _company_data())

        items = db.query(ContentItem).filter(
            ContentItem.company_id == created_company.id,
        ).all()
        # Calendar generates blog + social posts for 4 weeks × platforms
        assert len(items) > 0

    def test_update_content_item(self, client, created_company, db, mock_llm):
        from app.models.content import ContentItem, ContentType, ContentStatus

        item = ContentItem(
            company_id=created_company.id,
            content_type=ContentType.blog_post,
            status=ContentStatus.draft,
            title="Original Title",
            body="Original body",
        )
        db.add(item)
        db.commit()
        db.refresh(item)

        resp = client.patch(
            f"/api/v1/content/{created_company.id}/items/{item.id}",
            json={"title": "Updated Title", "body": "Updated body"},
        )
        assert resp.status_code == 200
        assert resp.json()["title"] == "Updated Title"

    def test_update_content_item_not_found(self, client, created_company):
        import uuid
        resp = client.patch(
            f"/api/v1/content/{created_company.id}/items/{uuid.uuid4()}",
            json={"title": "x"},
        )
        assert resp.status_code == 404

    def test_get_calendar_returns_generating_when_empty(self, client, created_company, mock_llm):
        resp = client.get(f"/api/v1/content/{created_company.id}/calendar")
        assert resp.status_code == 200
        assert resp.json()["status"] == "generating"

    def test_get_calendar_returns_items_when_content_exists(self, client, created_company, db, mock_llm):
        from app.models.content import ContentItem, ContentType, ContentStatus

        item = ContentItem(
            company_id=created_company.id,
            content_type=ContentType.blog_post,
            status=ContentStatus.approved,
            title="Blog Post",
            body="Body",
        )
        db.add(item)
        db.commit()

        resp = client.get(f"/api/v1/content/{created_company.id}/calendar")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"
        assert resp.json()["total_items"] >= 1


# ══════════════════════════════════════════════════════════════════════════════
# Paid Ads module background tasks
# ══════════════════════════════════════════════════════════════════════════════

class TestPaidAdsBgTasks:

    @pytest.mark.asyncio
    async def test_generate_keyword_clusters_bg(self, created_company, db, mock_llm):
        from app.api.modules.paid_ads import _generate_keyword_clusters_bg
        from app.models.content import ContentItem, ContentType

        result = await _generate_keyword_clusters_bg(
            created_company.id, _company_data(), db
        )

        assert isinstance(result, list)
        item = db.query(ContentItem).filter(
            ContentItem.company_id == created_company.id,
            ContentItem.content_type == ContentType.ad_copy_google,
        ).first()
        assert item is not None

    @pytest.mark.asyncio
    async def test_generate_google_copy_bg(self, created_company, db, mock_llm):
        from app.api.modules.paid_ads import _generate_google_copy_bg
        from app.models.content import ContentItem, ContentType

        cluster = {"cluster_name": "TMS Local", "keywords": ["tms near me"]}
        await _generate_google_copy_bg(
            created_company.id, _company_data(), cluster, db
        )

        item = db.query(ContentItem).filter(
            ContentItem.company_id == created_company.id,
            ContentItem.content_type == ContentType.ad_copy_google,
            ContentItem.title.contains("TMS Local"),
        ).first()
        assert item is not None

    @pytest.mark.asyncio
    async def test_generate_all_google_bg(self, created_company, db, mock_llm):
        from app.api.modules.paid_ads import _generate_all_google_bg
        from app.models.content import ContentItem, ContentType

        await _generate_all_google_bg(created_company.id, _company_data(), db)

        items = db.query(ContentItem).filter(
            ContentItem.company_id == created_company.id,
            ContentItem.content_type == ContentType.ad_copy_google,
        ).all()
        assert len(items) >= 1

    @pytest.mark.asyncio
    async def test_generate_meta_copy_bg(self, created_company, db, mock_llm):
        from app.api.modules.paid_ads import _generate_meta_copy_bg
        from app.models.content import ContentItem, ContentType

        audience = {"name": "Depression Seekers", "age": "25-54"}
        await _generate_meta_copy_bg(
            created_company.id, _company_data(), audience, db
        )

        item = db.query(ContentItem).filter(
            ContentItem.company_id == created_company.id,
            ContentItem.content_type == ContentType.ad_copy_meta,
        ).first()
        assert item is not None

    def test_generate_meta_ad_copy_endpoint(self, client, created_company, mock_llm):
        resp = client.post(
            f"/api/v1/paid-ads/{created_company.id}/meta/generate-ad-copy",
            json={"audience": {"name": "TMS Patients", "age": "25-54"}},
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "generating"

    def test_budget_recommendations_multi_location(self, client, db, created_company):
        from app.models.company import Company
        company = db.query(Company).filter(Company.id == created_company.id).first()
        company.locations = [
            {"city": "Phoenix", "state": "AZ"},
            {"city": "Scottsdale", "state": "AZ"},
        ]
        db.commit()

        resp = client.get(f"/api/v1/paid-ads/{created_company.id}/budget-recommendations")
        assert resp.status_code == 200
        data = resp.json()
        assert data["rationale"] == "Multi-location practice"
        assert data["google_ads"]["recommended_min"] == 4000

    def test_budget_recommendations_large_network(self, client, db, created_company):
        from app.models.company import Company
        company = db.query(Company).filter(Company.id == created_company.id).first()
        company.locations = [
            {"city": "City A"},
            {"city": "City B"},
            {"city": "City C"},
            {"city": "City D"},
        ]
        db.commit()

        resp = client.get(f"/api/v1/paid-ads/{created_company.id}/budget-recommendations")
        assert resp.status_code == 200
        data = resp.json()
        assert data["rationale"] == "Large multi-location network"
        assert data["google_ads"]["recommended_min"] == 6000

    def test_paid_ads_company_not_found(self, client):
        import uuid
        resp = client.get(f"/api/v1/paid-ads/{uuid.uuid4()}/budget-recommendations")
        assert resp.status_code == 404


# ══════════════════════════════════════════════════════════════════════════════
# Referral module background tasks
# ══════════════════════════════════════════════════════════════════════════════

class TestReferralBgTasks:

    @pytest.mark.asyncio
    async def test_generate_leads_bg_deduplicates(self, created_company, db, mock_llm):
        from app.api.modules.referral import _generate_leads_bg
        from app.models.referral import ReferralLead

        mock_leads = [
            {"npi": "1234567890", "first_name": "John", "last_name": "Smith",
             "specialty": "Psychiatry", "city": "Phoenix", "state": "AZ"},
        ]

        with patch("app.api.modules.referral.generate_lead_list_for_company",
                   new=AsyncMock(return_value=mock_leads)):
            await _generate_leads_bg(created_company.id, _company_data(), db)
            # Call again — should not create duplicate
            await _generate_leads_bg(created_company.id, _company_data(), db)

        leads = db.query(ReferralLead).filter(
            ReferralLead.company_id == created_company.id,
            ReferralLead.npi == "1234567890",
        ).all()
        assert len(leads) == 1  # deduplicated

    @pytest.mark.asyncio
    async def test_generate_fax_sheet_bg(self, created_company, db, mock_llm):
        from app.api.modules.referral import _generate_fax_sheet_bg
        from app.models.content import ContentItem, ContentType

        await _generate_fax_sheet_bg(
            created_company.id, _company_data(), "psychiatry", db
        )

        item = db.query(ContentItem).filter(
            ContentItem.company_id == created_company.id,
            ContentItem.content_type == ContentType.fax_sheet,
        ).first()
        assert item is not None

    @pytest.mark.asyncio
    async def test_generate_voicemail_bg(self, created_company, db, mock_llm):
        from app.api.modules.referral import _generate_voicemail_bg
        from app.models.content import ContentItem, ContentType

        await _generate_voicemail_bg(
            created_company.id, _company_data(), "psychiatry", db
        )

        items = db.query(ContentItem).filter(
            ContentItem.company_id == created_company.id,
            ContentItem.content_type == ContentType.voicemail_script,
        ).all()
        assert len(items) >= 1

    @pytest.mark.asyncio
    async def test_generate_email_sequence_bg(self, created_company, db, mock_llm):
        from app.api.modules.referral import _generate_email_sequence_bg
        from app.models.content import ContentItem, ContentType

        await _generate_email_sequence_bg(
            created_company.id, _company_data(), "psychiatry", db
        )

        item = db.query(ContentItem).filter(
            ContentItem.company_id == created_company.id,
            ContentItem.content_type == ContentType.email_sequence,
        ).first()
        assert item is not None

    @pytest.mark.asyncio
    async def test_generate_postcard_bg(self, created_company, db, mock_llm):
        from app.api.modules.referral import _generate_postcard_bg
        from app.models.content import ContentItem, ContentType

        await _generate_postcard_bg(
            created_company.id, _company_data(), db
        )

        item = db.query(ContentItem).filter(
            ContentItem.company_id == created_company.id,
            ContentItem.content_type == ContentType.postcard,
        ).first()
        assert item is not None

    def test_suppress_lead(self, client, created_company, db):
        from app.models.referral import ReferralLead, LeadStatus

        lead = ReferralLead(
            company_id=created_company.id,
            npi="9999999991",
            first_name="Jane",
            last_name="Doe",
            specialty="Psychiatry",
            city="Phoenix",
            state="AZ",
        )
        db.add(lead)
        db.commit()
        db.refresh(lead)

        resp = client.post(
            f"/api/v1/referral/{created_company.id}/leads/{lead.id}/suppress",
            params={"channel": "fax"},
        )
        assert resp.status_code == 200
        assert resp.json()["suppressed"] is True


# ══════════════════════════════════════════════════════════════════════════════
# Profiles module background tasks
# ══════════════════════════════════════════════════════════════════════════════

class TestProfilesBgTasks:

    @pytest.mark.asyncio
    async def test_generate_profile_content_bg_creates_profile(self, created_company, db, mock_llm):
        from app.api.modules.profiles import _generate_profile_content_bg
        from app.models.seo import DirectoryProfile

        await _generate_profile_content_bg(
            created_company.id, _company_data(), "psychology_today", db
        )

        profile = db.query(DirectoryProfile).filter(
            DirectoryProfile.company_id == created_company.id,
            DirectoryProfile.platform == "psychology_today",
        ).first()
        assert profile is not None
        assert profile.description_short != ""
        assert profile.optimization_score is not None

    @pytest.mark.asyncio
    async def test_generate_profile_content_bg_updates_existing(self, created_company, db, mock_llm):
        from app.api.modules.profiles import _generate_profile_content_bg
        from app.models.seo import DirectoryProfile

        # First call — creates
        await _generate_profile_content_bg(
            created_company.id, _company_data(), "healthgrades", db
        )
        # Second call — updates
        await _generate_profile_content_bg(
            created_company.id, _company_data(), "healthgrades", db
        )

        profiles = db.query(DirectoryProfile).filter(
            DirectoryProfile.company_id == created_company.id,
            DirectoryProfile.platform == "healthgrades",
        ).all()
        assert len(profiles) == 1  # upserted, not duplicated

    @pytest.mark.asyncio
    async def test_auto_create_profile_bg_no_playwright(self, created_company, db, mock_llm):
        """When Playwright is not available (ImportError), status is set to needs_manual."""
        from app.api.modules.profiles import (
            _generate_profile_content_bg,
            _auto_create_profile_bg,
        )

        # First, create the profile content
        await _generate_profile_content_bg(
            created_company.id, _company_data(), "vitals", db
        )
        # Simulate Playwright not being installed — the function uses
        # `from app.services.playwright_automation import get_automator` inside
        # a try block. Setting the module to None in sys.modules makes that
        # import raise ImportError, which sets status to "needs_manual".
        import sys
        with patch.dict(sys.modules, {"app.services.playwright_automation": None}):
            await _auto_create_profile_bg(created_company.id, "vitals", db)

        from app.models.seo import DirectoryProfile
        profile = db.query(DirectoryProfile).filter(
            DirectoryProfile.company_id == created_company.id,
            DirectoryProfile.platform == "vitals",
        ).first()
        assert profile.auto_create_status == "needs_manual"

    def test_auto_create_profile_no_content_returns_400(self, client, created_company):
        resp = client.post(
            f"/api/v1/profiles/{created_company.id}/auto-create/psychology_today"
        )
        assert resp.status_code == 400

    def test_get_profile_404(self, client, created_company):
        resp = client.get(
            f"/api/v1/profiles/{created_company.id}/profiles/nonexistent_platform"
        )
        assert resp.status_code == 404

    def test_list_profiles_empty(self, client, created_company):
        resp = client.get(f"/api/v1/profiles/{created_company.id}/profiles")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_list_profiles_with_data(self, client, created_company, db, mock_llm):
        from app.models.seo import DirectoryProfile

        profile = DirectoryProfile(
            company_id=created_company.id,
            platform="google_business_profile",
        )
        db.add(profile)
        db.commit()

        resp = client.get(f"/api/v1/profiles/{created_company.id}/profiles")
        assert resp.status_code == 200
        assert len(resp.json()) == 1

    def test_save_directory_credentials(self, client, created_company, db, mock_llm):
        from app.models.seo import DirectoryProfile

        profile = DirectoryProfile(
            company_id=created_company.id,
            platform="healthgrades",
        )
        db.add(profile)
        db.commit()

        resp = client.post(
            f"/api/v1/profiles/{created_company.id}/profiles/healthgrades/credentials",
            json={"username": "user@test.com", "password": "secret123"},
        )
        assert resp.status_code == 200
        assert resp.json()["credentials_stored"] is True

    def test_profiles_company_not_found(self, client):
        import uuid
        resp = client.get(f"/api/v1/profiles/{uuid.uuid4()}/scorecard")
        assert resp.status_code == 404

    def test_compute_optimization_score_all_fields(self):
        from app.api.modules.profiles import _compute_optimization_score

        full = {
            "practice_description_500": "long desc",
            "practice_description_150": "medium desc",
            "provider_bios": [{"bio": "..."}],
            "services": ["TMS"],
            "insurance": ["Aetna"],
            "faq": [{"q": "?", "a": "!"}],
            "conditions": ["Depression"],
        }
        score = _compute_optimization_score(full)
        assert score == 100

    def test_compute_optimization_score_empty(self):
        from app.api.modules.profiles import _compute_optimization_score
        assert _compute_optimization_score({}) == 0


# ══════════════════════════════════════════════════════════════════════════════
# SEO module background tasks
# ══════════════════════════════════════════════════════════════════════════════

class TestSEOBgTasks:

    @pytest.mark.asyncio
    async def test_basic_crawl_parses_html(self):
        from app.api.modules.seo import _basic_crawl

        html = """<html><head>
            <title>TMS Therapy Phoenix</title>
            <meta name="description" content="Leading TMS clinic in Phoenix.">
            <link rel="canonical" href="https://example.com">
        </head><body><h1>TMS Therapy Phoenix</h1></body></html>"""

        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_resp = MagicMock()
            mock_resp.status_code = 200
            mock_resp.text = html
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client.get = AsyncMock(return_value=mock_resp)
            mock_client_cls.return_value = mock_client

            result = await _basic_crawl("https://example.com")

        assert len(result["pages"]) == 1
        assert result["pages"][0]["title"] == "TMS Therapy Phoenix"
        assert result["pages"][0]["h1_count"] == 1
        assert result["pages"][0]["canonical"] == "https://example.com"
        assert result["meta_issues"] == []

    @pytest.mark.asyncio
    async def test_basic_crawl_detects_missing_title(self):
        from app.api.modules.seo import _basic_crawl

        html = "<html><head></head><body><p>No title here</p></body></html>"
        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_resp = MagicMock()
            mock_resp.status_code = 200
            mock_resp.text = html
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client.get = AsyncMock(return_value=mock_resp)
            mock_client_cls.return_value = mock_client

            result = await _basic_crawl("https://example.com")

        issues = [i["issue"] for i in result["meta_issues"]]
        assert "missing_title" in issues
        assert "missing_meta_description" in issues
        assert "missing_h1" in issues

    @pytest.mark.asyncio
    async def test_basic_crawl_detects_long_title(self):
        from app.api.modules.seo import _basic_crawl

        long_title = "A" * 65
        html = f"<html><head><title>{long_title}</title><meta name='description' content='ok'></head><body><h1>H1</h1></body></html>"
        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_resp = MagicMock()
            mock_resp.status_code = 200
            mock_resp.text = html
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client.get = AsyncMock(return_value=mock_resp)
            mock_client_cls.return_value = mock_client

            result = await _basic_crawl("https://example.com")

        issues = [i["issue"] for i in result["meta_issues"]]
        assert "title_too_long" in issues

    @pytest.mark.asyncio
    async def test_basic_crawl_detects_multiple_h1s(self):
        from app.api.modules.seo import _basic_crawl

        html = "<html><head><title>OK</title><meta name='description' content='OK'></head><body><h1>H1</h1><h1>H1 again</h1></body></html>"
        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_resp = MagicMock()
            mock_resp.status_code = 200
            mock_resp.text = html
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client.get = AsyncMock(return_value=mock_resp)
            mock_client_cls.return_value = mock_client

            result = await _basic_crawl("https://example.com")

        issues = [i["issue"] for i in result["meta_issues"]]
        assert "multiple_h1s" in issues

    @pytest.mark.asyncio
    async def test_basic_crawl_handles_network_error(self):
        from app.api.modules.seo import _basic_crawl

        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client.get = AsyncMock(side_effect=Exception("Connection refused"))
            mock_client_cls.return_value = mock_client

            result = await _basic_crawl("https://example.com")

        assert len(result["errors"]) == 1
        assert "Connection refused" in result["errors"][0]["error"]

    @pytest.mark.asyncio
    async def test_run_pagespeed_parses_response(self):
        from app.api.modules.seo import _run_pagespeed

        mock_data = {
            "lighthouseResult": {
                "categories": {
                    "performance": {"score": 0.85},
                    "seo": {"score": 0.92},
                    "accessibility": {"score": 0.78},
                },
                "audits": {
                    "largest-contentful-paint": {"displayValue": "2.1 s"},
                    "cumulative-layout-shift": {"displayValue": "0.05"},
                    "total-blocking-time": {"displayValue": "120 ms"},
                },
            }
        }

        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_resp = MagicMock()
            mock_resp.json = MagicMock(return_value=mock_data)
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client.get = AsyncMock(return_value=mock_resp)
            mock_client_cls.return_value = mock_client

            result = await _run_pagespeed("https://example.com")

        assert result["mobile"]["score"] == 85
        assert result["desktop"]["score"] == 85
        assert result["mobile"]["lcp"] == "2.1 s"
        assert "core_web_vitals" in result

    @pytest.mark.asyncio
    async def test_run_pagespeed_handles_error(self):
        from app.api.modules.seo import _run_pagespeed

        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client.get = AsyncMock(side_effect=Exception("timeout"))
            mock_client_cls.return_value = mock_client

            result = await _run_pagespeed("https://example.com")

        assert "error" in result.get("mobile", {})
        assert result["mobile"]["score"] is None

    @pytest.mark.asyncio
    async def test_run_full_audit_bg(self, created_company, db, mock_llm):
        from app.api.modules.seo import _run_full_audit
        from app.models.seo import SEOReport

        with patch("app.api.modules.seo._run_pagespeed", new=AsyncMock(return_value={
            "mobile": {"score": 75, "lcp": "2.5s", "cls": "0.05", "fid": "100ms"},
            "desktop": {"score": 90},
            "core_web_vitals": {"lcp": "2.5s", "cls": "0.05", "fid": "100ms"},
        })):
            with patch("app.api.modules.seo._basic_crawl", new=AsyncMock(return_value={
                "pages": [], "errors": [], "meta_issues": []
            })):
                await _run_full_audit(
                    created_company.id,
                    "https://novamindmentalhealth.com",
                    _company_data(),
                    db,
                )

        report = db.query(SEOReport).filter(
            SEOReport.company_id == created_company.id
        ).first()
        assert report is not None
        assert report.pagespeed_mobile == 75
        assert report.report_type == "full_audit"

    def test_seo_run_pagespeed_endpoint(self, client, created_company, mock_llm):
        with patch("app.api.modules.seo._run_pagespeed", new=AsyncMock(return_value={
            "mobile": {"score": 80},
            "desktop": {"score": 95},
            "core_web_vitals": {},
        })):
            resp = client.post(f"/api/v1/seo/{created_company.id}/pagespeed")
        assert resp.status_code == 200

    def test_seo_latest_report_not_found(self, client):
        import uuid
        resp = client.get(f"/api/v1/seo/{uuid.uuid4()}/reports/latest")
        assert resp.status_code == 404


# ══════════════════════════════════════════════════════════════════════════════
# Companies — _run_ingestion background task & _compute_health
# ══════════════════════════════════════════════════════════════════════════════

class TestCompaniesBgTasks:

    @pytest.mark.asyncio
    async def test_run_ingestion_success(self, created_company, db):
        from app.api.companies import _run_ingestion
        from app.models.company import CompanyStatus

        mock_data = {
            "company_name": "New Name",
            "slug": "new-name",
            "specialty_niche": "TMS",
            "services": [{"name": "TMS Therapy"}],
            "providers": [],
            "locations": [],
            "insurance_accepted": [],
            "differentiators": [],
            "target_demographics": [],
            "brand_guidelines": {},
        }

        # _run_ingestion owns its own DB session via SessionLocal().
        # Patch it so the task uses the test session without closing it.
        mock_session = MagicMock(wraps=db)
        mock_session.close = MagicMock()

        with patch("app.services.ingestion.ingest_company", new=AsyncMock(return_value=mock_data)):
            with patch("app.api.companies.SessionLocal", return_value=mock_session):
                await _run_ingestion(created_company.id, "https://example.com")

        db.refresh(created_company)
        assert created_company.name == "New Name"
        assert created_company.status == CompanyStatus.active

    @pytest.mark.asyncio
    async def test_run_ingestion_failure(self, created_company, db):
        from app.api.companies import _run_ingestion
        from app.models.company import CompanyStatus

        mock_session = MagicMock(wraps=db)
        mock_session.close = MagicMock()

        with patch("app.services.ingestion.ingest_company", new=AsyncMock(side_effect=Exception("scrape failed"))):
            with patch("app.api.companies.SessionLocal", return_value=mock_session):
                await _run_ingestion(created_company.id, "https://example.com")

        db.refresh(created_company)
        assert created_company.status == CompanyStatus.onboarding

    @pytest.mark.asyncio
    async def test_run_ingestion_company_not_found(self, db):
        from app.api.companies import _run_ingestion
        import uuid

        mock_session = MagicMock(wraps=db)
        mock_session.close = MagicMock()

        mock_data = {"company_name": "X"}
        with patch("app.services.ingestion.ingest_company", new=AsyncMock(return_value=mock_data)):
            with patch("app.api.companies.SessionLocal", return_value=mock_session):
                # Should return without error when company ID doesn't exist
                await _run_ingestion(str(uuid.uuid4()), "https://example.com")

    def test_compute_health_ingesting(self):
        from app.api.companies import _compute_health

        company = MagicMock()
        company.status = "ingesting"
        assert _compute_health(company, 0, 0) == "yellow"

    def test_compute_health_no_campaigns(self):
        from app.api.companies import _compute_health

        company = MagicMock()
        company.status = "active"
        assert _compute_health(company, 0, 0) == "red"

    def test_compute_health_many_approvals(self):
        from app.api.companies import _compute_health

        company = MagicMock()
        company.status = "active"
        assert _compute_health(company, 5, 25) == "yellow"

    def test_compute_health_green(self):
        from app.api.companies import _compute_health

        company = MagicMock()
        company.status = "active"
        assert _compute_health(company, 3, 2) == "green"


# ══════════════════════════════════════════════════════════════════════════════
# Coverage gap tests — company-not-found 404s, filter branches, CSV upload
# ══════════════════════════════════════════════════════════════════════════════

class TestCoverageGaps:
    """Targeted tests for specific uncovered lines."""

    # ── content.py:233 ──────────────────────────────────────────────────────

    def test_content_company_not_found(self, client):
        import uuid
        resp = client.post(
            f"/api/v1/content/{uuid.uuid4()}/generate/blog-post",
            json={"keyword": "tms therapy"},
        )
        assert resp.status_code == 404

    # ── referral.py:53 (specialty filter) ───────────────────────────────────

    def test_list_leads_with_specialty_filter(self, client, created_company, db):
        from app.models.referral import ReferralLead
        lead = ReferralLead(
            company_id=created_company.id,
            npi="8888888881",
            first_name="Alice",
            last_name="Smith",
            specialty="Psychiatry",
            city="Phoenix",
            state="AZ",
        )
        db.add(lead)
        db.commit()

        resp = client.get(
            f"/api/v1/referral/{created_company.id}/leads",
            params={"specialty": "psychiatry"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert any("Psychiatry" in l["specialty"] for l in data["leads"])

    # ── referral.py:109-110 (CSV upload error path in except) ────────────────

    def test_upload_leads_csv_error_row(self, client, created_company):
        """Trigger exception in CSV row processing to cover lines 109-110."""
        import io
        from unittest.mock import patch
        # Valid CSV but we'll make db.add raise to trigger the except block
        csv_content = (
            "npi,first_name,last_name,specialty,practice_name,fax,phone,email,"
            "address,city,state,zip\n"
            "BAD_NPI,John,Doe,Psychiatry,Doe Clinic,,,,,Phoenix,AZ,85001\n"
        )
        with patch("app.api.modules.referral.ReferralLead", side_effect=ValueError("bad data")):
            resp = client.post(
                f"/api/v1/referral/{created_company.id}/leads/upload",
                files={"file": ("leads.csv", io.BytesIO(csv_content.encode()), "text/csv")},
            )
        assert resp.status_code == 200
        data = resp.json()
        assert data["created"] == 0
        assert len(data["errors"]) >= 1

    # ── referral.py:397 (_get_company not found) ─────────────────────────────

    def test_referral_company_not_found(self, client):
        import uuid, io
        csv_content = "npi,first_name,last_name\n1234,John,Doe\n"
        resp = client.post(
            f"/api/v1/referral/{uuid.uuid4()}/leads/upload",
            files={"file": ("leads.csv", io.BytesIO(csv_content.encode()), "text/csv")},
        )
        assert resp.status_code == 404

    # ── referral.py:448 (_touchpoint_to_dict) ───────────────────────────────

    def test_touchpoint_dict_via_get_lead(self, client, created_company, db):
        from app.models.referral import ReferralLead, Touchpoint
        lead = ReferralLead(
            company_id=created_company.id,
            npi="7777777771",
            first_name="Bob",
            last_name="Jones",
            specialty="Family Medicine",
            city="Tempe",
            state="AZ",
        )
        db.add(lead)
        db.commit()
        db.refresh(lead)

        tp = Touchpoint(
            company_id=created_company.id,
            lead_id=lead.id,
            channel="email",
            direction="outbound",
            status="sent",
        )
        db.add(tp)
        db.commit()

        # Touchpoints are embedded in the GET lead response
        resp = client.get(
            f"/api/v1/referral/{created_company.id}/leads/{lead.id}"
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "touchpoints" in data
        assert len(data["touchpoints"]) >= 1
        assert data["touchpoints"][0]["channel"] == "email"

    # ── seo.py:75 (recommendations not found) ───────────────────────────────

    def test_seo_recommendations_not_found(self, client, created_company):
        resp = client.get(
            f"/api/v1/seo/{created_company.id}/recommendations"
        )
        assert resp.status_code == 404

    # ── seo.py:124 (pagespeed with API key) ─────────────────────────────────

    def test_pagespeed_with_api_key(self, client, created_company):
        from unittest.mock import patch, AsyncMock, MagicMock
        mock_resp = MagicMock()
        mock_resp.json.return_value = {
            "lighthouseResult": {
                "categories": {
                    "performance": {"score": 0.9},
                    "accessibility": {"score": 0.85},
                    "best-practices": {"score": 0.95},
                    "seo": {"score": 0.88},
                },
                "audits": {},
            },
            "loadingExperience": {"overall_category": "FAST"},
        }

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.get = AsyncMock(return_value=mock_resp)

        with patch("app.api.modules.seo.httpx.AsyncClient", return_value=mock_client):
            with patch("app.core.config.settings") as mock_settings:
                mock_settings.GOOGLE_PAGESPEED_API_KEY = "fake-api-key"
                resp = client.post(
                    f"/api/v1/seo/{created_company.id}/pagespeed"
                )
        assert resp.status_code == 200

    # ── seo.py:201 (_get_company not found) ─────────────────────────────────

    def test_seo_company_not_found(self, client):
        import uuid
        resp = client.post(f"/api/v1/seo/{uuid.uuid4()}/audit")
        assert resp.status_code == 404

    # ── profiles.py:116-120 (auto_create happy path) ─────────────────────────

    def test_auto_create_profile_happy_path(self, client, created_company, db):
        from app.models.seo import DirectoryProfile

        profile = DirectoryProfile(
            company_id=created_company.id,
            platform="psychology_today",
            description_short="Short desc",
            description_medium="Medium description with enough content for auto-create",
        )
        db.add(profile)
        db.commit()

        resp = client.post(
            f"/api/v1/profiles/{created_company.id}/auto-create/psychology_today"
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "in_progress"

    # ── profiles.py:138-139 (get_profile: not found + found) ────────────────

    def test_get_profile_not_found(self, client, created_company):
        resp = client.get(
            f"/api/v1/profiles/{created_company.id}/profiles/nonexistent_platform"
        )
        assert resp.status_code == 404

    def test_get_profile_success(self, client, created_company, db):
        from app.models.seo import DirectoryProfile
        profile = DirectoryProfile(
            company_id=created_company.id,
            platform="healthgrades",
            description_short="Short",
            description_medium="Medium",
        )
        db.add(profile)
        db.commit()

        resp = client.get(
            f"/api/v1/profiles/{created_company.id}/profiles/healthgrades"
        )
        assert resp.status_code == 200
        assert resp.json()["platform"] == "healthgrades"

    # ── profiles.py:224 (_auto_create_profile_bg profile not found) ──────────

    @pytest.mark.asyncio
    async def test_auto_create_profile_bg_profile_not_found(self, created_company, db, mock_llm):
        from app.api.modules.profiles import _auto_create_profile_bg
        # Call with a platform that has no profile — should return silently
        await _auto_create_profile_bg(created_company.id, "nonexistent_platform", db)
        # No exception = pass

    # ── ingestion.py:23 (ValueError when scrape returns no HTML) ─────────────

    @pytest.mark.asyncio
    async def test_ingestion_raises_on_empty_html(self):
        from app.services.ingestion import ingest_company
        from app.services.scraper import WebScraper
        from unittest.mock import patch, AsyncMock

        empty_result = {"raw_html": "", "error": "timeout", "structured_data": [], "brand_hints": {}}
        with patch.object(WebScraper, "scrape_website", new=AsyncMock(return_value=empty_result)):
            with pytest.raises(ValueError, match="Failed to scrape"):
                await ingest_company("https://example.com")

    # ── workers/tasks.py:107 (enrollment.status = "completed") ───────────────

    def test_process_campaign_enrollments_completes_long_running(self):
        from app.workers.tasks import process_campaign_enrollments

        mock_enrollment = MagicMock()
        mock_enrollment.current_step = 7  # >= 8 after += 1
        mock_enrollment.status = "active"

        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.all.return_value = [mock_enrollment]

        with patch("app.db.database.SessionLocal", return_value=mock_db):
            process_campaign_enrollments()

        assert mock_enrollment.status == "completed"
        mock_db.commit.assert_called_once()
