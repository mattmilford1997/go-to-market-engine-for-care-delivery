"""Playwright-based directory profile automation for healthcare platforms."""
from .base import DirectoryAutomator, AutomationResult
from .google_business import GoogleBusinessAutomator
from .psychology_today import PsychologyTodayAutomator
from .therapy_den import TherapyDenAutomator
from .healthgrades import HealthgradesAutomator
from .zocdoc import ZocdocAutomator
from .vitals import VitalsAutomator
from .yelp import YelpAutomator
from .webmd import WebMDAutomator
from .samhsa import SAMHSAAutomator

PLATFORM_AUTOMATORS = {
    "google_business_profile": GoogleBusinessAutomator,
    "psychology_today": PsychologyTodayAutomator,
    "therapyden": TherapyDenAutomator,
    "healthgrades": HealthgradesAutomator,
    "zocdoc": ZocdocAutomator,
    "vitals": VitalsAutomator,
    "yelp": YelpAutomator,
    "webmd": WebMDAutomator,
    "samhsa": SAMHSAAutomator,
}


def get_automator(platform: str, company_data: dict, profile_data: dict, credentials: dict) -> DirectoryAutomator:
    """Factory: return the appropriate automator for the given platform."""
    cls = PLATFORM_AUTOMATORS.get(platform)
    if not cls:
        raise ValueError(f"No automator registered for platform: {platform}")
    return cls(company_data=company_data, profile_data=profile_data, credentials=credentials)


__all__ = [
    "DirectoryAutomator",
    "AutomationResult",
    "GoogleBusinessAutomator",
    "PsychologyTodayAutomator",
    "TherapyDenAutomator",
    "HealthgradesAutomator",
    "ZocdocAutomator",
    "VitalsAutomator",
    "YelpAutomator",
    "WebMDAutomator",
    "SAMHSAAutomator",
    "PLATFORM_AUTOMATORS",
    "get_automator",
]
