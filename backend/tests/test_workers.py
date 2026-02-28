"""
Tests for Celery workers — the app, task registration, and task execution
(all external I/O is mocked).
"""
import pytest
from unittest.mock import patch, MagicMock, AsyncMock


class TestCeleryApp:
    """Test that the Celery app is configured correctly."""

    def test_celery_app_instantiates(self):
        from app.workers.celery_app import celery_app
        assert celery_app is not None
        assert celery_app.main == "arche_gtm"

    def test_celery_app_serializer(self):
        from app.workers.celery_app import celery_app
        assert celery_app.conf.task_serializer == "json"
        assert celery_app.conf.result_serializer == "json"
        assert "json" in celery_app.conf.accept_content

    def test_celery_app_timezone(self):
        from app.workers.celery_app import celery_app
        assert celery_app.conf.timezone == "UTC"


class TestCeleryTasks:
    """Test Celery task functions with mocked external calls.

    All tasks use local imports (import X inside function body).
    Patch at the source module level, not via 'app.workers.tasks.X'.
    """

    def test_ingest_company_task_calls_run_ingestion(self):
        from app.workers.tasks import ingest_company_task

        mock_db = MagicMock()
        with patch("asyncio.run") as mock_run, \
             patch("app.db.database.SessionLocal", return_value=mock_db):

            ingest_company_task("company-123", "https://example.com")

            mock_run.assert_called_once()
            mock_db.close.assert_called_once()

    def test_ingest_company_task_closes_db_on_error(self):
        from app.workers.tasks import ingest_company_task

        mock_db = MagicMock()
        with patch("asyncio.run", side_effect=Exception("fail")), \
             patch("app.db.database.SessionLocal", return_value=mock_db):

            with pytest.raises(Exception, match="fail"):
                ingest_company_task("company-123", "https://example.com")

            mock_db.close.assert_called_once()

    def test_generate_referral_collateral_task(self):
        from app.workers.tasks import generate_referral_collateral_task

        mock_company = MagicMock()
        mock_company.name = "Novamind"
        mock_company.specialty_niche = "TMS"
        mock_company.services = []
        mock_company.providers = []
        mock_company.locations = []
        mock_company.insurance_accepted = []
        mock_company.differentiators = []
        mock_company.target_demographics = []
        mock_company.brand_guidelines = {}
        mock_company.website_url = "https://example.com"

        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.first.return_value = mock_company

        with patch("asyncio.run") as mock_run, \
             patch("app.db.database.SessionLocal", return_value=mock_db):

            generate_referral_collateral_task("company-123")

            # 3 specialties × (fax + voicemail) + email + postcard = 8
            assert mock_run.call_count == 8
            mock_db.close.assert_called_once()

    def test_generate_referral_collateral_task_company_not_found(self):
        from app.workers.tasks import generate_referral_collateral_task

        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.first.return_value = None

        with patch("asyncio.run") as mock_run, \
             patch("app.db.database.SessionLocal", return_value=mock_db):

            generate_referral_collateral_task("company-xyz")

            # Should return early without running anything
            mock_run.assert_not_called()
            mock_db.close.assert_called_once()

    def test_generate_leads_task(self):
        from app.workers.tasks import generate_leads_task

        mock_company = MagicMock()
        mock_company.name = "Novamind"
        mock_company.specialty_niche = "TMS"
        mock_company.services = []
        mock_company.locations = [{"city": "Phoenix", "state": "AZ"}]

        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.first.return_value = mock_company

        with patch("asyncio.run") as mock_run, \
             patch("app.db.database.SessionLocal", return_value=mock_db):

            generate_leads_task("company-123")

            mock_run.assert_called_once()
            mock_db.close.assert_called_once()

    def test_generate_leads_task_company_not_found(self):
        from app.workers.tasks import generate_leads_task

        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.first.return_value = None

        with patch("asyncio.run") as mock_run, \
             patch("app.db.database.SessionLocal", return_value=mock_db):

            generate_leads_task("company-xyz")
            mock_run.assert_not_called()
            mock_db.close.assert_called_once()

    def test_process_campaign_enrollments_task(self):
        from app.workers.tasks import process_campaign_enrollments

        mock_db = MagicMock()
        # Return empty list of enrollments
        mock_db.query.return_value.filter.return_value.all.return_value = []

        with patch("app.db.database.SessionLocal", return_value=mock_db):
            process_campaign_enrollments()
            mock_db.commit.assert_called_once()
            mock_db.close.assert_called_once()

    def test_process_campaign_enrollments_processes_pending(self):
        from app.workers.tasks import process_campaign_enrollments

        mock_enrollment = MagicMock()
        mock_enrollment.current_step = 3  # int so += 1 and >= 8 work
        mock_enrollment.status = "active"

        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.all.return_value = [mock_enrollment]

        with patch("app.db.database.SessionLocal", return_value=mock_db):
            process_campaign_enrollments()
            assert mock_enrollment.current_step == 4
            mock_db.commit.assert_called_once()
            mock_db.close.assert_called_once()
