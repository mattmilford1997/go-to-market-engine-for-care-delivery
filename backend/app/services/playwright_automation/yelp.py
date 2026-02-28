"""Yelp for Business automation."""
from __future__ import annotations
import logging
from .base import DirectoryAutomator

logger = logging.getLogger(__name__)


class YelpAutomator(DirectoryAutomator):
    """
    Automates claiming/editing a Yelp business listing.

    Credential keys:
      - directory_yelp_email
      - directory_yelp_password

    Biz portal: https://biz.yelp.com/
    """

    PLATFORM_ID = "yelp"
    LOGIN_URL = "https://biz.yelp.com/login"
    DASHBOARD_URL = "https://biz.yelp.com/biz_info"
    PROFILE_URL = "https://biz.yelp.com/biz_info"

    async def login(self) -> bool:
        email = self.credentials.get("directory_yelp_email", "")
        password = self.credentials.get("directory_yelp_password", "")
        if not email or not password:
            logger.warning("[yelp] No credentials stored.")
            return False

        try:
            await self.goto(self.LOGIN_URL)

            await self.wait_and_fill('input[name="email"], input[type="email"]', email)
            await self.wait_and_fill('input[name="password"]', password)
            await self.wait_and_click('button[type="submit"]')
            await self.page.wait_for_timeout(3000)

            # Yelp may show CAPTCHA or 2FA
            if await self.detect_captcha():
                return False

            return "biz.yelp.com" in self.page.url and "login" not in self.page.url
        except Exception as e:
            logger.debug("[yelp] Login error: %s", e)
            return False

    async def navigate_to_profile(self):
        await self.goto(self.PROFILE_URL)
        await self.page.wait_for_timeout(1500)

        # Click "Business Information" tab if present
        await self.safe_click('a:has-text("Business Info"), a:has-text("Business Information")', timeout=3000)

    async def fill_profile_fields(self):
        # Business name
        await self.safe_fill('input[name="name"], input#name', self.company_name)

        # Categories — search and select mental health
        await self.safe_fill(
            'input[placeholder*="category"], input[name*="category"]',
            "Mental Health",
        )
        await self.safe_click('li:has-text("Mental Health"), [data-option="mental-health"]', timeout=2000)

        # About / from the business
        if self.description_medium:
            await self.safe_fill(
                'textarea[name="description"], textarea[placeholder*="About"], textarea#business_description',
                self.description_medium[:1500],
            )

        # Address
        addr = self.address
        if addr.get("address"):
            await self.safe_fill('input[name="address1"]', addr.get("address", ""))
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

        # Website
        if self.website:
            await self.safe_fill('input[name="website"]', self.website)

        # Business hours — set Mon-Fri 9am-5pm as default
        for day_btn in ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]:
            await self.safe_click(f'button:has-text("{day_btn}"), label:has-text("{day_btn}")', timeout=1000)

        # Amenities / attributes — check applicable
        await self.safe_click('label:has-text("Accepts Insurance"), input[name*="insurance"]', timeout=1000)
        await self.safe_click('label:has-text("Telehealth"), label:has-text("Online Appointments")', timeout=1000)

    async def submit_profile(self) -> dict:
        await self.safe_click('button[type="submit"]:has-text("Save"), button:has-text("Save Changes")', timeout=5000)
        await self.page.wait_for_timeout(2500)
        await self.take_screenshot("saved")

        profile_url = self.page.url
        return {
            "profile_url": profile_url,
            "platform_name": "Yelp",
        }
