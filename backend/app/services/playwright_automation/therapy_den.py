"""TherapyDen therapist directory automation."""
from __future__ import annotations
import logging
from .base import DirectoryAutomator

logger = logging.getLogger(__name__)


class TherapyDenAutomator(DirectoryAutomator):
    """
    Automates creating/editing a TherapyDen therapist profile.

    Credential keys:
      - directory_therapyden_email
      - directory_therapyden_password

    URL: https://www.therapyden.com/therapist/sign-in
    Profile management: https://www.therapyden.com/dashboard
    """

    PLATFORM_ID = "therapyden"
    LOGIN_URL = "https://www.therapyden.com/therapist/sign-in"
    DASHBOARD_URL = "https://www.therapyden.com/dashboard"
    PROFILE_EDIT_URL = "https://www.therapyden.com/dashboard/profile"

    async def login(self) -> bool:
        email = self.credentials.get("directory_therapyden_email", "")
        password = self.credentials.get("directory_therapyden_password", "")
        if not email or not password:
            logger.warning("[therapyden] No credentials stored.")
            return False

        try:
            await self.goto(self.LOGIN_URL)

            await self.wait_and_fill('input[type="email"], input[name="email"]', email)
            await self.wait_and_fill('input[type="password"], input[name="password"]', password)
            await self.wait_and_click('button[type="submit"]')
            await self.page.wait_for_timeout(2000)

            # Check we're now on dashboard
            return "dashboard" in self.page.url or "therapist" in self.page.url
        except Exception as e:
            logger.debug("[therapyden] Login error: %s", e)
            return False

    async def navigate_to_profile(self):
        await self.goto(self.PROFILE_EDIT_URL)
        await self.page.wait_for_timeout(1000)

    async def fill_profile_fields(self):
        provider = self.primary_provider

        # Full name
        if provider.get("name"):
            await self.safe_fill('input[name="name"], #name', provider["name"])

        # Pronouns (progressive platform)
        # Skip — optional

        # Profile bio
        if self.description_long:
            await self.safe_fill(
                'textarea[name="bio"], textarea[name="about"], #bio',
                self.description_long[:1500],
            )

        # Specialties as text tags
        if self.specialty:
            await self.safe_fill('input[placeholder*="specialty"], input[name="specialties"]', self.specialty)
            await self.safe_click('li:has-text("{}")'.format(self.specialty), timeout=1000)

        # Issues treated
        for issue in ["depression", "anxiety", "trauma", "LGBTQ+"]:
            await self.safe_click(f'[data-value="{issue}"], label:has-text("{issue}")', timeout=1000)

        # Location
        addr = self.address
        if addr.get("city"):
            await self.safe_fill('input[name="city"]', addr.get("city", ""))
        if addr.get("state"):
            await self.safe_select_or_fill("state", addr.get("state", ""))
        if addr.get("zip"):
            await self.safe_fill('input[name="zip"]', addr.get("zip", ""))

        # Phone
        if self.phone:
            await self.safe_fill('input[name="phone"], input[type="tel"]', self.phone)

        # Website
        if self.website:
            await self.safe_fill('input[name="website"]', self.website)

        # Telehealth
        await self.safe_click('input[name="telehealth"], label:has-text("Online / Telehealth")', timeout=1000)

        # Sliding scale / fees
        await self.safe_click('label:has-text("Sliding scale")', timeout=1000)

    async def safe_select_or_fill(self, field_name: str, value: str):
        """Try select element first, fall back to text input."""
        try:
            await self.wait_and_select(f'select[name="{field_name}"]', value, timeout=2000)
        except Exception:
            await self.safe_fill(f'input[name="{field_name}"]', value, timeout=2000)

    async def submit_profile(self) -> dict:
        await self.safe_click('button[type="submit"]:has-text("Save"), button:has-text("Update")', timeout=5000)
        await self.page.wait_for_timeout(2000)
        await self.take_screenshot("saved")

        return {
            "profile_url": self.page.url,
            "platform_name": "TherapyDen",
        }
