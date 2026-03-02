"""
Regression tests for bugs fixed in recent sprints.

Covers:
  1. Content bg tasks create their own DB session (FastAPI request session is closed
     before a 30-60 s LLM call completes — tasks must use SessionLocal, not the
     request session).
  2. ContentItem constructors use `extra_data=` not `metadata=` (metadata raises
     TypeError on SQLAlchemy models, silently caught, nothing saved).
  3. Error handling — LLM failure leaves DB clean (rollback called).
  4. Social posts standalone path creates its own session when db=None.
  5. Calendar bg task commits blog drafts + social posts in a single transaction.
"""
import pytest
from unittest.mock import patch, MagicMock, AsyncMock


# ── helpers ────────────────────────────────────────────────────────────────────

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


def _make_session_mock(db):
    """Return a MagicMock that wraps *db* but does not close it."""
    mock = MagicMock(wraps=db)
    mock.close = MagicMock()
    return mock


# ══════════════════════════════════════════════════════════════════════════════
# 1. DB session isolation — background tasks call SessionLocal(), not request db
# ══════════════════════════════════════════════════════════════════════════════

class TestBgTaskSessionIsolation:
    """Verify that each background task creates its own DB session."""

    @pytest.mark.asyncio
    async def test_blog_post_bg_calls_session_local(self, created_company, db, mock_llm):
        from app.api.modules.content import _generate_blog_post_bg

        session_factory = MagicMock(return_value=_make_session_mock(db))

        with patch("app.api.modules.content.SessionLocal", session_factory):
            await _generate_blog_post_bg(
                created_company.id, _company_data(), "depression treatment", 1500
            )

        # SessionLocal() must be called exactly once per invocation
        session_factory.assert_called_once()

    @pytest.mark.asyncio
    async def test_blog_post_bg_closes_session_on_success(self, created_company, db, mock_llm):
        from app.api.modules.content import _generate_blog_post_bg

        mock_session = _make_session_mock(db)
        with patch("app.api.modules.content.SessionLocal", return_value=mock_session):
            await _generate_blog_post_bg(
                created_company.id, _company_data(), "depression treatment", 1500
            )

        # close() must be called in the finally block
        mock_session.close.assert_called_once()

    @pytest.mark.asyncio
    async def test_calendar_bg_calls_session_local(self, created_company, db, mock_llm):
        from app.api.modules.content import _generate_calendar_bg

        session_factory = MagicMock(return_value=_make_session_mock(db))

        with patch("app.api.modules.content.SessionLocal", session_factory):
            await _generate_calendar_bg(created_company.id, _company_data())

        session_factory.assert_called_once()

    @pytest.mark.asyncio
    async def test_social_bg_standalone_calls_session_local(self, created_company, db, mock_llm):
        """When called without db (standalone), _generate_social_bg creates its own session."""
        from app.api.modules.content import _generate_social_bg

        session_factory = MagicMock(return_value=_make_session_mock(db))

        with patch("app.api.modules.content.SessionLocal", session_factory):
            await _generate_social_bg(
                created_company.id, _company_data(), "facebook", 3
            )

        session_factory.assert_called_once()

    @pytest.mark.asyncio
    async def test_social_bg_shared_session_does_not_call_session_local(
        self, created_company, db, mock_llm
    ):
        """When called with an explicit db (from calendar), SessionLocal is NOT called."""
        from app.api.modules.content import _generate_social_bg

        session_factory = MagicMock()

        with patch("app.api.modules.content.SessionLocal", session_factory):
            await _generate_social_bg(
                created_company.id, _company_data(), "instagram", 3, db
            )

        session_factory.assert_not_called()


# ══════════════════════════════════════════════════════════════════════════════
# 2. extra_data field — ContentItem constructors must use extra_data, not metadata
# ══════════════════════════════════════════════════════════════════════════════

class TestExtraDataField:
    """Verify ContentItem is saved with extra_data populated correctly."""

    @pytest.mark.asyncio
    async def test_blog_post_bg_saves_extra_data(self, created_company, db, mock_llm):
        from app.api.modules.content import _generate_blog_post_bg
        from app.models.content import ContentItem, ContentType

        mock_session = _make_session_mock(db)
        with patch("app.api.modules.content.SessionLocal", return_value=mock_session):
            await _generate_blog_post_bg(
                created_company.id, _company_data(), "TMS therapy coverage", 1500
            )

        item = db.query(ContentItem).filter(
            ContentItem.company_id == created_company.id,
            ContentItem.content_type == ContentType.blog_post,
        ).first()

        assert item is not None, "ContentItem was not saved — check extra_data constructor kwarg"
        assert item.extra_data is not None
        assert "slug" in item.extra_data or "word_count" in item.extra_data

    @pytest.mark.asyncio
    async def test_social_post_bg_saves_extra_data(self, created_company, db, mock_llm):
        from app.api.modules.content import _generate_social_bg
        from app.models.content import ContentItem, ContentType

        await _generate_social_bg(
            created_company.id, _company_data(), "facebook", 3, db
        )

        items = db.query(ContentItem).filter(
            ContentItem.company_id == created_company.id,
            ContentItem.content_type == ContentType.social_facebook,
        ).all()

        assert len(items) > 0, "No social posts saved — check extra_data constructor kwarg"
        for item in items:
            assert item.extra_data is not None
            assert item.extra_data.get("platform") == "facebook"

    @pytest.mark.asyncio
    async def test_calendar_bg_saves_blog_draft_extra_data(
        self, created_company, db, mock_llm
    ):
        from app.api.modules.content import _generate_calendar_bg
        from app.models.content import ContentItem, ContentType

        mock_session = _make_session_mock(db)
        with patch("app.api.modules.content.SessionLocal", return_value=mock_session):
            await _generate_calendar_bg(created_company.id, _company_data())

        blog_items = db.query(ContentItem).filter(
            ContentItem.company_id == created_company.id,
            ContentItem.content_type == ContentType.blog_post,
        ).all()

        assert len(blog_items) > 0, "No blog drafts saved from calendar"
        for item in blog_items:
            assert item.extra_data is not None
            assert "planned" in item.extra_data


