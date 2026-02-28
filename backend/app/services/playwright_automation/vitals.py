"""Vitals.com provider directory automation."""
from __future__ import annotations
import logging
from .base import DirectoryAutomator

logger = logging.getLogger(__name__)


class VitalsAutomator(DirectoryAutomator):
    """
    Automates claiming and editing a Vitals.com provider profile.

    Credential keys:
      - directory_vitals_email
      - directory_vitals_password

    Provider claim URL: https://www.vitals.com/doctors/claim
    Provider portal:    https://www.vitals.com/provider-center
    """

    PLATFORM_ID = "vitals"
    LOGIN_URL = "https://www.vitals.com/provider-center/login"
    DASHBOARD_URL = "https://www.vitals.com/provider-center"
    PROFILE_URL = "https://www.vitals.com/provider-center/profile"

    async def login(self) -> bool:
        email = self.credentials.get("directory_vitals_email", "")
        password = self.credentials.get("directory_vitals_password", "")
        if not email or not password:
            logger.warning("[vitals] No credentials stored.")
            return False

        try:
            await self.goto(self.LOGIN_URL)

            await self.wait_and_fill('input[type="email"], input[name="email"]', email)
            await self.wait_and_fill('input[type="password"], input[name="password"]', password)
            await self.wait_and_click('button[type="submit"]')
            await self.page.wait_for_timeout(2500)

            return "provider-center" in self.page.url and "login" not in self.page.url
        except Exception as e:
            logger.debug("[vitals] Login error: %s", e)
            return False

    async def navigate_to_profile(self):
        await self.goto(self.PROFILE_URL)
        await self.page.wait_for_timeout(1200)

    async def fill_profile_fields(self):
        provider = self.primary_provider

        # Name
        if provider.get("name"):
            await self.safe_fill('input[name="firstName"]', provider["name"].split()[0])
            if len(provider["name"].split()) > 1:
                await self.safe_fill('input[name="lastName"]', " ".join(provider["name"].split()[1:]))

        # Credentials
        if provider.get("credentials"):
            await self.safe_fill('input[name="credentials"]', provider.get("credentials", ""))

        # Specialty
        await self.safe_fill('input[name="specialty"]', self.specialty)

        # About / bio
        if self.description_medium:
            await self.safe_fill('textarea[name="about"], textarea#about', self.description_medium[:800])

        # Practice name
        await self.safe_fill('input[name="practiceName"]', self.company_name)

        # Address
        addr = self.address
        if addr.get("address"):
            await self.safe_fill('input[name="address"]', addr.get("address", ""))
        if addr.get("city"):
            await self.safe_fill('input[name="city"]', addr.get("city", ""))
        if addr.get("state"):
            try:
                await self.wait_and_select('select[name="state"]', addr.get("state", ""), timeout=2000)
            except Exception:
                await self.safe_fill('input[name="state"]', addr.get("state", ""), timeout=2000)
        if addr.get("zip"):
            await self.safe_fill('input[name="zip"]', addr.get("zip", ""))

        # Phone
        if self.phone:
            await self.safe_fill('input[name="phone"], input[type="tel"]', self.phone)

        # Education / training (optional)
        await self.safe_fill(
            'input[name="medicalSchool"], input[placeholder*="Medical School"]',
            "",
            timeout=1000,
        )

        # Accepting new patients
        await self.safe_click('input[name="acceptingPatients"], label:has-text("Accepting new patients")', timeout=1000)

    async def submit_profile(self) -> dict:
        await self.safe_click('button[type="submit"]:has-text("Save"), button:has-text("Save Changes")', timeout=5000)
        await self.page.wait_for_timeout(2000)
        await self.take_screenshot("saved")

        return {
            "profile_url": self.page.url,
            "platform_name": "Vitals",
        }
