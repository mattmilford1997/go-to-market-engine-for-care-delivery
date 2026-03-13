from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from app.db.database import get_db
from app.core.config import settings
from app.models.company import Company
from app.models.payment import PaymentMethod, Subscription, SubscriptionStatus

router = APIRouter(prefix="/billing", tags=["billing"])


def _get_stripe():
    """Lazily import and configure stripe."""
    if not settings.STRIPE_SECRET_KEY:
        raise HTTPException(status_code=503, detail="Stripe is not configured. Set STRIPE_SECRET_KEY.")
    import stripe
    stripe.api_key = settings.STRIPE_SECRET_KEY
    return stripe


def _get_company_or_404(company_id: str, db: Session) -> Company:
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return company


def _get_or_create_customer(stripe, company: Company, db: Session) -> str:
    """Return existing Stripe customer ID or create a new one."""
    sub = db.query(Subscription).filter(Subscription.company_id == company.id).first()
    if sub and sub.stripe_customer_id:
        return sub.stripe_customer_id

    pm = db.query(PaymentMethod).filter(PaymentMethod.company_id == company.id).first()
    if pm and pm.stripe_customer_id:
        return pm.stripe_customer_id

    customer = stripe.Customer.create(
        name=company.name,
        metadata={"company_id": str(company.id), "website": company.website_url},
    )
    return customer.id


# ── Schemas ───────────────────────────────────────────────────────────────────


class SetupIntentResponse(BaseModel):
    client_secret: str
    publishable_key: str
    customer_id: str


class CreateSubscriptionRequest(BaseModel):
    price_id: Optional[str] = None


class BillingStatusResponse(BaseModel):
    has_payment_method: bool
    subscription_status: Optional[str] = None
    plan_name: Optional[str] = None
    card_brand: Optional[str] = None
    card_last4: Optional[str] = None
    current_period_end: Optional[str] = None
    cancel_at_period_end: bool = False
    stripe_configured: bool = True


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.get("/config")
async def billing_config():
    """Return the publishable key so the frontend can initialize Stripe."""
    if not settings.STRIPE_PUBLISHABLE_KEY:
        raise HTTPException(status_code=503, detail="Stripe is not configured.")
    return {
        "publishable_key": settings.STRIPE_PUBLISHABLE_KEY,
        "configured": True,
    }


@router.get("/{company_id}/status")
async def billing_status(company_id: str, db: Session = Depends(get_db)):
    """Return current billing/payment status for a company."""
    company = _get_company_or_404(company_id, db)
    configured = bool(settings.STRIPE_SECRET_KEY)

    pm = (
        db.query(PaymentMethod)
        .filter(PaymentMethod.company_id == company.id, PaymentMethod.is_default == True)
        .first()
    )
    sub = db.query(Subscription).filter(Subscription.company_id == company.id).first()

    return BillingStatusResponse(
        has_payment_method=pm is not None,
        subscription_status=sub.status if sub else None,
        plan_name=sub.plan_name if sub else None,
        card_brand=pm.card_brand if pm else None,
        card_last4=pm.card_last4 if pm else None,
        current_period_end=sub.current_period_end if sub else None,
        cancel_at_period_end=sub.cancel_at_period_end if sub else False,
        stripe_configured=configured,
    )


@router.post("/{company_id}/setup-intent")
async def create_setup_intent(company_id: str, db: Session = Depends(get_db)):
    """Create a Stripe SetupIntent so the frontend can collect card details."""
    stripe = _get_stripe()
    company = _get_company_or_404(company_id, db)
    customer_id = _get_or_create_customer(stripe, company, db)

    intent = stripe.SetupIntent.create(
        customer=customer_id,
        payment_method_types=["card"],
        metadata={"company_id": str(company.id)},
    )

    return SetupIntentResponse(
        client_secret=intent.client_secret,
        publishable_key=settings.STRIPE_PUBLISHABLE_KEY,
        customer_id=customer_id,
    )


