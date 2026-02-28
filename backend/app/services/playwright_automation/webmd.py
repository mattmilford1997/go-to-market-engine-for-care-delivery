"""WebMD / Medscape provider directory automation."""
from __future__ import annotations
import logging
from .base import DirectoryAutomator

logger = logging.getLogger(__name__)


class WebMDAutomator(DirectoryAutomator):
    """
    Automates claiming/editing a WebMD (Medscape) provider profile.

    Credential keys:
      - directory_webmd_email
      - directory_webmd_password

    Provider portal: https://www.medscape.com/provider
    Find-a-doctor: https://doctor.webmd.com/
    Claim URL: https://doctor.webmd.com/claim-your-profile
    """

    PLATFORM_ID = "webmd"
    LOGIN_URL = "https://login.medscape.com/"
    PROFILE_URL = "https://www.medscape.com/profile/edit"
    CLAIM_URL = "https://doctor.webmd.com/claim-your-profile"

    async def login(self) -> bool:
        email = self.credentials.get("directory_webmd_email", "")
        password = self.credentials.get("directory_webmd_password", "")
        if not email or not password:
            logger.warning("[webmd] No credentials stored.")
            return False

        try:
            await self.goto(self.LOGIN_URL)

            await self.wait_and_fill(
                'input[name="userid"], input[type="email"], input[name="email"]',
                email,
            )
            await self.wait_and_fill('input[name="password"]', password)
            await self.wait_and_click('button[type="submit"], input[type="submit"]')
            await self.page.wait_for_timeout(3000)

            return "medscape.com" in self.page.url and "login" not in self.page.url.lower()
        except Exception as e:
            logger.debug("[webmd] Login error: %s", e)
            return False

    async def navigate_to_profile(self):
        await self.goto(self.PROFILE_URL)
        await self.page.wait_for_timeout(1500)

    async def fill_profile_fields(self):
        provider = self.primary_provider

        # Name
        if provider.get("name"):
            await self.safe_fill('input[name="firstName"]', provider["name"].split()[0])
            if len(provider["name"].split()) > 1:
                await self.safe_fill('input[name="lastName"]', " ".join(provider["name"].split()[1:]))

        # Medical credentials
        if provider.get("credentials"):
            await self.safe_fill('input[name="degree"], select[name="degree"]', provider.get("credentials", ""))

        # Specialty
        await self.safe_fill('input[name="specialty"], input[placeholder*="Specialty"]', self.specialty)

        # About / biography
        if self.description_long:
            await self.safe_fill(
                'textarea[name="biography"], textarea[name="about"], #biography',
                self.description_long[:2000],
            )

        # Practice / hospital affiliation
        await self.safe_fill('input[name="hospital"], input[name="affiliation"]', self.company_name)

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
            await self.safe_fill('input[name="phone"]', self.phone)

        # Website
        if self.website:
            await self.safe_fill('input[name="website"]', self.website)

        # Conditions treated
        for condition in ["Depression", "Anxiety Disorders", "PTSD"]:
            await self.safe_click(f'input[value="{condition}"], label:has-text("{condition}")', timeout=1000)

        # Languages
        await self.safe_click('label:has-text("English")', timeout=1000)

        # Board certifications
        await self.safe_fill(
            'input[name="boardCertification"], input[placeholder*="Board"]',
            "American Board of Psychiatry and Neurology",
            timeout=1000,
        )

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
            "platform_name": "WebMD / Medscape",
        }
