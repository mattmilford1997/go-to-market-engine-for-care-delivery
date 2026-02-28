"""Psychology Today therapist directory automation."""
from __future__ import annotations
import logging
from .base import DirectoryAutomator

logger = logging.getLogger(__name__)


class PsychologyTodayAutomator(DirectoryAutomator):
    """
    Automates creating/editing a Psychology Today therapist profile.

    Credential keys expected:
      - directory_psychology_today_email
      - directory_psychology_today_password

    URL: https://www.psychologytoday.com/us/therapists/submit
    Members manage their listings at: https://therapists.psychologytoday.com/
    """

    PLATFORM_ID = "psychology_today"
    LOGIN_URL = "https://therapists.psychologytoday.com/login"
    PROFILE_URL = "https://therapists.psychologytoday.com/provider/edit"
    SIGNUP_URL = "https://therapists.psychologytoday.com/signup"

    async def login(self) -> bool:
        email = self.credentials.get("directory_psychology_today_email", "")
        password = self.credentials.get("directory_psychology_today_password", "")
        if not email or not password:
            logger.warning("[psychology_today] No credentials stored.")
            return False

        try:
            await self.goto(self.LOGIN_URL)

            await self.wait_and_fill('#member-login-email, input[name="email"]', email)
            await self.wait_and_fill('#member-login-password, input[name="password"]', password)
            await self.wait_and_click('button[type="submit"], input[type="submit"]')
            await self.page.wait_for_timeout(2500)

            # Verify login success
            if "login" in self.page.url.lower() or "error" in self.page.url.lower():
                logger.warning("[psychology_today] Login may have failed. URL: %s", self.page.url)
                return False

            return True
        except Exception as e:
            logger.debug("[psychology_today] Login error: %s", e)
            return False

    async def navigate_to_profile(self):
        await self.goto(self.PROFILE_URL)
        await self.page.wait_for_timeout(1500)

        # If redirected to login, we're not authenticated
        if "login" in self.page.url.lower():
            raise RuntimeError("Redirected to login — authentication failed.")

    async def fill_profile_fields(self):
        # Name
        provider = self.primary_provider
        if provider.get("name"):
            full_name = provider["name"].split()
            if len(full_name) >= 2:
                await self.safe_fill('input[name="first_name"], #first_name', full_name[0])
                await self.safe_fill('input[name="last_name"], #last_name', " ".join(full_name[1:]))

        # Credentials / license
        if provider.get("credentials"):
            await self.safe_fill('input[name="credentials"], #credentials', provider.get("credentials", ""))

        # Specialty / headline
        await self.safe_fill('input[name="headline"], #headline', f"{self.specialty} Specialist")

        # Profile statement / bio (long-form description)
        if self.description_long:
            await self.safe_fill(
                'textarea[name="statement"], textarea[name="bio"], #profile-statement',
                self.description_long[:2000],
            )

        # Specialties (multi-select checkboxes or tags)
        # Click common mental health specialty checkboxes
        for specialty_label in ["Depression", "Anxiety", "Trauma", "PTSD"]:
            await self.safe_click(f'label:has-text("{specialty_label}")', timeout=2000)

        # Location / address
        addr = self.address
        if addr.get("city"):
            await self.safe_fill('input[name="city"], #city', addr.get("city", ""))
        if addr.get("state"):
            await self.safe_fill('select[name="state"], #state', addr.get("state", ""))
        if addr.get("zip"):
            await self.safe_fill('input[name="zip"], #zip', addr.get("zip", ""))

        # Phone
        if self.phone:
            await self.safe_fill('input[name="phone"], #phone', self.phone)

        # Website
        if self.website:
            await self.safe_fill('input[name="website"], #website', self.website)

        # Insurance accepted
        insurance_list = self.company_data.get("insurance_accepted", [])
        for ins in insurance_list[:5]:
            if isinstance(ins, str):
                await self.safe_click(f'label:has-text("{ins}")', timeout=1000)
            elif isinstance(ins, dict):
                await self.safe_click(f'label:has-text("{ins.get("name", ins.get("carrier", ""))}")', timeout=1000)

    async def submit_profile(self) -> dict:
        # Save profile
        await self.safe_click(
            'button[type="submit"]:has-text("Save"), button:has-text("Update Profile"), '
            'input[type="submit"][value="Save"]',
            timeout=5000,
        )
        await self.page.wait_for_timeout(2000)
        await self.take_screenshot("saved")

        return {
            "profile_url": self.page.url,
            "platform_name": "Psychology Today",
        }