# ══════════════════════════════════════════════════════════════════════════════
# 3. Error handling — LLM failure triggers rollback, task does not raise
# ══════════════════════════════════════════════════════════════════════════════

class TestBgTaskErrorHandling:

    @pytest.mark.asyncio
    async def test_blog_post_bg_llm_failure_rolls_back(self, created_company, db):
        """When LLM raises, the bg task catches it and calls rollback (does not propagate)."""
        from app.api.modules.content import _generate_blog_post_bg

        mock_session = MagicMock()
        mock_session.add = MagicMock()
        mock_session.flush = MagicMock()
        mock_session.commit = MagicMock()
        mock_session.rollback = MagicMock()
        mock_session.close = MagicMock()

        with patch("app.api.modules.content.SessionLocal", return_value=mock_session):
            with patch(
                "app.api.modules.content.llm_service.generate_blog_post",
                side_effect=RuntimeError("API key invalid"),
            ):
                # Should NOT raise — exception is caught internally
                await _generate_blog_post_bg(
                    created_company.id, _company_data(), "anxiety treatment", 1200
                )

        mock_session.rollback.assert_called_once()
        mock_session.commit.assert_not_called()
        mock_session.close.assert_called_once()

    @pytest.mark.asyncio
    async def test_social_bg_llm_failure_rolls_back_own_session(self, created_company, db):
        """When called standalone and LLM raises, rollback and close are called."""
        from app.api.modules.content import _generate_social_bg

        mock_session = MagicMock()
        mock_session.add = MagicMock()
        mock_session.flush = MagicMock()
        mock_session.commit = MagicMock()
        mock_session.rollback = MagicMock()
        mock_session.close = MagicMock()

        with patch("app.api.modules.content.SessionLocal", return_value=mock_session):
            with patch(
                "app.api.modules.content.llm_service.generate_social_posts",
                side_effect=RuntimeError("timeout"),
            ):
                await _generate_social_bg(
                    created_company.id, _company_data(), "linkedin", 5
                )

        mock_session.rollback.assert_called_once()
        mock_session.commit.assert_not_called()
        mock_session.close.assert_called_once()

    @pytest.mark.asyncio
    async def test_social_bg_shared_session_does_not_rollback_on_failure(
        self, created_company, db
    ):
        """When called with a shared db, failure should NOT rollback that db — caller owns it."""
        from app.api.modules.content import _generate_social_bg

        mock_db = MagicMock()
        mock_db.rollback = MagicMock()

        with patch(
            "app.api.modules.content.llm_service.generate_social_posts",
            side_effect=RuntimeError("timeout"),
        ):
            await _generate_social_bg(
                created_company.id, _company_data(), "instagram", 5, mock_db
            )

        # Shared session — rollback should NOT be called (caller's responsibility)
        mock_db.rollback.assert_not_called()


# ══════════════════════════════════════════════════════════════════════════════
# 4. Calendar bg — blog drafts + social posts committed together
# ══════════════════════════════════════════════════════════════════════════════

class TestCalendarBgIntegration:

    @pytest.mark.asyncio
    async def test_calendar_creates_both_blog_and_social_content(
        self, created_company, db, mock_llm
    ):
        from app.api.modules.content import _generate_calendar_bg
        from app.models.content import ContentItem, ContentType

        mock_session = _make_session_mock(db)
        with patch("app.api.modules.content.SessionLocal", return_value=mock_session):
            await _generate_calendar_bg(created_company.id, _company_data())

        blog_count = db.query(ContentItem).filter(
            ContentItem.company_id == created_company.id,
            ContentItem.content_type == ContentType.blog_post,
        ).count()
        social_count = db.query(ContentItem).filter(
            ContentItem.company_id == created_company.id,
            ContentItem.content_type.in_([
                ContentType.social_facebook,
                ContentType.social_instagram,
                ContentType.social_linkedin,
            ]),
        ).count()

        assert blog_count > 0, "Calendar generated no blog drafts"
        assert social_count > 0, "Calendar generated no social posts"

    @pytest.mark.asyncio
    async def test_calendar_bg_commits_once(self, created_company, db, mock_llm):
        """Calendar task should commit exactly once (all content in one transaction)."""
        from app.api.modules.content import _generate_calendar_bg

        mock_session = _make_session_mock(db)
        with patch("app.api.modules.content.SessionLocal", return_value=mock_session):
            await _generate_calendar_bg(created_company.id, _company_data())

        mock_session.commit.assert_called_once()
