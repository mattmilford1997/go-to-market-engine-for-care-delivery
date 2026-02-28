"""Healthgrades provider directory automation."""
from __future__ import annotations
import logging
from .base import DirectoryAutomator

logger = logging.getLogger(__name__)


class HealthgradesAutomator(DirectoryAutomator):
    """
    Automates claiming and editing a Healthgrades provider profile.

    Credential keys:
      - directory_healthgrades_email
      - directory_healthgrades_password

    URL: https://www.healthgrades.com/quality/claim-your-profile
    Provider portal: https://provider.healthgrades.com/
    """

    PLATFORM_ID = "healthgrades"
    LOGIN_URL = "https://provider.healthgrades.com/sign-in"
    DASHBOARD_URL = "https://provider.healthgrades.com/dashboard"
    PROFILE_URL = "https://provider.healthgrades.com/profile"

    async def login(self) -> bool:
        email = self.credentials.get("directory_healthgrades_email", "")
        password = self.credentials.get("directory_healthgrades_password", "")
        if not email or not password:
            logger.warning("[healthgrades] No credentials stored.")
            return False

        try:
            await self.goto(self.LOGIN_URL)

            await self.wait_and_fill(
                'input[type="email"], input[name="email"], input[placeholder*="Email"]',
                email,
            )
            await self.wait_and_fill(
                'input[type="password"], input[name="password"]',
                password,
            )
            await self.wait_and_click('button[type="submit"]')
            await self.page.wait_for_timeout(2500)

            return "dashboard" in self.page.url or "provider.healthgrades" in self.page.url
        except Exception as e:
            logger.debug("[healthgrades] Login error: %s", e)
            return False

    async def navigate_to_profile(self):
        await self.goto(self.PROFILE_URL)
        await self.page.wait_for_timeout(1500)

        # Look for "Edit Profile" button
        await self.safe_click('a:has-text("Edit Profile"), button:has-text("Edit Profile")', timeout=4000)

    async def fill_profile_fields(self):
        provider = self.primary_provider

        # Provider name
        if provider.get("name"):
            await self.safe_fill('#first-name, input[name="firstName"]', provider["name"].split()[0])
            if len(provider["name"].split()) > 1:
                await self.safe_fill('#last-name, input[name="lastName"]', " ".join(provider["name"].split()[1:]))

        # Credentials (MD, DO, LCSW, etc.)
        if provider.get("credentials"):
            await self.safe_fill('input[name="credentials"]', provider.get("credentials", ""))

        # Specialty
        await self.safe_fill('input[name="specialty"], input[placeholder*="Specialty"]', self.specialty)
        await self.safe_click(f'[data-option*="{self.specialty}"], li:has-text("{self.specialty}")', timeout=2000)

        # Hospital / Practice affiliations
        await self.safe_fill('input[name="practiceName"]', self.company_name)

        # Biography / about
        if self.description_medium:
            await self.safe_fill(
                'textarea[name="biography"], textarea[name="about"], #biography',
                self.description_medium,
            )

        # Address
        addr = self.address
        if addr.get("address"):
            await self.safe_fill('input[name="address1"], input[placeholder*="Address"]', addr.get("address", ""))
        if addr.get("city"):
            await self.safe_fill('input[name="city"]', addr.get("city", ""))
        if addr.get("state"):
            await self.safe_select_state(addr.get("state", ""))
        if addr.get("zip"):
            await self.safe_fill('input[name="zip"], input[placeholder*="ZIP"]', addr.get("zip", ""))

        # Phone
        if self.phone:
            await self.safe_fill('input[name="phone"], input[type="tel"]', self.phone)

        # Languages
        await self.safe_click('label:has-text("English")', timeout=1000)

    async def safe_select_state(self, state: str):
        try:
            await self.wait_and_select('select[name="state"]', state, timeout=2000)
        except Exception:
            await self.safe_fill('input[name="state"]', state, timeout=2000)

    async def submit_profile(self) -> dict:
        await self.safe_click(
            'button[type="submit"]:has-text("Save"), button:has-text("Save Changes"), '
            'button:has-text("Update Profile")',
            timeout=5000,
        )
        await self.page.wait_for_timeout(2500)
        await self.take_screenshot("saved")

        return {
            "profile_url": self.page.url,
            "platform_name": "Healthgrades",
        }
