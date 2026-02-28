"""SAMHSA Treatment Locator directory automation."""
from __future__ import annotations
import logging
from .base import DirectoryAutomator

logger = logging.getLogger(__name__)


class SAMHSAAutomator(DirectoryAutomator):
    """
    Automates listing a facility in the SAMHSA National Treatment Locator.

    SAMHSA (Substance Abuse and Mental Health Services Administration)
    Facilities are listed at: https://findtreatment.gov/

    Submission process:
    - New facilities submit via SAMHSA's BSAS (Behavioral Health Services Administration System)
    - URL: https://dasis3.samhsa.gov/

    Credential keys:
      - directory_samhsa_email
      - directory_samhsa_password
      - directory_samhsa_facility_id   (SAMHSA-assigned facility code if existing)
    """

    PLATFORM_ID = "samhsa"
    LOGIN_URL = "https://dasis3.samhsa.gov/dasis3/user_login.do"
    PROFILE_URL = "https://dasis3.samhsa.gov/dasis3/facility_edit.do"

    async def login(self) -> bool:
        email = self.credentials.get("directory_samhsa_email", "")
        password = self.credentials.get("directory_samhsa_password", "")
        if not email or not password:
            logger.warning("[samhsa] No credentials stored.")
            return False

        try:
            await self.goto(self.LOGIN_URL)

            await self.wait_and_fill(
                'input[name="userId"], input[name="username"], input[type="text"]',
                email,
            )
            await self.wait_and_fill(
                'input[name="password"], input[type="password"]',
                password,
            )
            await self.wait_and_click('input[type="submit"], button[type="submit"]')
            await self.page.wait_for_timeout(3000)

            # SAMHSA DASIS system uses old-school JSP — check for successful auth
            error_el = await self.page.query_selector('.error-message, .alert-danger, #error')
            if error_el:
                logger.warning("[samhsa] Login error message present.")
                return False

            return "dasis3" in self.page.url
        except Exception as e:
            logger.debug("[samhsa] Login error: %s", e)
            return False

    async def navigate_to_profile(self):
        await self.goto(self.PROFILE_URL)
        await self.page.wait_for_timeout(1500)

    async def fill_profile_fields(self):
        # Facility name
        await self.safe_fill('input[name="facilityName"], input[name="name"]', self.company_name)

        # Facility type — select Mental Health Clinic
        await self.safe_click(
            'select[name="facilityType"] option:has-text("Mental Health"), '
            'label:has-text("Mental Health Clinic")',
            timeout=2000,
        )

        # DBA name
        await self.safe_fill('input[name="dbaName"]', self.company_name, timeout=1000)

        # Address
        addr = self.address
        if addr.get("address"):
            await self.safe_fill('input[name="street"], input[name="address"]', addr.get("address", ""))
        if addr.get("city"):
            await self.safe_fill('input[name="city"]', addr.get("city", ""))
        if addr.get("state"):
            try:
                await self.wait_and_select('select[name="state"]', addr.get("state", ""), timeout=2000)
            except Exception:
                await self.safe_fill('input[name="state"]', addr.get("state", ""), timeout=2000)
        if addr.get("zip"):
            await self.safe_fill('input[name="zip"]', addr.get("zip", ""))

        # Phone / intake line
        if self.phone:
            await self.safe_fill('input[name="phone"], input[name="phoneNumber"]', self.phone)

        # Website
        if self.website:
            await self.safe_fill('input[name="website"]', self.website)

        # Services provided — select mental health services
        for service in [
            "Outpatient",
            "Mental health treatment",
            "Depression",
            "Anxiety",
            "Trauma-related disorders",
        ]:
            await self.safe_click(
                f'input[value*="{service}"], label:has-text("{service}")',
                timeout=1000,
            )

        # Payment accepted — Medicare, Medicaid, Private insurance
        for payment in ["Medicaid", "Medicare", "Private insurance"]:
            await self.safe_click(
                f'input[value*="{payment}"], label:has-text("{payment}")',
                timeout=1000,
            )

        # Languages
        await self.safe_click('input[value="English"], label:has-text("English")', timeout=1000)

        # Ages served
        for age_group in ["Adults", "Young adults"]:
            await self.safe_click(f'input[value*="{age_group}"], label:has-text("{age_group}")', timeout=1000)

        # Telehealth
        await self.safe_click('input[name="telehealth"], label:has-text("Telehealth")', timeout=1000)

    async def submit_profile(self) -> dict:
        await self.safe_click(
            'input[type="submit"][value="Submit"], button[type="submit"], '
            'button:has-text("Submit")',
            timeout=5000,
        )
        await self.page.wait_for_timeout(3000)
        await self.take_screenshot("submitted")

        return {
            "profile_url": "https://findtreatment.gov/",
            "platform_name": "SAMHSA Treatment Locator",
            "note": "SAMHSA listings require manual review by SAMHSA staff before appearing in the locator.",
        }
