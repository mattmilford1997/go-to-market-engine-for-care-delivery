"""Integration tests for content, paid_ads, seo, and profiles API routes."""
import uuid
import pytest
from unittest.mock import patch, AsyncMock
from app.models.content import ContentItem, ContentType, ContentStatus
from app.models.seo import SEOReport, DirectoryProfile


# ── Content Engine ────────────────────────────────────────────────────────────

class TestContentAPI:
    def test_list_items_empty(self, client, created_company):
        resp = client.get(f"/api/v1/content/{created_company.id}/items")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 0
        assert data["items"] == []

    def test_list_items_with_type_filter(self, client, created_company, db):
        for ct in [ContentType.blog_post, ContentType.social_facebook, ContentType.social_instagram]:
            db.add(ContentItem(
                company_id=created_company.id,
                content_type=ct,
                title=f"Test {ct.value}",
                status=ContentStatus.pending_review,
            ))
        db.commit()

        resp = client.get(f"/api/v1/content/{created_company.id}/items?content_type=blog_post")
        assert resp.status_code == 200
        items = resp.json()["items"]
        assert all(i["content_type"] == "blog_post" for i in items)

    def test_list_items_with_status_filter(self, client, created_company, db):
        db.add(ContentItem(
            company_id=created_company.id,
            content_type=ContentType.blog_post,
            title="Approved Post",
            status=ContentStatus.approved,
        ))
        db.add(ContentItem(
            company_id=created_company.id,
            content_type=ContentType.blog_post,
            title="Pending Post",
            status=ContentStatus.pending_review,
        ))
        db.commit()

        resp = client.get(f"/api/v1/content/{created_company.id}/items?status=approved")
        items = resp.json()["items"]
        assert all(i["status"] == "approved" for i in items)

    def test_get_content_item(self, client, created_company, db):
        item = ContentItem(
            company_id=created_company.id,
            content_type=ContentType.blog_post,
            title="Specific Post",
            body="Post body content",
            target_keyword="tms therapy phoenix",
        )
        db.add(item)
        db.commit()
        db.refresh(item)

        resp = client.get(f"/api/v1/content/{created_company.id}/items/{item.id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["title"] == "Specific Post"
        assert data["target_keyword"] == "tms therapy phoenix"

    def test_get_nonexistent_item_404(self, client, created_company):
        resp = client.get(f"/api/v1/content/{created_company.id}/items/{uuid.uuid4()}")
        assert resp.status_code == 404

    def test_update_content_item(self, client, created_company, db):
        item = ContentItem(
            company_id=created_company.id,
            content_type=ContentType.blog_post,
            title="Original Title",
        )
        db.add(item)
        db.commit()
        db.refresh(item)

        resp = client.patch(
            f"/api/v1/content/{created_company.id}/items/{item.id}",
            json={"title": "Updated Title", "target_keyword": "new keyword"}
        )
        assert resp.status_code == 200
        assert resp.json()["title"] == "Updated Title"

    def test_generate_blog_post(self, client, created_company, mock_llm):
        with patch("app.api.modules.content._generate_blog_post_bg", new_callable=AsyncMock):
            resp = client.post(
                f"/api/v1/content/{created_company.id}/generate/blog-post",
                json={"keyword": "TMS therapy insurance coverage", "word_count": 1500}
            )
        assert resp.status_code == 200
        assert resp.json()["status"] == "generating"

    def test_generate_social_posts_single_platform(self, client, created_company, mock_llm):
        with patch("app.api.modules.content._generate_social_bg", new_callable=AsyncMock):
            resp = client.post(
                f"/api/v1/content/{created_company.id}/generate/social-posts",
                json={"platform": "instagram", "count": 5}
            )
        assert resp.status_code == 200
        assert resp.json()["platforms"] == ["instagram"]

    def test_generate_social_posts_all_platforms(self, client, created_company, mock_llm):
        with patch("app.api.modules.content._generate_social_bg", new_callable=AsyncMock):
            resp = client.post(
                f"/api/v1/content/{created_company.id}/generate/social-posts",
                json={"platform": "all", "count": 3}
            )
        assert resp.status_code == 200
        platforms = resp.json()["platforms"]
        assert "facebook" in platforms
        assert "instagram" in platforms
        assert "linkedin" in platforms

    def test_generate_full_calendar(self, client, created_company, mock_llm):
        with patch("app.api.modules.content._generate_calendar_bg", new_callable=AsyncMock):
            resp = client.post(f"/api/v1/content/{created_company.id}/generate/full-calendar")
        assert resp.status_code == 200

    def test_calendar_returns_generating_when_no_content(self, client, created_company):
        with patch("app.api.modules.content._generate_calendar_bg", new_callable=AsyncMock):
            resp = client.get(f"/api/v1/content/{created_company.id}/calendar")
        assert resp.status_code == 200
        assert resp.json()["status"] == "generating"


# ── Paid Ads ──────────────────────────────────────────────────────────────────

class TestPaidAdsAPI:
    def test_generate_keywords(self, client, created_company, mock_llm):
        with patch("app.api.modules.paid_ads._generate_keyword_clusters_bg", new_callable=AsyncMock):
            resp = client.post(f"/api/v1/paid-ads/{created_company.id}/google/generate-keywords")
        assert resp.status_code == 200
        assert resp.json()["status"] == "generating"

    def test_generate_google_ad_copy_requires_cluster(self, client, created_company):
        resp = client.post(
            f"/api/v1/paid-ads/{created_company.id}/google/generate-ad-copy",
            json={}
        )
        assert resp.status_code == 400

    def test_generate_google_ad_copy_with_cluster(self, client, created_company, mock_llm):
        with patch("app.api.modules.paid_ads._generate_google_copy_bg", new_callable=AsyncMock):
            resp = client.post(
                f"/api/v1/paid-ads/{created_company.id}/google/generate-ad-copy",
                json={"cluster": {"cluster_name": "TMS Local", "keywords": ["tms therapy near me"]}}
            )
        assert resp.status_code == 200

    def test_generate_all_google(self, client, created_company, mock_llm):
        with patch("app.api.modules.paid_ads._generate_all_google_bg", new_callable=AsyncMock):
            resp = client.post(f"/api/v1/paid-ads/{created_company.id}/google/generate-all")
        assert resp.status_code == 200

    def test_get_meta_audiences(self, client, created_company):
        resp = client.get(f"/api/v1/paid-ads/{created_company.id}/meta/audiences")
        assert resp.status_code == 200
        data = resp.json()
        assert "audiences" in data
        assert len(data["audiences"]) >= 3
        for audience in data["audiences"]:
            assert "name" in audience
            assert "geo" in audience

    def test_generate_meta_ads_all_audiences(self, client, created_company, mock_llm):
        with patch("app.api.modules.paid_ads._generate_meta_copy_bg", new_callable=AsyncMock):
            resp = client.post(f"/api/v1/paid-ads/{created_company.id}/meta/generate-all")
        assert resp.status_code == 200
        assert "audience_count" in resp.json()

    def test_budget_recommendations_single_location(self, client, created_company):
        resp = client.get(f"/api/v1/paid-ads/{created_company.id}/budget-recommendations")
        assert resp.status_code == 200
        data = resp.json()
        assert "google_ads" in data
        assert "meta_ads" in data
        assert data["google_ads"]["allocation_pct"] == 65
        assert data["meta_ads"]["allocation_pct"] == 35
        assert data["google_ads"]["recommended_min"] > 0

    def test_budget_recommendations_includes_current_budget(self, client, created_company):
        resp = client.get(f"/api/v1/paid-ads/{created_company.id}/budget-recommendations")
        data = resp.json()
        assert "current_budget" in data["google_ads"]
        assert data["google_ads"]["current_budget"] == created_company.budget_google_ads


# ── SEO ────────────────────────────────────────────────────────────────────────

class TestSEOAPI:
    def test_run_audit_starts_background_task(self, client, created_company):
        with patch("app.api.modules.seo._run_full_audit", new_callable=AsyncMock):
            resp = client.post(f"/api/v1/seo/{created_company.id}/audit")
        assert resp.status_code == 200
        assert resp.json()["status"] == "running"

    def test_list_reports_empty(self, client, created_company):
        resp = client.get(f"/api/v1/seo/{created_company.id}/reports")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_latest_report_404_when_none(self, client, created_company):
        resp = client.get(f"/api/v1/seo/{created_company.id}/reports/latest")
        assert resp.status_code == 404

    def test_list_reports_after_creation(self, client, created_company, db):
        report = SEOReport(
            company_id=created_company.id,
            report_type="technical_audit",
            pagespeed_mobile=75,
            pagespeed_desktop=88,
        )
        db.add(report)
        db.commit()

        resp = client.get(f"/api/v1/seo/{created_company.id}/reports")
        assert resp.status_code == 200
        assert len(resp.json()) == 1

    def test_latest_report_returns_most_recent(self, client, created_company, db):
        from datetime import datetime, timedelta
        base_time = datetime(2026, 1, 1, 0, 0, 0)
        for i, score in enumerate([60, 75, 90]):
            report = SEOReport(
                company_id=created_company.id,
                report_type="technical_audit",
                pagespeed_mobile=score,
            )
            report.created_at = base_time + timedelta(seconds=i)
            db.add(report)
        db.commit()

        resp = client.get(f"/api/v1/seo/{created_company.id}/reports/latest")
        assert resp.status_code == 200
        # Should return the most recently created (score=90)
        assert resp.json()["pagespeed_mobile"] == 90

    def test_get_keywords_404_when_no_report(self, client, created_company):
        resp = client.get(f"/api/v1/seo/{created_company.id}/keywords")
        assert resp.status_code == 404

    def test_get_keywords_returns_data(self, client, created_company, db):
        db.add(SEOReport(
            company_id=created_company.id,
            report_type="keyword_gap",
            ranking_keywords=[{"keyword": "tms therapy", "position": 8}],
            keyword_opportunities=[{"keyword": "tms therapy phoenix", "volume_est": "high"}],
        ))
        db.commit()

        resp = client.get(f"/api/v1/seo/{created_company.id}/keywords")
        assert resp.status_code == 200
        data = resp.json()
        assert "ranking_keywords" in data
        assert "opportunities" in data

    def test_get_recommendations(self, client, created_company, db):
        db.add(SEOReport(
            company_id=created_company.id,
            report_type="technical_audit",
            recommendations=[{"action": "Add meta descriptions", "priority": "high"}],
        ))
        db.commit()

        resp = client.get(f"/api/v1/seo/{created_company.id}/recommendations")
        assert resp.status_code == 200
        assert "recommendations" in resp.json()

    def test_pagespeed_endpoint(self, client, created_company):
        mock_result = {
            "mobile": {"score": 72, "seo_score": 85},
            "desktop": {"score": 89, "seo_score": 92},
            "core_web_vitals": {"lcp": "2.1s", "cls": "0.05"},
        }
        with patch("app.api.modules.seo._run_pagespeed", new_callable=AsyncMock, return_value=mock_result):
            resp = client.post(f"/api/v1/seo/{created_company.id}/pagespeed")
        assert resp.status_code == 200


# ── Directory Profiles ────────────────────────────────────────────────────────

class TestProfilesAPI:
    def test_list_platforms(self, client):
        resp = client.get("/api/v1/profiles/platforms")
        assert resp.status_code == 200
        data = resp.json()
        assert "platforms" in data
        platforms = data["platforms"]
        assert len(platforms) >= 9
        platform_ids = [p["id"] for p in platforms]
        assert "google_business_profile" in platform_ids
        assert "psychology_today" in platform_ids
        assert "healthgrades" in platform_ids

    def test_scorecard_empty(self, client, created_company):
        resp = client.get(f"/api/v1/profiles/{created_company.id}/scorecard")
        assert resp.status_code == 200
        data = resp.json()
        assert "overall_score" in data
        assert "claimed_profiles" in data
        assert "total_platforms" in data
        assert "platforms" in data
        assert data["claimed_profiles"] == 0

    def test_scorecard_shows_all_platforms(self, client, created_company):
        resp = client.get(f"/api/v1/profiles/{created_company.id}/scorecard")
        data = resp.json()
        assert data["total_platforms"] == 9

    def test_generate_profile_content(self, client, created_company, mock_llm):
        with patch("app.api.modules.profiles._generate_profile_content_bg", new_callable=AsyncMock):
            resp = client.post(
                f"/api/v1/profiles/{created_company.id}/generate-content",
                json={"platform": "psychology_today"}
            )
        assert resp.status_code == 200
        assert resp.json()["status"] == "generating"
        assert "psychology_today" in resp.json()["platforms"]

    def test_generate_all_profiles(self, client, created_company, mock_llm):
        with patch("app.api.modules.profiles._generate_profile_content_bg", new_callable=AsyncMock):
            resp = client.post(
                f"/api/v1/profiles/{created_company.id}/generate-content",
                json={"platform": "all"}
            )
        assert resp.status_code == 200
        assert len(resp.json()["platforms"]) == 9

    def test_list_profiles_empty(self, client, created_company):
        resp = client.get(f"/api/v1/profiles/{created_company.id}/profiles")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_get_profile_404_when_missing(self, client, created_company):
        resp = client.get(f"/api/v1/profiles/{created_company.id}/profiles/psychology_today")
        assert resp.status_code == 404

    def test_save_directory_credentials(self, client, created_company, db):
        # Create a profile first
        db.add(DirectoryProfile(company_id=created_company.id, platform="psychology_today"))
        db.commit()

        resp = client.post(
            f"/api/v1/profiles/{created_company.id}/profiles/psychology_today/credentials",
            json={"username": "user@novamind.com", "password": "secure_pass"}
        )
        assert resp.status_code == 200
        assert resp.json()["credentials_stored"] is True
        assert resp.json()["platform"] == "psychology_today"

    def test_auto_create_requires_content(self, client, created_company):
        resp = client.post(
            f"/api/v1/profiles/{created_company.id}/auto-create/psychology_today"
        )
        assert resp.status_code == 400

    def test_profile_completeness_score_computed(self, client, created_company, db):
        db.add(DirectoryProfile(
            company_id=created_company.id,
            platform="healthgrades",
            description_short="Short",
            description_medium="Medium",
            description_long="Long",
            completeness_score=75,
        ))
        db.commit()

        resp = client.get(f"/api/v1/profiles/{created_company.id}/scorecard")
        hg = next(p for p in resp.json()["platforms"] if p["platform"] == "healthgrades")
        assert hg["completeness_score"] == 75


# ── Health check ──────────────────────────────────────────────────────────────

class TestHealthCheck:
    def test_health_endpoint(self, client):
        resp = client.get("/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"
        assert "version" in resp.json()

    def test_root_endpoint(self, client):
        resp = client.get("/")
        assert resp.status_code == 200
        data = resp.json()
        assert "docs" in data
        assert data["docs"] == "/api/docs"
