"""Tests for Playwright directory profile automation scripts."""
import asyncio
import pytest
from unittest.mock import AsyncMock, MagicMock, patch, PropertyMock

from app.services.playwright_automation.base import DirectoryAutomator, AutomationResult
from app.services.playwright_automation import (
    get_automator,
    PLATFORM_AUTOMATORS,
    GoogleBusinessAutomator,
    PsychologyTodayAutomator,
    TherapyDenAutomator,
    HealthgradesAutomator,
    ZocdocAutomator,
    VitalsAutomator,
    YelpAutomator,
    WebMDAutomator,
    SAMHSAAutomator,
)


# ─── Fixtures ─────────────────────────────────────────────────────

SAMPLE_COMPANY_DATA = {
    "company_name": "NovaMind Mental Health",
    "website_url": "https://novamindmentalhealth.com",
    "specialty_niche": "TMS Therapy",
    "services": [{"name": "TMS Therapy"}, {"name": "Ketamine Infusion"}],
    "providers": [{"name": "Dr. Emily Rodriguez", "credentials": "MD, FACP"}],
    "locations": [
        {
            "city": "Phoenix",
            "state": "AZ",
            "zip": "85001",
            "address": "123 Health Blvd",
            "phone": "602-555-0100",
        }
    ],
    "insurance_accepted": [
        {"name": "Aetna"},
        {"name": "Blue Cross Blue Shield"},
        {"name": "United Healthcare"},
    ],
    "differentiators": ["First TMS clinic in Phoenix"],
}

SAMPLE_PROFILE_DATA = {
    "description_short": "Leading TMS therapy clinic in Phoenix.",
    "description_medium": "NovaMind Mental Health is Phoenix's premier TMS therapy clinic. We offer FDA-cleared TMS treatment for depression, anxiety, and OCD.",
    "description_long": "NovaMind Mental Health provides comprehensive mental health services with a focus on neuromodulation therapies including TMS and ketamine infusion. Our board-certified psychiatrists specialize in treatment-resistant depression.",
    "services_listed": ["TMS Therapy", "Ketamine Infusion", "Psychiatric Evaluation"],
    "provider_bios": [{"name": "Dr. Emily Rodriguez", "bio": "Board-certified psychiatrist with 15 years experience."}],
}

SAMPLE_CREDENTIALS = {
    "directory_google_business_profile_email": "test@novamind.com",
    "directory_google_business_profile_password": "securepass123",
}


# ─── AutomationResult tests ────────────────────────────────────────

class TestAutomationResult:
    def test_to_dict(self):
        result = AutomationResult(
            status="completed",
            platform="google_business_profile",
            profile_url="https://g.page/novamind",
        )
        d = result.to_dict()
        assert d["status"] == "completed"
        assert d["platform"] == "google_business_profile"
        assert d["profile_url"] == "https://g.page/novamind"
        assert d["errors"] == []
        assert d["screenshots"] == []

    def test_default_fields(self):
        result = AutomationResult(status="pending", platform="yelp")
        assert result.profile_url is None
        assert result.errors == []
        assert result.metadata == {}


# ─── Factory function tests ────────────────────────────────────────

class TestGetAutomator:
    def test_returns_correct_automator_for_each_platform(self):
        for platform, cls in PLATFORM_AUTOMATORS.items():
            automator = get_automator(platform, SAMPLE_COMPANY_DATA, SAMPLE_PROFILE_DATA, {})
            assert isinstance(automator, cls)

    def test_raises_for_unknown_platform(self):
        with pytest.raises(ValueError, match="No automator registered"):
            get_automator("unknown_platform", {}, {}, {})

    def test_all_9_platforms_registered(self):
        expected = {
            "google_business_profile",
            "psychology_today",
            "therapyden",
            "healthgrades",
            "zocdoc",
            "vitals",
            "yelp",
            "webmd",
            "samhsa",
        }
        assert set(PLATFORM_AUTOMATORS.keys()) == expected

    def test_automator_receives_company_data(self):
        automator = get_automator("yelp", SAMPLE_COMPANY_DATA, SAMPLE_PROFILE_DATA, SAMPLE_CREDENTIALS)
        assert automator.company_name == "NovaMind Mental Health"
        assert automator.website == "https://novamindmentalhealth.com"


# ─── Base class property tests ────────────────────────────────────

