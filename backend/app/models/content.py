import enum
from sqlalchemy import Column, String, Text, Boolean, JSON, Integer, Enum as SAEnum, ForeignKey, Date
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.db.database import Base
from app.models.base import TimestampMixin, UUIDMixin


class ContentType(str, enum.Enum):
    blog_post = "blog_post"
    social_facebook = "social_facebook"
    social_instagram = "social_instagram"
    social_linkedin = "social_linkedin"
    ad_copy_google = "ad_copy_google"
    ad_copy_meta = "ad_copy_meta"
    ad_creative_meta = "ad_creative_meta"
    fax_sheet = "fax_sheet"
    voicemail_script = "voicemail_script"
    postcard = "postcard"
    email_sequence = "email_sequence"
    directory_bio = "directory_bio"


class ContentStatus(str, enum.Enum):
    draft = "draft"
    pending_review = "pending_review"
    approved = "approved"
    rejected = "rejected"
    published = "published"
    scheduled = "scheduled"


class ContentItem(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "content_items"

    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id"), nullable=False)
    content_type = Column(SAEnum(ContentType), nullable=False)
    status = Column(SAEnum(ContentStatus), default=ContentStatus.pending_review)

    title = Column(String(500))
    body = Column(Text)
    extra_data = Column(JSON, default={})
    # For blog: {target_keyword, meta_description, slug, word_count, schema_markup}
    # For social: {platform, hashtags, image_prompt, scheduled_at}
    # For ads: {headlines, descriptions, extensions, campaign_id}
    # For fax: {pdf_url, target_specialty}
    # For voicemail: {audio_url, duration_seconds, variant_number}
    # For postcard: {design_url, qr_code_url, tracking_utm}

    asset_url = Column(String(1000))  # Supabase storage URL for generated files
    published_url = Column(String(1000))  # URL after publishing
    published_at = Column(String(50))  # ISO datetime string
    scheduled_for = Column(String(50))  # ISO datetime string

    rejection_reason = Column(Text)
    reviewer_notes = Column(Text)

    # SEO fields (blog posts)
    target_keyword = Column(String(300))
    meta_description = Column(String(200))

    company = relationship("Company", back_populates="content_items")


class ApprovalItem(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "approval_items"

    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id"), nullable=False)
    content_item_id = Column(UUID(as_uuid=True), ForeignKey("content_items.id"), nullable=True)
    item_type = Column(String(100))  # ad_creative, blog_post, social_post, email, fax, voicemail, postcard, directory_profile
    title = Column(String(500))
    preview_data = Column(JSON, default={})
    status = Column(String(50), default="pending")  # pending, approved, rejected
    reviewer_notes = Column(Text)
    module = Column(String(50))

    company = relationship("Company", back_populates="approval_items")