@router.post("/{company_id}/confirm-setup")
async def confirm_setup(company_id: str, db: Session = Depends(get_db)):
    """After the frontend confirms the SetupIntent, sync payment method to DB."""
    stripe = _get_stripe()
    company = _get_company_or_404(company_id, db)
    customer_id = _get_or_create_customer(stripe, company, db)

    # Fetch payment methods from Stripe for this customer
    methods = stripe.PaymentMethod.list(customer=customer_id, type="card")
    if not methods.data:
        raise HTTPException(status_code=400, detail="No payment methods found for this customer.")

    latest = methods.data[0]

    # Mark all existing methods as non-default
    db.query(PaymentMethod).filter(
        PaymentMethod.company_id == company.id
    ).update({"is_default": False})

    # Upsert the payment method
    existing = db.query(PaymentMethod).filter(
        PaymentMethod.stripe_payment_method_id == latest.id
    ).first()

    card = latest.card
    if existing:
        existing.card_brand = card.brand
        existing.card_last4 = card.last4
        existing.card_exp_month = str(card.exp_month)
        existing.card_exp_year = str(card.exp_year)
        existing.is_default = True
    else:
        pm = PaymentMethod(
            company_id=str(company.id),
            stripe_customer_id=customer_id,
            stripe_payment_method_id=latest.id,
            card_brand=card.brand,
            card_last4=card.last4,
            card_exp_month=str(card.exp_month),
            card_exp_year=str(card.exp_year),
            is_default=True,
        )
        db.add(pm)

    # Set as default payment method on the customer
    stripe.Customer.modify(
        customer_id,
        invoice_settings={"default_payment_method": latest.id},
    )

    db.commit()
    return {"status": "ok", "card_brand": card.brand, "card_last4": card.last4}


@router.get("/{company_id}/payment-methods")
async def list_payment_methods(company_id: str, db: Session = Depends(get_db)):
    """List all saved payment methods for a company."""
    company = _get_company_or_404(company_id, db)
    methods = (
        db.query(PaymentMethod)
        .filter(PaymentMethod.company_id == company.id)
        .order_by(PaymentMethod.is_default.desc(), PaymentMethod.created_at.desc())
        .all()
    )
    return {
        "payment_methods": [
            {
                "id": str(m.id),
                "card_brand": m.card_brand,
                "card_last4": m.card_last4,
                "card_exp_month": m.card_exp_month,
                "card_exp_year": m.card_exp_year,
                "is_default": m.is_default,
            }
            for m in methods
        ]
    }


@router.delete("/{company_id}/payment-methods/{method_id}")
async def remove_payment_method(company_id: str, method_id: str, db: Session = Depends(get_db)):
    """Remove a payment method."""
    stripe = _get_stripe()
    company = _get_company_or_404(company_id, db)
    pm = (
        db.query(PaymentMethod)
        .filter(PaymentMethod.id == method_id, PaymentMethod.company_id == company.id)
        .first()
    )
    if not pm:
        raise HTTPException(status_code=404, detail="Payment method not found")

    try:
        stripe.PaymentMethod.detach(pm.stripe_payment_method_id)
    except Exception:
        pass  # Already detached or deleted on Stripe side

    db.delete(pm)
    db.commit()
    return {"status": "ok"}


@router.post("/{company_id}/subscribe")
async def create_subscription(
    company_id: str,
    payload: CreateSubscriptionRequest,
    db: Session = Depends(get_db),
):
    """Create a Stripe subscription for the company."""
    stripe = _get_stripe()
    company = _get_company_or_404(company_id, db)
    customer_id = _get_or_create_customer(stripe, company, db)

    price_id = payload.price_id or settings.STRIPE_PRICE_ID
    if not price_id:
        raise HTTPException(status_code=400, detail="No price ID provided and no default configured.")

    # Check for existing active subscription
    existing = db.query(Subscription).filter(
        Subscription.company_id == company.id,
        Subscription.status.in_([SubscriptionStatus.active, SubscriptionStatus.trialing]),
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="Company already has an active subscription.")

    stripe_sub = stripe.Subscription.create(
        customer=customer_id,
        items=[{"price": price_id}],
        payment_behavior="default_incomplete",
        expand=["latest_invoice.payment_intent"],
        metadata={"company_id": str(company.id)},
    )

    sub = Subscription(
        company_id=str(company.id),
        stripe_customer_id=customer_id,
        stripe_subscription_id=stripe_sub.id,
        stripe_price_id=price_id,
        status=SubscriptionStatus(stripe_sub.status),
        plan_name="Pro",
        monthly_amount=(stripe_sub.items.data[0].price.unit_amount or 0) / 100,
        current_period_end=str(stripe_sub.current_period_end),
    )
    db.add(sub)
    db.commit()

    result = {"status": stripe_sub.status, "subscription_id": stripe_sub.id}
    if stripe_sub.status == "incomplete":
        invoice = stripe_sub.latest_invoice
        if invoice and invoice.payment_intent:
            result["client_secret"] = invoice.payment_intent.client_secret
    return result


@router.post("/{company_id}/cancel-subscription")
async def cancel_subscription(company_id: str, db: Session = Depends(get_db)):
    """Cancel subscription at end of current billing period."""
    stripe = _get_stripe()
    company = _get_company_or_404(company_id, db)
    sub = db.query(Subscription).filter(
        Subscription.company_id == company.id,
        Subscription.status.in_([SubscriptionStatus.active, SubscriptionStatus.trialing]),
    ).first()
    if not sub:
        raise HTTPException(status_code=404, detail="No active subscription found.")

    stripe.Subscription.modify(sub.stripe_subscription_id, cancel_at_period_end=True)
    sub.cancel_at_period_end = True
    db.commit()
    return {"status": "ok", "cancel_at_period_end": True}


@router.post("/{company_id}/reactivate-subscription")
async def reactivate_subscription(company_id: str, db: Session = Depends(get_db)):
    """Reactivate a subscription that was set to cancel at period end."""
    stripe = _get_stripe()
    company = _get_company_or_404(company_id, db)
    sub = db.query(Subscription).filter(
        Subscription.company_id == company.id,
        Subscription.cancel_at_period_end == True,
    ).first()
    if not sub:
        raise HTTPException(status_code=404, detail="No canceling subscription found.")

    stripe.Subscription.modify(sub.stripe_subscription_id, cancel_at_period_end=False)
    sub.cancel_at_period_end = False
    db.commit()
    return {"status": "ok", "cancel_at_period_end": False}


@router.post("/webhooks/stripe")
async def stripe_webhook(request: Request, db: Session = Depends(get_db)):
    """Handle Stripe webhook events."""
    stripe = _get_stripe()
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")

    if settings.STRIPE_WEBHOOK_SECRET and sig_header:
        try:
            event = stripe.Webhook.construct_event(
                payload, sig_header, settings.STRIPE_WEBHOOK_SECRET
            )
        except (ValueError, stripe.error.SignatureVerificationError):
            raise HTTPException(status_code=400, detail="Invalid webhook signature")
    else:
        import json
        event = json.loads(payload)

    event_type = event.get("type") if isinstance(event, dict) else event.type
    data = event.get("data", {}).get("object", {}) if isinstance(event, dict) else event.data.object

    if event_type == "customer.subscription.updated":
        _handle_subscription_update(data, db)
    elif event_type == "customer.subscription.deleted":
        _handle_subscription_deleted(data, db)
    elif event_type == "invoice.payment_failed":
        _handle_payment_failed(data, db)

    return {"received": True}


def _handle_subscription_update(data, db: Session):
    sub_id = data.get("id") if isinstance(data, dict) else data.id
    sub = db.query(Subscription).filter(Subscription.stripe_subscription_id == sub_id).first()
    if not sub:
        return

    status = data.get("status") if isinstance(data, dict) else data.status
    cancel = data.get("cancel_at_period_end") if isinstance(data, dict) else data.cancel_at_period_end
    period_end = data.get("current_period_end") if isinstance(data, dict) else data.current_period_end

    try:
        sub.status = SubscriptionStatus(status)
    except ValueError:
        pass
    sub.cancel_at_period_end = bool(cancel)
    if period_end:
        sub.current_period_end = str(period_end)
    db.commit()


def _handle_subscription_deleted(data, db: Session):
    sub_id = data.get("id") if isinstance(data, dict) else data.id
    sub = db.query(Subscription).filter(Subscription.stripe_subscription_id == sub_id).first()
    if sub:
        sub.status = SubscriptionStatus.canceled
        db.commit()


def _handle_payment_failed(data, db: Session):
    sub_id = data.get("subscription") if isinstance(data, dict) else getattr(data, "subscription", None)
    if not sub_id:
        return
    sub = db.query(Subscription).filter(Subscription.stripe_subscription_id == sub_id).first()
    if sub:
        sub.status = SubscriptionStatus.past_due
        db.commit()
