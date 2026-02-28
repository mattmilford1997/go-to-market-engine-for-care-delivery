import enum
from sqlalchemy import Column, String, Text, Boolean, JSON, Float, Integer, Enum as SAEnum, ForeignKey, Date
from sqlalchemy import Uuid
from sqlalchemy.orm import relationship
from app.db.database import Base
from app.models.base import TimestampMixin, UUIDMixin


class LeadStatus(str, enum.Enum):
    new = "new"
    contacted = "contacted"
    engaged = "engaged"
    referring = "referring"
    inactive = "inactive"
    suppressed = "suppressed"


class TouchpointChannel(str, enum.Enum):
    email = "email"
    fax = "fax"
    voicemail = "voicemail"
    mail = "mail"
    linkedin = "linkedin"


class ReferralLead(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "referral_leads"

    company_id = Column(Uuid(as_uuid=False), ForeignKey("companies.id"), nullable=False)

    # Provider identity
    npi = Column(String(20), unique=False)
    first_name = Column(String(100))
    last_name = Column(String(100))
    credentials = Column(String(50))  # MD, DO, LCSW, etc.
    specialty = Column(String(200))
    practice_name = Column(String(300))

    # Contact info
    fax = Column(String(20))
    phone = Column(String(20))
    email = Column(String(300))
    address = Column(String(500))
    city = Column(String(100))
    state = Column(String(2))
    zip_code = Column(String(10))

    # Enrichment
    linkedin_url = Column(String(500))
    website = Column(String(500))
    source = Column(String(50), default="nppes")  # nppes, csv_upload, manual

    # Status
    status = Column(SAEnum(LeadStatus), default=LeadStatus.new)
    is_suppressed = Column(Boolean, default=False)
    suppression_channel = Column(String(50))  # which channel they opted out on

    # Relationships
    company = relationship("Company", back_populates="leads")
    touchpoints = relationship("Touchpoint", back_populates="lead", cascade="all, delete-orphan")
    campaign_enrollments = relationship("CampaignEnrollment", back_populates="lead")


class Touchpoint(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "touchpoints"

    lead_id = Column(Uuid(as_uuid=False), ForeignKey("referral_leads.id"), nullable=False)
    company_id = Column(Uuid(as_uuid=False), ForeignKey("companies.id"), nullable=False)

    channel = Column(SAEnum(TouchpointChannel), nullable=False)
    direction = Column(String(10), default="outbound")  # outbound / inbound
    status = Column(String(50))  # sent, delivered, opened, clicked, replied, failed
    subject = Column(String(500))
    body_preview = Column(Text)
    external_id = Column(String(200))  # ID from the sending platform
    extra_data = Column(JSON, default={})

    lead = relationship("ReferralLead", back_populates="touchpoints")


class Campaign(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "campaigns"

    company_id = Column(Uuid(as_uuid=False), ForeignKey("companies.id"), nullable=False)
    name = Column(String(300), nullable=False)
    module = Column(String(50))  # paid_ads, referral, content, seo, profiles
    channel = Column(String(50))  # google, meta, email, fax, voicemail, mail, blog, etc.
    status = Column(String(50), default="draft")  # draft, active, paused, completed
    external_id = Column(String(200))  # ID in Google Ads, Meta, Instantly, etc.

    # Performance
    impressions = Column(Integer, default=0)
    clicks = Column(Integer, default=0)
    form_submissions = Column(Integer, default=0)
    spend = Column(Float, default=0.0)
    budget_cap = Column(Float, default=0.0)

    settings = Column(JSON, default={})

    company = relationship("Company", back_populates="campaigns")
    enrollments = relationship("CampaignEnrollment", back_populates="campaign")


class CampaignEnrollment(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "campaign_enrollments"

    campaign_id = Column(Uuid(as_uuid=False), ForeignKey("campaigns.id"), nullable=False)
    lead_id = Column(Uuid(as_uuid=False), ForeignKey("referral_leads.id"), nullable=False)
    current_step = Column(Integer, default=0)
    next_action_date = Column(Date)
    status = Column(String(50), default="active")

    campaign = relationship("Campaign", back_populates="enrollments")
    lead = relationship("ReferralLead", back_populates="campaign_enrollments")
