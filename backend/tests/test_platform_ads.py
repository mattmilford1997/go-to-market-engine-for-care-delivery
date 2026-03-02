"""
Tests for the 6 new ad platforms added in recent sprints:
reddit, microsoft, quora, tiktok, linkedin, pinterest.

Covers:
  - Each platform's endpoint returns 200 with {"status": "generating"}
  - _generate_platform_ads_bg creates individual ContentItem rows per ad
  - extra_data includes 'body' field for frontend preview compatibility
  - LLM failure produces a placeholder item (no crash, no empty response)
  - Unknown platform falls back to generic prompt without crashing
"""
import pytest
import uuid
from unittest.mock import patch, MagicMock


ALL_PLATFORMS = ["reddit", "microsoft", "quora", "tiktok", "linkedin", "pinterest"]


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
        "brand_guidelines": {"tone": "warm"},
    }


# ══════════════════════════════════════════════════════════════════════════════
# Endpoint smoke tests — all 6 platforms return 200 with status: generating
# ══════════════════════════════════════════════════════════════════════════════

class TestPlatformEndpoints:

    @pytest.mark.parametrize("platform", ALL_PLATFORMS)
    def test_generate_platform_endpoint_returns_generating(
        self, client, created_company, mock_llm, platform
    ):
        resp = client.post(
            f"/api/v1/paid-ads/{created_company.id}/{platform}/generate-all"
        )
        assert resp.status_code == 200, f"Platform {platform} returned {resp.status_code}"
        data = resp.json()
        assert data["status"] == "generating"
        assert data["platform"] == platform

    @pytest.mark.parametrize("platform", ALL_PLATFORMS)
    def test_generate_platform_endpoint_company_not_found(self, client, platform):
        resp = client.post(
            f"/api/v1/paid-ads/{uuid.uuid4()}/{platform}/generate-all"
        )
        assert resp.status_code == 404, f"Expected 404 for unknown company on {platform}"


# ══════════════════════════════════════════════════════════════════════════════
# Background task — creates individual ContentItem per ad
# ══════════════════════════════════════════════════════════════════════════════

class TestPlatformAdsBgTask:

    @pytest.mark.asyncio
    @pytest.mark.parametrize("platform", ALL_PLATFORMS)
    async def test_platform_ads_bg_creates_content_items(
        self, created_company, db, mock_llm, platform
    ):
        from app.api.modules.paid_ads import _generate_platform_ads_bg
        from app.models.content import ContentItem

        await _generate_platform_ads_bg(
            created_company.id, _company_data(), platform, db
        )

        # Filter in Python (extra_data JSON subscript syntax is PostgreSQL-specific)
        all_items = db.query(ContentItem).filter(
            ContentItem.company_id == created_company.id,
        ).all()
        items = [i for i in all_items if (i.extra_data or {}).get("platform") == platform]

        assert len(items) >= 1, f"No ContentItems saved for platform={platform}"
        assert len(items) <= 5, f"Too many ContentItems for platform={platform} (max 5)"

    @pytest.mark.asyncio
    @pytest.mark.parametrize("platform", ALL_PLATFORMS)
    async def test_platform_ads_bg_body_field_always_set(
        self, created_company, db, mock_llm, platform
    ):
        """extra_data['body'] must always be set so the frontend preview works."""
        from app.api.modules.paid_ads import _generate_platform_ads_bg
        from app.models.content import ContentItem

        await _generate_platform_ads_bg(
            created_company.id, _company_data(), platform, db
        )

        all_items = db.query(ContentItem).filter(
            ContentItem.company_id == created_company.id,
        ).all()
        items = [i for i in all_items if (i.extra_data or {}).get("platform") == platform]

        assert len(items) >= 1, f"No items for platform={platform}"
        for item in items:
            assert item.extra_data is not None
            assert "body" in item.extra_data, (
                f"extra_data missing 'body' for platform={platform}: {item.extra_data}"
            )
            assert item.extra_data["body"], (
                f"extra_data['body'] is empty for platform={platform}"
            )

    @pytest.mark.asyncio
    @pytest.mark.parametrize("platform", ALL_PLATFORMS)
    async def test_platform_ads_bg_creates_approval_items(
        self, created_company, db, mock_llm, platform
    ):
        """Each ContentItem should have a corresponding ApprovalItem."""
        from app.api.modules.paid_ads import _generate_platform_ads_bg
        from app.models.content import ContentItem, ApprovalItem

        await _generate_platform_ads_bg(
            created_company.id, _company_data(), platform, db
        )

        all_items = db.query(ContentItem).filter(
            ContentItem.company_id == created_company.id,
        ).all()
        content_items = [i for i in all_items if (i.extra_data or {}).get("platform") == platform]
        content_ids = {str(ci.id) for ci in content_items}

        approval_items = db.query(ApprovalItem).filter(
            ApprovalItem.company_id == created_company.id,
            ApprovalItem.content_item_id.in_(content_ids),
        ).all()

        assert len(content_items) >= 1, f"No content items created for {platform}"
        assert len(approval_items) == len(content_items), (
            f"Expected {len(content_items)} approval items for {platform}, "
            f"got {len(approval_items)}"
        )

    @pytest.mark.asyncio
    async def test_platform_ads_bg_llm_failure_creates_placeholder(
        self, created_company, db
    ):
        """When LLM raises, a single placeholder ContentItem is created."""
        from app.api.modules.paid_ads import _generate_platform_ads_bg
        from app.models.content import ContentItem

        with patch(
            "app.api.modules.paid_ads.llm_service._chat_json",
            side_effect=RuntimeError("API key not configured"),
        ):
            # Should not raise
            await _generate_platform_ads_bg(
                created_company.id, _company_data(), "reddit", db
            )

        items = db.query(ContentItem).filter(
            ContentItem.company_id == created_company.id,
        ).all()

        assert len(items) >= 1, "Placeholder item not created after LLM failure"
        # The placeholder body should mention the platform or 'pending'
        assert any(
            "pending" in (i.extra_data or {}).get("body", "").lower()
            or "reddit" in (i.extra_data or {}).get("body", "").lower()
            for i in items
        )

    @pytest.mark.asyncio
    async def test_platform_ads_bg_unknown_platform_uses_fallback(
        self, created_company, db, mock_llm
    ):
        """An unknown platform should use the generic fallback prompt, not crash."""
        from app.api.modules.paid_ads import _generate_platform_ads_bg
        from app.models.content import ContentItem

        await _generate_platform_ads_bg(
            created_company.id, _company_data(), "snapchat", db
        )

        items = db.query(ContentItem).filter(
            ContentItem.company_id == created_company.id,
        ).all()
        assert len(items) >= 1, "Fallback platform produced no ContentItems"

    @pytest.mark.asyncio
    async def test_platform_ads_bg_max_five_items(self, created_company, db, mock_llm):
        """Even if LLM returns more than 5 ads, at most 5 ContentItems are saved."""
        from app.api.modules.paid_ads import _generate_platform_ads_bg
        from app.models.content import ContentItem

        many_ads = [
            {"title": f"Ad {i}", "body": f"Body {i}", "cta": "Click"}
            for i in range(1, 10)
        ]
        with patch(
            "app.api.modules.paid_ads.llm_service._chat_json",
            return_value={"ads": many_ads},
        ):
            await _generate_platform_ads_bg(
                created_company.id, _company_data(), "reddit", db
            )

        count = db.query(ContentItem).filter(
            ContentItem.company_id == created_company.id,
        ).count()
        assert count <= 5, f"Expected at most 5 ContentItems, got {count}"


