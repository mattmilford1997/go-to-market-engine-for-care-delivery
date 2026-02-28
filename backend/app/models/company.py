import uuid
from sqlalchemy import Column, String, Text, Boolean, JSON, Float, Integer, Enum as SAEnum
from sqlalchemy import Uuid
from sqlalchemy.orm import relationship
import enum
from app.db.database import Base
from app.models.base import TimestampMixin, UUIDMixin


class CompanyStatus(str, enum.Enum):
    onboarding = "onboarding"
    ingesting = "ingesting"
    active = "active"
    paused = "paused"


class Company(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "companies"

    name = Column(String(255), nullable=False)
    website_url = Column(String(500), nullable=False)
    slug = Column(String(100), unique=True, nullable=False)
    status = Column(SAEnum(CompanyStatus), default=CompanyStatus.onboarding)

    # Ingested data
    brand_guidelines = Column(JSON, default={})
    # {colors: {primary, secondary, accent}, fonts: {heading, body}, tone: str, imagery_style: str}

    services = Column(JSON, default=[])
    # [{name, description, conditions_treated, duration, cost_range}]

    providers = Column(JSON, default=[])
    # [{name, title, credentials, bio, specialties, headshot_url, npi}]

    locations = Column(JSON, default=[])
    # [{name, address, city, state, zip, phone, hours, maps_url}]

    insurance_accepted = Column(JSON, default=[])
    # [str] — list of insurance plan names

    differentiators = Column(JSON, default=[])
    # [str]

    target_demographics = Column(JSON, default=[])
    # [str]

    competitors = Column(JSON, default=[])
    # [{name, website, reason}]

    specialty_niche = Column(String(500))
    existing_online_presence = Column(JSON, default={})
    # {google_rating, google_reviews, yelp_rating, etc.}

    # Module budgets (monthly, USD)
    budget_google_ads = Column(Float, default=3000.0)
    budget_meta_ads = Column(Float, default=1500.0)
    budget_email = Column(Float, default=97.0)
    budget_fax = Column(Float, default=50.0)
    budget_voicemail = Column(Float, default=100.0)
    budget_mail = Column(Float, default=150.0)
    budget_tts = Column(Float, default=22.0)
    budget_social_boost = Column(Float, default=0.0)

    # Credentials (stored as JSON, encrypted references in production)
    credentials = Column(JSON, default={})
    # {google_ads_key, meta_ads_token, etc.}

    # Settings
    posting_frequency = Column(JSON, default={
        "blog": 2, "facebook": 5, "instagram": 4, "linkedin": 3
    })

    is_pilot = Column(Boolean, default=False)

    # Relationships
    leads = relationship("ReferralLead", back_populates="company", cascade="all, delete-orphan")
    content_items = relationship("ContentItem", back_populates="company", cascade="all, delete-orphan")
    campaigns = relationship("Campaign", back_populates="company", cascade="all, delete-orphan")
    approval_items = relationship("ApprovalItem", back_populates="company", cascade="all, delete-orphan")
    seo_reports = relationship("SEOReport", back_populates="company", cascade="all, delete-orphan")
    directory_profiles = relationship("DirectoryProfile", back_populates="company", cascade="all, delete-orphan")
