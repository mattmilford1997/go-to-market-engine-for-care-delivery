"""add referral_target_states to companies

Revision ID: a3f21c9e4d01
Revises: 13b10b5abf97
Create Date: 2026-03-03 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = "a3f21c9e4d01"
down_revision = "13b10b5abf97"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "companies",
        sa.Column("referral_target_states", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("companies", "referral_target_states")
