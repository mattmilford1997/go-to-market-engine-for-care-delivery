import enum
from sqlalchemy import Column, String, Text, Boolean, JSON, Float, Integer, Enum as SAEnum, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.db.database import Base
from app.models.base import TimestampMixin, UUIDMixin


class SEOReport(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "seo_reports"

    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id"), nullable=False)
    report_type = Column(String(50))  # technical_audit, keyword_gap, competitor, local

    # Technical audit results
    pagespeed_mobile = Column(Integer)
    pagespeed_desktop = Column(Integer)
    core_web_vitals = Column(JSON, default={})
    # {lcp, fid, cls, status: pass/fail}

    crawl_errors = Column(JSON, default=[])
    # [{url, error_type, severity}]

    meta_issues = Column(JSON, default=[])
    # [{url, issue, recommendation}]

    schema_issues = Column(JSON, default=[])
    missing_schema_types = Column(JSON, default=[])

    # Keyword data
    ranking_keywords = Column(JSON, default=[])
    # [{keyword, position, impressions, clicks, ctr, url}]

    keyword_opportunities = Column(JSON, default=[])
    # [{keyword, volume_est, difficulty, intent, recommended_content_type}]

    competitor_gaps = Column(JSON, default=[])
    # [{competitor_url, keywords_they_rank_for, we_dont}]

    # Local SEO
    nap_consistency = Column(JSON, default={})
    gbp_score = Column(Integer)  # 0-100 completeness

    # Recommendations
    recommendations = Column(JSON, default=[])
    # [{priority: high/medium/low, action, expected_impact, module}]

    company = relationship("Company", back_populates="seo_reports")


class DirectoryProfile(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "directory_profiles"

    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id"), nullable=False)
    platform = Column(String(100), nullable=False)
    # google_business_profile, psychology_today, therapyden, healthgrades, zocdoc, vitals, yelp, webmd, samhsa

    profile_url = Column(String(500))
    is_claimed = Column(Boolean, default=False)
    is_created = Column(Boolean, default=False)
    completeness_score = Column(Integer, default=0)  # 0-100
    review_count = Column(Integer, default=0)
    average_rating = Column(Float)
    last_updated = Column(String(50))

    # Generated content
    description_short = Column(Text)  # 50 words
    description_medium = Column(Text)  # 150 words
    description_long = Column(Text)   # 500 words
    provider_bios = Column(JSON, default=[])
    # [{provider_name, bio_first_person, bio_third_person}]

    services_listed = Column(JSON, default=[])
    conditions_listed = Column(JSON, default=[])
    insurance_listed = Column(JSON, default=[])

    # Missing / incomplete fields
    missing_fields = Column(JSON, default=[])
    optimization_score = Column(Integer, default=0)  # 0-100

    # Automation status
    auto_create_status = Column(String(50), default="pending")
    # pending, in_progress, completed, failed, needs_manual, captcha_blocked

    screenshot_url = Column(String(500))
    credentials_stored = Column(Boolean, default=False)

    company = relationship("Company", back_populates="directory_profiles")
