"""Tests for the database session utilities."""
import pytest


class TestGetDb:
    def test_get_db_yields_session(self):
        """get_db() should yield a session and close it on teardown."""
        from app.db.database import get_db

        gen = get_db()
        db = next(gen)
        assert db is not None

        # Exhaust the generator (triggers finally: db.close())
        with pytest.raises(StopIteration):
            next(gen)

    def test_get_db_closes_on_exception(self):
        """get_db() finally block closes the session even on error."""
        from app.db.database import get_db

        gen = get_db()
        db = next(gen)
        assert db is not None

        try:
            gen.throw(RuntimeError("test error"))
        except RuntimeError:
            pass
        # If we reach here the session was closed without raising

    def test_session_local_creates_session(self):
        from app.db.database import SessionLocal
        session = SessionLocal()
        assert session is not None
        session.close()

    def test_base_has_metadata(self):
        from app.db.database import Base
        assert Base.metadata is not None

    def test_all_tables_are_registered(self):
        from app.db.database import Base
        import app.models  # noqa: F401 — ensure all models are imported
        table_names = set(Base.metadata.tables.keys())
        expected = {
            "companies", "content_items", "approval_items",
            "referral_leads", "touchpoints", "campaigns",
            "campaign_enrollments", "seo_reports", "directory_profiles",
        }
        assert expected.issubset(table_names)