class ConcreteAutomator(DirectoryAutomator):
    PLATFORM_ID = "test_platform"

    async def login(self): return True
    async def navigate_to_profile(self): pass
    async def fill_profile_fields(self): pass
    async def submit_profile(self): return {"profile_url": "https://example.com/profile"}


class TestDirectoryAutomatorProperties:
    def test_company_name(self):
        bot = ConcreteAutomator(SAMPLE_COMPANY_DATA, SAMPLE_PROFILE_DATA, {})
        assert bot.company_name == "NovaMind Mental Health"

    def test_website(self):
        bot = ConcreteAutomator(SAMPLE_COMPANY_DATA, SAMPLE_PROFILE_DATA, {})
        assert bot.website == "https://novamindmentalhealth.com"

    def test_phone(self):
        bot = ConcreteAutomator(SAMPLE_COMPANY_DATA, SAMPLE_PROFILE_DATA, {})
        assert bot.phone == "602-555-0100"

    def test_address(self):
        bot = ConcreteAutomator(SAMPLE_COMPANY_DATA, SAMPLE_PROFILE_DATA, {})
        assert bot.address["city"] == "Phoenix"
        assert bot.address["state"] == "AZ"

    def test_description_short(self):
        bot = ConcreteAutomator(SAMPLE_COMPANY_DATA, SAMPLE_PROFILE_DATA, {})
        assert "TMS therapy" in bot.description_short

    def test_description_medium(self):
        bot = ConcreteAutomator(SAMPLE_COMPANY_DATA, SAMPLE_PROFILE_DATA, {})
        assert "NovaMind" in bot.description_medium

    def test_description_long(self):
        bot = ConcreteAutomator(SAMPLE_COMPANY_DATA, SAMPLE_PROFILE_DATA, {})
        assert "TMS" in bot.description_long

    def test_specialty(self):
        bot = ConcreteAutomator(SAMPLE_COMPANY_DATA, SAMPLE_PROFILE_DATA, {})
        assert bot.specialty == "TMS Therapy"

    def test_primary_provider(self):
        bot = ConcreteAutomator(SAMPLE_COMPANY_DATA, SAMPLE_PROFILE_DATA, {})
        assert bot.primary_provider["name"] == "Dr. Emily Rodriguez"

    def test_services(self):
        bot = ConcreteAutomator(SAMPLE_COMPANY_DATA, SAMPLE_PROFILE_DATA, {})
        services = bot.services
        assert len(services) > 0

    def test_empty_company_data_graceful(self):
        bot = ConcreteAutomator({}, {}, {})
        assert bot.company_name == ""
        assert bot.phone == ""
        assert bot.address == {}
        assert bot.primary_provider == {}


# ─── Run pipeline tests (mocked Playwright) ───────────────────────

class TestAutomationRunPipeline:
    @pytest.mark.asyncio
    async def test_run_completes_successfully(self):
        bot = ConcreteAutomator(SAMPLE_COMPANY_DATA, SAMPLE_PROFILE_DATA, {})
        # Mock page/browser so __aenter__ doesn't fail
        bot.browser = AsyncMock()
        bot.context = AsyncMock()
        bot.page = AsyncMock()
        bot.page.url = "https://example.com/profile"
        bot.page.query_selector = AsyncMock(return_value=None)
        bot.page.screenshot = AsyncMock()

        result = await bot.run()
        assert result.status == "completed"
        assert result.profile_url == "https://example.com/profile"

    @pytest.mark.asyncio
    async def test_run_detects_captcha_after_login(self):
        class CaptchaAfterLogin(ConcreteAutomator):
            call_count = 0

            async def login(self): return True

            async def navigate_to_profile(self): pass

        bot = CaptchaAfterLogin(SAMPLE_COMPANY_DATA, SAMPLE_PROFILE_DATA, {})
        bot.browser = AsyncMock()
        bot.page = AsyncMock()
        bot.page.url = "https://example.com"
        bot.page.screenshot = AsyncMock()

        # Make detect_captcha return True on first post-login check
        bot.page.query_selector = AsyncMock(return_value=MagicMock())

        result = await bot.run()
        assert result.status == "captcha_blocked"

    @pytest.mark.asyncio
    async def test_run_handles_login_failure(self):
        class FailLogin(ConcreteAutomator):
            async def login(self): return False

        bot = FailLogin(SAMPLE_COMPANY_DATA, SAMPLE_PROFILE_DATA, {})
        bot.browser = AsyncMock()
        bot.page = AsyncMock()
        bot.page.screenshot = AsyncMock()
        bot.page.query_selector = AsyncMock(return_value=None)

        result = await bot.run()
        assert result.status == "needs_manual"
        assert len(result.errors) > 0

    @pytest.mark.asyncio
    async def test_run_handles_exception(self):
        class ErrorAutomator(ConcreteAutomator):
            async def login(self): return True
            async def navigate_to_profile(self): raise RuntimeError("Connection refused")

        bot = ErrorAutomator(SAMPLE_COMPANY_DATA, SAMPLE_PROFILE_DATA, {})
        bot.browser = AsyncMock()
        bot.page = AsyncMock()
        bot.page.screenshot = AsyncMock()
        bot.page.query_selector = AsyncMock(return_value=None)

        result = await bot.run()
        assert result.status == "failed"
        assert "Connection refused" in result.errors[0]


