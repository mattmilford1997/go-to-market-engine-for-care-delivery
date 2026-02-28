"""Base class for all directory profile automation scripts."""
from __future__ import annotations

import asyncio
import logging
import os
import random
import tempfile
import time
from dataclasses import dataclass, field
from typing import Any, Optional

logger = logging.getLogger(__name__)


@dataclass
class AutomationResult:
    status: str  # completed | failed | needs_manual | captcha_blocked | captcha_detected
    platform: str
    profile_url: Optional[str] = None
    screenshots: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "status": self.status,
            "platform": self.platform,
            "profile_url": self.profile_url,
            "screenshots": self.screenshots,
            "errors": self.errors,
            "metadata": self.metadata,
        }


class DirectoryAutomator:
    """
    Abstract base class for all healthcare directory profile automators.

    Each platform subclass must implement:
      - login() -> bool
      - navigate_to_profile()
      - fill_profile_fields()
      - submit_profile() -> dict  (returns {"profile_url": str, ...})

    Usage:
        async with GoogleBusinessAutomator(company_data, profile_data, credentials) as bot:
            result = await bot.run()
    """

    PLATFORM_ID: str = "base"

    CAPTCHA_SELECTORS = [
        "#captcha",
        ".g-recaptcha",
        ".h-captcha",
        '[data-sitekey]',
        'iframe[src*="recaptcha"]',
        'iframe[src*="captcha"]',
        'iframe[src*="hcaptcha"]',
        '.cf-challenge-running',
        '#challenge-form',
    ]

    HUMAN_TYPING_DELAY_MS = (60, 180)  # min, max ms between keystrokes

    def __init__(
        self,
        company_data: dict,
        profile_data: dict,
        credentials: dict | None = None,
    ):
        self.company_data = company_data
        self.profile_data = profile_data
        self.credentials = credentials or {}
        self.browser = None
        self.context = None
        self.page = None
        self._pw = None
        self._result = AutomationResult(status="pending", platform=self.PLATFORM_ID)

    # ─── Context manager ──────────────────────────────────────────

    async def __aenter__(self) -> "DirectoryAutomator":
        try:
            from playwright.async_api import async_playwright
            self._pw = await async_playwright().__aenter__()
            self.browser = await self._pw.chromium.launch(
                headless=True,
                args=["--no-sandbox", "--disable-dev-shm-usage"],
            )
            self.context = await self.browser.new_context(
                viewport={"width": 1280, "height": 900},
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/121.0.0.0 Safari/537.36"
                ),
                locale="en-US",
                timezone_id="America/New_York",
            )
            self.page = await self.context.new_page()
            # Block unnecessary resources for speed
            await self.page.route(
                "**/*.{png,jpg,jpeg,gif,svg,woff,woff2,ttf,eot}",
                lambda route: route.abort()
                if route.request.resource_type in ("image", "font")
                else route.continue_(),
            )
        except ImportError:
            logger.warning("Playwright not installed — automation unavailable")
            raise
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.browser:
            try:
                await self.browser.close()
            except Exception:
                pass
        if self._pw:
            try:
                await self._pw.__aexit__(exc_type, exc_val, exc_tb)
            except Exception:
                pass

    # ─── Screenshot helpers ────────────────────────────────────────

    async def take_screenshot(self, name: str) -> str:
        ts = int(time.time())
        path = os.path.join(
            tempfile.gettempdir(),
            f"arche_{self.PLATFORM_ID}_{name}_{ts}.png",
        )
        try:
            await self.page.screenshot(path=path, full_page=False)
            self._result.screenshots.append(path)
        except Exception as e:
            logger.debug("Screenshot failed: %s", e)
        return path

    # ─── CAPTCHA detection ─────────────────────────────────────────

    async def detect_captcha(self) -> bool:
        for selector in self.CAPTCHA_SELECTORS:
            try:
                el = await self.page.query_selector(selector)
                if el:
                    await self.take_screenshot("captcha_detected")
                    return True
            except Exception:
                pass
        return False

    # ─── Human-like interaction helpers ───────────────────────────

    async def human_delay(self, min_ms: int = 200, max_ms: int = 600):
        await asyncio.sleep(random.randint(min_ms, max_ms) / 1000)

    async def wait_and_fill(
        self,
        selector: str,
        value: str,
        timeout: int = 10_000,
        clear_first: bool = True,
    ):
        """Wait for an input, optionally clear it, then type with human-like speed."""
        await self.page.wait_for_selector(selector, timeout=timeout, state="visible")
        if clear_first:
            await self.page.triple_click(selector)
        await self.page.type(selector, value, delay=random.randint(*self.HUMAN_TYPING_DELAY_MS))
        await self.human_delay(100, 300)

    async def wait_and_click(self, selector: str, timeout: int = 10_000):
        await self.page.wait_for_selector(selector, timeout=timeout, state="visible")
        await self.page.click(selector)
        await self.human_delay(200, 500)

    async def wait_and_select(self, selector: str, value: str, timeout: int = 10_000):
        await self.page.wait_for_selector(selector, timeout=timeout)
        await self.page.select_option(selector, value=value)
        await self.human_delay(100, 300)

    async def safe_fill(self, selector: str, value: str, timeout: int = 5_000) -> bool:
        """Fill a field, returning False if not found instead of raising."""
        try:
            await self.wait_and_fill(selector, value, timeout=timeout)
            return True
        except Exception as e:
            logger.debug("safe_fill(%s) skipped: %s", selector, e)
            return False

    async def safe_click(self, selector: str, timeout: int = 5_000) -> bool:
        try:
            await self.wait_and_click(selector, timeout=timeout)
            return True
        except Exception as e:
            logger.debug("safe_click(%s) skipped: %s", selector, e)
            return False

    # ─── Navigation helpers ────────────────────────────────────────

    async def goto(self, url: str, wait_until: str = "domcontentloaded"):
        await self.page.goto(url, wait_until=wait_until, timeout=30_000)
        await self.human_delay(300, 700)

    # ─── Abstract interface ────────────────────────────────────────

    async def login(self) -> bool:
        """Authenticate with the directory platform. Return True on success."""
        raise NotImplementedError(f"{self.__class__.__name__} must implement login()")

    async def navigate_to_profile(self):
        """Navigate to the profile creation or edit page."""
        raise NotImplementedError

    async def fill_profile_fields(self):
        """Fill all profile form fields with company/profile data."""
        raise NotImplementedError

    async def submit_profile(self) -> dict:
        """Submit the form. Returns dict with at least {'profile_url': str}."""
        raise NotImplementedError

    # ─── Main runner ──────────────────────────────────────────────

    async def run(self) -> AutomationResult:
        """
        Execute the full pipeline:
          1. login()
          2. detect_captcha()
          3. navigate_to_profile()
          4. fill_profile_fields()
          5. submit_profile()

        Updates self._result and returns it.
        """
        self._result.platform = self.PLATFORM_ID

        try:
            # Step 1: Login
            logger.info("[%s] Attempting login…", self.PLATFORM_ID)
            login_ok = await self.login()
            if not login_ok:
                self._result.status = "needs_manual"
                self._result.errors.append("Login failed — check credentials in Settings.")
                await self.take_screenshot("login_failed")
                return self._result

            # Step 2: CAPTCHA check post-login
            if await self.detect_captcha():
                self._result.status = "captcha_blocked"
                self._result.errors.append("CAPTCHA detected after login.")
                return self._result

            # Step 3: Navigate
            logger.info("[%s] Navigating to profile page…", self.PLATFORM_ID)
            await self.navigate_to_profile()

            # Step 4: Fill fields
            if await self.detect_captcha():
                self._result.status = "captcha_blocked"
                self._result.errors.append("CAPTCHA detected on profile page.")
                return self._result

            logger.info("[%s] Filling profile fields…", self.PLATFORM_ID)
            await self.fill_profile_fields()

            # Step 5: Submit
            logger.info("[%s] Submitting profile…", self.PLATFORM_ID)
            submit_data = await self.submit_profile()

            self._result.status = "completed"
            self._result.profile_url = submit_data.get("profile_url")
            self._result.metadata.update(submit_data)
            await self.take_screenshot("completed")

        except Exception as exc:
            logger.exception("[%s] Automation error: %s", self.PLATFORM_ID, exc)
            self._result.status = "failed"
            self._result.errors.append(str(exc))
            await self.take_screenshot("error")

        return self._result

    # ─── Convenience properties ────────────────────────────────────

    @property
    def company_name(self) -> str:
        return self.company_data.get("company_name", "")

    @property
    def website(self) -> str:
        return self.company_data.get("website_url", "")

    @property
    def phone(self) -> str:
        locs = self.company_data.get("locations", [])
        if locs and isinstance(locs[0], dict):
            return locs[0].get("phone", "")
        return ""

    @property
    def address(self) -> dict:
        locs = self.company_data.get("locations", [])
        if locs and isinstance(locs[0], dict):
            return locs[0]
        return {}

    @property
    def description_short(self) -> str:
        return self.profile_data.get("description_short", "")

    @property
    def description_medium(self) -> str:
        return self.profile_data.get("description_medium", "")

    @property
    def description_long(self) -> str:
        return self.profile_data.get("description_long", "")

    @property
    def services(self) -> list:
        return self.profile_data.get("services_listed", self.company_data.get("services", []))

    @property
    def specialty(self) -> str:
        return self.company_data.get("specialty_niche", "Mental Health")

    @property
    def primary_provider(self) -> dict:
        providers = self.company_data.get("providers", [])
        if providers and isinstance(providers[0], dict):
            return providers[0]
        return {}
