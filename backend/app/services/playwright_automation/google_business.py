"""Google Business Profile automation via business.google.com."""
from __future__ import annotations
import logging
from .base import DirectoryAutomator

logger = logging.getLogger(__name__)


class GoogleBusinessAutomator(DirectoryAutomator):
    """
    Automates Google Business Profile creation and editing.

    Credential keys expected:
      - directory_google_business_profile_email    (Google account email)
      - directory_google_business_profile_password (Google account password)

    Note: Google often requires 2FA or phone verification for new sign-ins.
    If the account has 2FA enabled, this will mark the run as needs_manual.
    """

    PLATFORM_ID = "google_business_profile"
    BASE_URL = "https://business.google.com"
    LOGIN_URL = "https://accounts.google.com/ServiceLogin"
    MANAGE_URL = "https://business.google.com/manage"

    async def login(self) -> bool:
        email = self.credentials.get("directory_google_business_profile_email", "")
        password = self.credentials.get("directory_google_business_profile_password", "")
        if not email or not password:
            logger.warning("[google_business] No credentials stored.")
            return False

        try:
            await self.goto(self.LOGIN_URL)

            # Enter email
            await self.wait_and_fill('input[type="email"]', email)
            await self.wait_and_click('#identifierNext button, button[jsname="LgbsSe"]')
            await self.page.wait_for_timeout(1500)

            # Check for "phone or email" verification screens
            if await self.page.query_selector('input[type="tel"]'):
                logger.warning("[google_business] Phone verification required — needs manual.")
                return False

            # Enter password
            await self.wait_and_fill('input[type="password"]', password, timeout=8000)
            await self.wait_and_click('#passwordNext button, button[jsname="LgbsSe"]')
            await self.page.wait_for_timeout(2500)

            # Check for 2-step verification challenge
            current_url = self.page.url
            if "challenge" in current_url or "signin/v2/challenge" in current_url:
                logger.warning("[google_business] 2FA challenge detected — needs manual.")
                await self.take_screenshot("2fa_challenge")
                self._result.metadata["needs_2fa"] = True
                return False

            # Check for unusual activity prompt
            if await self.page.query_selector('div[data-challengetype="12"]'):
                logger.warning("[google_business] Unusual activity challenge — needs manual.")
                return False

            # Verify logged in
            await self.page.wait_for_url("**/myaccount**", timeout=5000)
            return True

        except Exception as e:
            logger.debug("[google_business] Login error: %s", e)
            return False

    async def navigate_to_profile(self):
        await self.goto(self.MANAGE_URL)
        await self.page.wait_for_timeout(2000)

        # Check if business exists — if so, navigate to edit
        add_btn = await self.page.query_selector('a[href*="create-business"]')
        if add_btn:
            await add_btn.click()
            await self.page.wait_for_timeout(1000)
        else:
            # Try to find the edit profile button
            edit_btn = await self.page.query_selector('[data-view="EditProfileButton"]')
            if edit_btn:
                await edit_btn.click()

    async def fill_profile_fields(self):
        addr = self.address

        # Business name
        await self.safe_fill('input[aria-label="Business name"]', self.company_name)

        # Business category — try to set mental health related category
        await self.safe_fill('input[aria-label="Business category"]', "Mental Health Clinic")
        await self.human_delay(500, 800)
        # Select first suggestion
        await self.safe_click('.XlWvBb li:first-child')

        # Address fields
        if addr.get("address"):
            await self.safe_fill('input[aria-label="Address line 1"]', addr.get("address", ""))
        if addr.get("city"):
            await self.safe_fill('input[aria-label="City"]', addr.get("city", ""))
        if addr.get("state"):
            await self.safe_fill('input[aria-label="State"]', addr.get("state", ""))
        if addr.get("zip"):
            await self.safe_fill('input[aria-label="ZIP code"]', addr.get("zip", ""))

        # Phone
        if self.phone:
            await self.safe_fill('input[aria-label="Phone number"]', self.phone)

        # Website
        if self.website:
            await self.safe_fill('input[aria-label="Website"]', self.website)

        # Description (if available in the UI)
        await self.safe_fill('textarea[aria-label="Description"]', self.description_medium)

    async def submit_profile(self) -> dict:
        # Click "Apply" or "Save" button
        saved = await self.safe_click('button[aria-label="Save"], button[jsname="V67aGc"]', timeout=5000)
        if not saved:
            await self.safe_click('div[role="button"][aria-label="Apply"]', timeout=5000)

        await self.page.wait_for_timeout(3000)
        await self.take_screenshot("submitted")

        profile_url = self.page.url
        return {
            "profile_url": profile_url,
            "platform_name": "Google Business Profile",
            "note": "Profile submitted — may require verification via postcard or phone.",
        }