# ─── Platform-specific tests ──────────────────────────────────────

class TestGoogleBusinessAutomator:
    def test_platform_id(self):
        bot = GoogleBusinessAutomator(SAMPLE_COMPANY_DATA, SAMPLE_PROFILE_DATA, SAMPLE_CREDENTIALS)
        assert bot.PLATFORM_ID == "google_business_profile"

    def test_has_credentials(self):
        bot = GoogleBusinessAutomator(SAMPLE_COMPANY_DATA, SAMPLE_PROFILE_DATA, SAMPLE_CREDENTIALS)
        assert "directory_google_business_profile_email" in bot.credentials

    @pytest.mark.asyncio
    async def test_login_returns_false_without_credentials(self):
        bot = GoogleBusinessAutomator(SAMPLE_COMPANY_DATA, SAMPLE_PROFILE_DATA, {})
        bot.page = AsyncMock()
        result = await bot.login()
        assert result is False

    @pytest.mark.asyncio
    async def test_submit_profile_returns_dict(self):
        bot = GoogleBusinessAutomator(SAMPLE_COMPANY_DATA, SAMPLE_PROFILE_DATA, SAMPLE_CREDENTIALS)
        bot.page = AsyncMock()
        bot.page.url = "https://business.google.com/manage/123"
        bot.page.query_selector = AsyncMock(return_value=None)
        bot.page.screenshot = AsyncMock()

        result = await bot.submit_profile()
        assert "profile_url" in result
        assert "platform_name" in result


class TestPsychologyTodayAutomator:
    def test_platform_id(self):
        bot = PsychologyTodayAutomator(SAMPLE_COMPANY_DATA, SAMPLE_PROFILE_DATA, {})
        assert bot.PLATFORM_ID == "psychology_today"

    @pytest.mark.asyncio
    async def test_login_returns_false_without_credentials(self):
        bot = PsychologyTodayAutomator(SAMPLE_COMPANY_DATA, SAMPLE_PROFILE_DATA, {})
        bot.page = AsyncMock()
        result = await bot.login()
        assert result is False

    @pytest.mark.asyncio
    async def test_submit_profile_returns_dict(self):
        bot = PsychologyTodayAutomator(SAMPLE_COMPANY_DATA, SAMPLE_PROFILE_DATA, {})
        bot.page = AsyncMock()
        bot.page.url = "https://therapists.psychologytoday.com/provider/edit"
        bot.page.query_selector = AsyncMock(return_value=None)
        bot.page.screenshot = AsyncMock()

        result = await bot.submit_profile()
        assert result["platform_name"] == "Psychology Today"


class TestTherapyDenAutomator:
    def test_platform_id(self):
        bot = TherapyDenAutomator(SAMPLE_COMPANY_DATA, SAMPLE_PROFILE_DATA, {})
        assert bot.PLATFORM_ID == "therapyden"

    @pytest.mark.asyncio
    async def test_login_returns_false_without_credentials(self):
        bot = TherapyDenAutomator(SAMPLE_COMPANY_DATA, SAMPLE_PROFILE_DATA, {})
        bot.page = AsyncMock()
        result = await bot.login()
        assert result is False


