"""Zocdoc provider directory automation."""
from __future__ import annotations
import logging
from .base import DirectoryAutomator

logger = logging.getLogger(__name__)


class ZocdocAutomator(DirectoryAutomator):
    """
    Automates creating/editing a Zocdoc provider profile.

    Credential keys:
      - directory_zocdoc_email
      - directory_zocdoc_password

    Zocdoc provider portal: https://www.zocdoc.com/provider
    """

    PLATFORM_ID = "zocdoc"
    LOGIN_URL = "https://www.zocdoc.com/provider/login"
    DASHBOARD_URL = "https://www.zocdoc.com/provider/dashboard"
    PROFILE_URL = "https://www.zocdoc.com/provider/profile"

    async def login(self) -> bool:
        email = self.credentials.get("directory_zocdoc_email", "")
        password = self.credentials.get("directory_zocdoc_password", "")
        if not email or not password:
            logger.warning("[zocdoc] No credentials stored.")
            return False

        try:
            await self.goto(self.LOGIN_URL)

            await self.wait_and_fill('input[name="username"], input[type="email"]', email)
            await self.wait_and_fill('input[name="password"]', password)
            await self.wait_and_click('button[type="submit"], input[type="submit"]')
            await self.page.wait_for_timeout(2500)

            return "provider" in self.page.url and "login" not in self.page.url
        except Exception as e:
            logger.debug("[zocdoc] Login error: %s", e)
            return False

    async def navigate_to_profile(self):
        await self.goto(self.PROFILE_URL)
        await self.page.wait_for_timeout(1500)

    async def fill_profile_fields(self):
        provider = self.primary_provider

        # Provider name
        if provider.get("name"):
            await self.safe_fill('input[name="firstName"]', provider["name"].split()[0])
            if len(provider["name"].split()) > 1:
                await self.safe_fill('input[name="lastName"]', " ".join(provider["name"].split()[1:]))

        # Credentials
        if provider.get("credentials"):
            await self.safe_fill('input[name="credentials"], select[name="credentials"]', provider.get("credentials", ""))

        # Specialty
        await self.safe_fill('input[name="specialty"], input[placeholder*="specialty"]', self.specialty)

        # Practice / facility name
        await self.safe_fill('input[name="practiceName"], input[placeholder*="practice"]', self.company_name)

        # Biography
        if self.description_medium:
            await self.safe_fill('textarea[name="biography"], textarea[name="about"]', self.description_medium[:1000])

        # Address
        addr = self.address
        if addr.get("address"):
            await self.safe_fill('input[name="address"]', addr.get("address", ""))
        if addr.get("city"):
            await self.safe_fill('input[name="city"]', addr.get("city", ""))
        if addr.get("state"):
            await self.safe_select_state(addr.get("state", ""))
        if addr.get("zip"):
            await self.safe_fill('input[name="zip"]', addr.get("zip", ""))

        # Phone
        if self.phone:
            await self.safe_fill('input[name="phone"], input[type="tel"]', self.phone)

        # Insurance accepted
        insurance_list = self.company_data.get("insurance_accepted", [])
        for ins in insurance_list[:3]:
            name = ins if isinstance(ins, str) else ins.get("name", "")
            await self.safe_fill('input[placeholder*="insurance"], input[name*="insurance"]', name)
            await self.safe_click(f'[data-option*="{name}"], li:has-text("{name}")', timeout=1500)

        # Telehealth availability
        await self.safe_click(
            'input[name="telehealth"], label:has-text("Video visits"), label:has-text("Telehealth")',
            timeout=1000,
        )

        # New patient availability
        await self.safe_click('label:has-text("Accepting new patients")', timeout=1000)

    async def safe_select_state(self, state: str):
        try:
            await self.wait_and_select('select[name="state"]', state, timeout=2000)
        except Exception:
            await self.safe_fill('input[name="state"]', state, timeout=2000)

    async def submit_profile(self) -> dict:
        await self.safe_click('button[type="submit"]:has-text("Save"), button:has-text("Update")', timeout=5000)
        await self.page.wait_for_timeout(2500)
        await self.take_screenshot("saved")

        return {
            "profile_url": self.page.url,
            "platform_name": "Zocdoc",
        }
