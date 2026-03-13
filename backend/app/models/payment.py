import enum
from sqlalchemy import Column, String, Float, Boolean, JSON, ForeignKey, Enum as SAEnum
from sqlalchemy import Uuid
from sqlalchemy.orm import relationship
from app.db.database import Base
from app.models.base import TimestampMixin, UUIDMixin


class SubscriptionStatus(str, enum.Enum):
    trialing = "trialing"
    active = "active"
    past_due = "past_due"
    canceled = "canceled"
    unpaid = "unpaid"


class PaymentMethod(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "payment_methods"

    company_id = Column(Uuid(as_uuid=False), ForeignKey("companies.id"), nullable=False)
    stripe_customer_id = Column(String(255), nullable=False)
    stripe_payment_method_id = Column(String(255), nullable=False)
    card_brand = Column(String(50))        # visa, mastercard, amex, etc.
    card_last4 = Column(String(4))
    card_exp_month = Column(String(2))
    card_exp_year = Column(String(4))
    is_default = Column(Boolean, default=True)


class Subscription(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "subscriptions"

    company_id = Column(Uuid(as_uuid=False), ForeignKey("companies.id"), nullable=False, unique=True)
    stripe_customer_id = Column(String(255), nullable=False)
    stripe_subscription_id = Column(String(255), unique=True)
    stripe_price_id = Column(String(255))
    status = Column(SAEnum(SubscriptionStatus), default=SubscriptionStatus.trialing)
    plan_name = Column(String(100), default="Pro")
    monthly_amount = Column(Float, default=0.0)
    current_period_end = Column(String(50))  # ISO timestamp from Stripe
    cancel_at_period_end = Column(Boolean, default=False)
    metadata = Column(JSON, default={})