class TestHealthgradesAutomator:
    def test_platform_id(self):
        bot = HealthgradesAutomator(SAMPLE_COMPANY_DATA, SAMPLE_PROFILE_DATA, {})
        assert bot.PLATFORM_ID == "healthgrades"

    @pytest.mark.asyncio
    async def test_login_returns_false_without_credentials(self):
        bot = HealthgradesAutomator(SAMPLE_COMPANY_DATA, SAMPLE_PROFILE_DATA, {})
        bot.page = AsyncMock()
        result = await bot.login()
        assert result is False


class TestZocdocAutomator:
    def test_platform_id(self):
        bot = ZocdocAutomator(SAMPLE_COMPANY_DATA, SAMPLE_PROFILE_DATA, {})
        assert bot.PLATFORM_ID == "zocdoc"

    @pytest.mark.asyncio
    async def test_login_returns_false_without_credentials(self):
        bot = ZocdocAutomator(SAMPLE_COMPANY_DATA, SAMPLE_PROFILE_DATA, {})
        bot.page = AsyncMock()
        result = await bot.login()
        assert result is False


class TestVitalsAutomator:
    def test_platform_id(self):
        bot = VitalsAutomator(SAMPLE_COMPANY_DATA, SAMPLE_PROFILE_DATA, {})
        assert bot.PLATFORM_ID == "vitals"

    @pytest.mark.asyncio
    async def test_login_returns_false_without_credentials(self):
        bot = VitalsAutomator(SAMPLE_COMPANY_DATA, SAMPLE_PROFILE_DATA, {})
        bot.page = AsyncMock()
        result = await bot.login()
        assert result is False


class TestYelpAutomator:
    def test_platform_id(self):
        bot = YelpAutomator(SAMPLE_COMPANY_DATA, SAMPLE_PROFILE_DATA, {})
        assert bot.PLATFORM_ID == "yelp"

    @pytest.mark.asyncio
    async def test_login_returns_false_without_credentials(self):
        bot = YelpAutomator(SAMPLE_COMPANY_DATA, SAMPLE_PROFILE_DATA, {})
        bot.page = AsyncMock()
        result = await bot.login()
        assert result is False

    @pytest.mark.asyncio
    async def test_submit_profile_returns_dict(self):
        bot = YelpAutomator(SAMPLE_COMPANY_DATA, SAMPLE_PROFILE_DATA, {})
        bot.page = AsyncMock()
        bot.page.url = "https://biz.yelp.com/biz_info/123"
        bot.page.query_selector = AsyncMock(return_value=None)
        bot.page.screenshot = AsyncMock()

        result = await bot.submit_profile()
        assert result["platform_name"] == "Yelp"


class TestWebMDAutomator:
    def test_platform_id(self):
        bot = WebMDAutomator(SAMPLE_COMPANY_DATA, SAMPLE_PROFILE_DATA, {})
        assert bot.PLATFORM_ID == "webmd"

    @pytest.mark.asyncio
    async def test_login_returns_false_without_credentials(self):
        bot = WebMDAutomator(SAMPLE_COMPANY_DATA, SAMPLE_PROFILE_DATA, {})
        bot.page = AsyncMock()
        result = await bot.login()
        assert result is False


class TestSAMHSAAutomator:
    def test_platform_id(self):
        bot = SAMHSAAutomator(SAMPLE_COMPANY_DATA, SAMPLE_PROFILE_DATA, {})
        assert bot.PLATFORM_ID == "samhsa"

    @pytest.mark.asyncio
    async def test_login_returns_false_without_credentials(self):
        bot = SAMHSAAutomator(SAMPLE_COMPANY_DATA, SAMPLE_PROFILE_DATA, {})
        bot.page = AsyncMock()
        result = await bot.login()
        assert result is False

    @pytest.mark.asyncio
    async def test_submit_profile_returns_findtreatment_url(self):
        bot = SAMHSAAutomator(SAMPLE_COMPANY_DATA, SAMPLE_PROFILE_DATA, {})
        bot.page = AsyncMock()
        bot.page.url = "https://dasis3.samhsa.gov"
        bot.page.query_selector = AsyncMock(return_value=None)
        bot.page.screenshot = AsyncMock()

        result = await bot.submit_profile()
        assert result["profile_url"] == "https://findtreatment.gov/"
        assert "SAMHSA" in result["platform_name"]


# ─── CAPTCHA detection tests ──────────────────────────────────────