# ══════════════════════════════════════════════════════════════════════════════
# Platform-specific body field extraction
# ══════════════════════════════════════════════════════════════════════════════

class TestPlatformBodyFieldExtraction:
    """Verify each platform extracts the correct primary body field."""

    @pytest.mark.asyncio
    async def test_reddit_uses_body_field(self, created_company, db):
        from app.api.modules.paid_ads import _generate_platform_ads_bg
        from app.models.content import ContentItem

        reddit_ad = {
            "title": "Reddit Thread Title",
            "body": "Long community-style body text",
            "cta": "Learn more in comments",
            "subreddit": "r/depression",
        }
        with patch(
            "app.api.modules.paid_ads.llm_service._chat_json",
            return_value={"ads": [reddit_ad]},
        ):
            await _generate_platform_ads_bg(
                created_company.id, _company_data(), "reddit", db
            )

        item = db.query(ContentItem).filter(
            ContentItem.company_id == created_company.id,
        ).first()
        assert item.body == "Long community-style body text"

    @pytest.mark.asyncio
    async def test_quora_uses_answer_field(self, created_company, db):
        from app.api.modules.paid_ads import _generate_platform_ads_bg
        from app.models.content import ContentItem

        quora_ad = {
            "question": "What is TMS therapy?",
            "answer": "TMS (Transcranial Magnetic Stimulation) is a non-invasive treatment...",
            "cta": "Learn more at Novamind",
        }
        with patch(
            "app.api.modules.paid_ads.llm_service._chat_json",
            return_value={"ads": [quora_ad]},
        ):
            await _generate_platform_ads_bg(
                created_company.id, _company_data(), "quora", db
            )

        item = db.query(ContentItem).filter(
            ContentItem.company_id == created_company.id,
        ).first()
        assert "TMS" in item.body

    @pytest.mark.asyncio
    async def test_tiktok_uses_voiceover_field(self, created_company, db):
        from app.api.modules.paid_ads import _generate_platform_ads_bg
        from app.models.content import ContentItem

        tiktok_ad = {
            "hook": "Wait — did you know depression can be treated without medication?",
            "voiceover": "Full 30-second TikTok voiceover script here...",
            "on_screen_text": ["TMS Therapy", "Drug-free", "Insurance covered"],
            "hashtags": ["#mentalhealth", "#tmstherapy"],
            "cta": "Link in bio",
        }
        with patch(
            "app.api.modules.paid_ads.llm_service._chat_json",
            return_value={"ads": [tiktok_ad]},
        ):
            await _generate_platform_ads_bg(
                created_company.id, _company_data(), "tiktok", db
            )

        item = db.query(ContentItem).filter(
            ContentItem.company_id == created_company.id,
        ).first()
        assert "voiceover" in item.body.lower() or "tiktok" in item.body.lower()

    @pytest.mark.asyncio
    async def test_linkedin_uses_intro_text_field(self, created_company, db):
        from app.api.modules.paid_ads import _generate_platform_ads_bg
        from app.models.content import ContentItem

        linkedin_ad = {
            "headline": "Partner with Novamind — Get Your Patients Same-Week Care",
            "intro_text": "Are you a PCP or therapist looking for a reliable mental health referral partner?",
            "cta_label": "Contact Us",
        }
        with patch(
            "app.api.modules.paid_ads.llm_service._chat_json",
            return_value={"ads": [linkedin_ad]},
        ):
            await _generate_platform_ads_bg(
                created_company.id, _company_data(), "linkedin", db
            )

        item = db.query(ContentItem).filter(
            ContentItem.company_id == created_company.id,
        ).first()
        assert "PCP" in item.body or "referral" in item.body.lower()
