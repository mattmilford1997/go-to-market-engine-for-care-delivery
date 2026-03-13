import enum
from sqlalchemy import Column, String, Boolean, JSON, ForeignKey, Enum as SAEnum
from sqlalchemy import Uuid
from app.db.database import Base
from app.models.base import TimestampMixin, UUIDMixin


class UserRole(str, enum.Enum):
    user = "user"
    admin = "admin"


class User(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "users"

    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False)
    role = Column(SAEnum(UserRole), default=UserRole.user)
    is_active = Column(Boolean, default=True)
    company_id = Column(Uuid(as_uuid=False), ForeignKey("companies.id"), nullable=True)
    password_reset_token = Column(String(255), nullable=True)