class TestCaptchaDetection:
    @pytest.mark.asyncio
    async def test_detect_captcha_returns_true_when_captcha_present(self):
        bot = ConcreteAutomator(SAMPLE_COMPANY_DATA, SAMPLE_PROFILE_DATA, {})
        bot.page = AsyncMock()
        # Mock finding the recaptcha iframe
        mock_el = MagicMock()
        bot.page.query_selector = AsyncMock(side_effect=[None, mock_el])
        bot.page.screenshot = AsyncMock()

        result = await bot.detect_captcha()
        assert result is True

    @pytest.mark.asyncio
    async def test_detect_captcha_returns_false_when_no_captcha(self):
        bot = ConcreteAutomator(SAMPLE_COMPANY_DATA, SAMPLE_PROFILE_DATA, {})
        bot.page = AsyncMock()
        bot.page.query_selector = AsyncMock(return_value=None)

        result = await bot.detect_captcha()
        assert result is False


# ─── profiles.py integration test ────────────────────────────────

class TestProfilesAPIAutoCreate:
    """Tests for the _auto_create_profile_bg function in profiles.py."""

    @pytest.mark.asyncio
    async def test_auto_create_uses_playwright_automator(self, db_session, created_company):
        """Verify _auto_create_profile_bg calls get_automator and runs it."""
        from app.api.modules.profiles import _auto_create_profile_bg
        from app.models.seo import DirectoryProfile

        # Create a profile with content
        profile = DirectoryProfile(
            company_id=created_company.id,
            platform="yelp",
            description_medium="Test description",
        )
        db_session.add(profile)
        db_session.commit()

        mock_result = AutomationResult(status="completed", platform="yelp", profile_url="https://yelp.com/biz/test")

        with patch("app.services.playwright_automation.get_automator") as mock_get:
            mock_automator = MagicMock()
            mock_automator.__aenter__ = AsyncMock(return_value=mock_automator)
            mock_automator.__aexit__ = AsyncMock(return_value=False)
            mock_automator.run = AsyncMock(return_value=mock_result)
            mock_get.return_value = mock_automator

            await _auto_create_profile_bg(str(created_company.id), "yelp", db_session)

        db_session.refresh(profile)
        assert profile.auto_create_status == "completed"
        assert profile.profile_url == "https://yelp.com/biz/test"
        assert profile.is_created is True

    @pytest.mark.asyncio
    async def test_auto_create_marks_needs_manual_on_import_error(self, db_session, created_company):
        """ImportError (Playwright not installed) → needs_manual."""
        from app.api.modules.profiles import _auto_create_profile_bg
        from app.models.seo import DirectoryProfile

        profile = DirectoryProfile(
            company_id=created_company.id,
            platform="google_business_profile",
            description_medium="Test description",
        )
        db_session.add(profile)
        db_session.commit()

        with patch("app.services.playwright_automation.get_automator", side_effect=ImportError("playwright not found")):
            await _auto_create_profile_bg(str(created_company.id), "google_business_profile", db_session)

        db_session.refresh(profile)
        assert profile.auto_create_status in ("needs_manual", "failed")

    @pytest.mark.asyncio
    async def test_auto_create_marks_failed_on_exception(self, db_session, created_company):
        """Generic exception → failed status."""
        from app.api.modules.profiles import _auto_create_profile_bg
        from app.models.seo import DirectoryProfile

        profile = DirectoryProfile(
            company_id=created_company.id,
            platform="zocdoc",
            description_medium="Test description",
        )
        db_session.add(profile)
        db_session.commit()

        with patch("app.services.playwright_automation.get_automator") as mock_get:
            mock_automator = MagicMock()
            mock_automator.__aenter__ = AsyncMock(return_value=mock_automator)
            mock_automator.__aexit__ = AsyncMock(return_value=False)
            mock_automator.run = AsyncMock(side_effect=RuntimeError("Unexpected error"))
            mock_get.return_value = mock_automator

            await _auto_create_profile_bg(str(created_company.id), "zocdoc", db_session)

        db_session.refresh(profile)
        assert profile.auto_create_status == "failed"

    @pytest.mark.asyncio
    async def test_auto_create_skips_when_no_profile(self, db_session, created_company):
        """Should return gracefully if no DirectoryProfile found."""
        from app.api.modules.profiles import _auto_create_profile_bg

        with patch("app.services.playwright_automation.get_automator") as mock_get:
            await _auto_create_profile_bg(str(created_company.id), "nonexistent", db_session)
            # Should not call get_automator since profile doesn't exist
            mock_get.assert_not_called()
