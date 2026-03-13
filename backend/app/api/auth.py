from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from typing import Optional
import uuid
import secrets

from app.db.database import get_db
from app.models.user import User, UserRole
from app.models.company import Company
from app.core.auth import (
    hash_password, verify_password, create_access_token,
    create_reset_token, decode_token, get_current_user,
)

router = APIRouter(prefix="/auth", tags=["auth"])


# ── Schemas ───────────────────────────────────────────────────────────────────


class RegisterRequest(BaseModel):
    email: str
    password: str
    full_name: str
    company_id: Optional[str] = None


class LoginRequest(BaseModel):
    email: str
    password: str


class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.post("/register")
async def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    """Create a new user account."""
    existing = db.query(User).filter(User.email == payload.email.lower().strip()).first()
    if existing:
        raise HTTPException(status_code=409, detail="An account with this email already exists.")

    if len(payload.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters.")

    # Validate company_id if provided
    company_id = None
    if payload.company_id:
        company = db.query(Company).filter(Company.id == payload.company_id).first()
        if not company:
            raise HTTPException(status_code=404, detail="Company not found.")
        company_id = payload.company_id

    user = User(
        email=payload.email.lower().strip(),
        hashed_password=hash_password(payload.password),
        full_name=payload.full_name.strip(),
        role=UserRole.user,
        company_id=company_id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token({"sub": str(user.id), "role": user.role})

    return {
        "token": token,
        "user": _user_response(user),
    }


@router.post("/login")
async def login(payload: LoginRequest, db: Session = Depends(get_db)):
    """Authenticate and return a JWT token."""
    user = db.query(User).filter(User.email == payload.email.lower().strip()).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is deactivated.")

    token = create_access_token({"sub": str(user.id), "role": user.role})

    return {
        "token": token,
        "user": _user_response(user),
    }


@router.get("/me")
async def me(user: User = Depends(get_current_user)):
    """Return the current authenticated user."""
    return _user_response(user)


@router.post("/forgot-password")
async def forgot_password(payload: ForgotPasswordRequest, db: Session = Depends(get_db)):
    """Generate a password reset token.
    In production, this would send an email. For now, returns the token directly.
    """
    user = db.query(User).filter(User.email == payload.email.lower().strip()).first()
    if not user:
        # Don't reveal whether the email exists
        return {"message": "If an account with that email exists, a reset link has been sent."}

    token = create_reset_token(str(user.id))
    user.password_reset_token = token
    db.commit()

    # In production: send email with reset link containing the token
    return {
        "message": "If an account with that email exists, a reset link has been sent.",
        "reset_token": token,  # Exposed for dev/demo — remove in production
    }


@router.post("/reset-password")
async def reset_password(payload: ResetPasswordRequest, db: Session = Depends(get_db)):
    """Reset password using a valid reset token."""
    decoded = decode_token(payload.token)
    if not decoded or decoded.get("type") != "reset":
        raise HTTPException(status_code=400, detail="Invalid or expired reset token.")

    user = db.query(User).filter(User.id == decoded["sub"]).first()
    if not user or user.password_reset_token != payload.token:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token.")

    if len(payload.new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters.")

    user.hashed_password = hash_password(payload.new_password)
    user.password_reset_token = None
    db.commit()

    return {"message": "Password has been reset successfully."}


@router.post("/change-password")
async def change_password(
    payload: ChangePasswordRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Change password for the current user."""
    if not verify_password(payload.current_password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect.")
    if len(payload.new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters.")

    user.hashed_password = hash_password(payload.new_password)
    db.commit()
    return {"message": "Password changed successfully."}


# ── Admin Endpoints ───────────────────────────────────────────────────────────


@router.get("/admin/users")
async def admin_list_users(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Admin: list all users with stats."""
    if user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Admin access required.")

    users = db.query(User).order_by(User.created_at.desc()).all()
    companies = {str(c.id): c for c in db.query(Company).all()}

    result = []
    for u in users:
        company = companies.get(str(u.company_id)) if u.company_id else None
        result.append({
            **_user_response(u),
            "company_name": company.name if company else None,
            "company_status": company.status if company else None,
            "company_website": company.website_url if company else None,
        })

    return {"users": result, "total": len(result)}


@router.patch("/admin/users/{user_id}")
async def admin_update_user(
    user_id: str,
    payload: dict,
    admin: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Admin: update a user (role, is_active, company_id)."""
    if admin.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Admin access required.")

    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found.")

    allowed_fields = {"role", "is_active", "company_id", "full_name"}
    for field, value in payload.items():
        if field in allowed_fields:
            setattr(target, field, value)

    db.commit()
    db.refresh(target)
    return _user_response(target)


# ── Helpers ───────────────────────────────────────────────────────────────────


def _user_response(user: User) -> dict:
    return {
        "id": str(user.id),
        "email": user.email,
        "full_name": user.full_name,
        "role": user.role,
        "is_active": user.is_active,
        "company_id": str(user.company_id) if user.company_id else None,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }
