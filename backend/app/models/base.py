import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, func
from sqlalchemy import Uuid
from app.db.database import Base


class TimestampMixin:
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class UUIDMixin:
    id = Column(Uuid(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
