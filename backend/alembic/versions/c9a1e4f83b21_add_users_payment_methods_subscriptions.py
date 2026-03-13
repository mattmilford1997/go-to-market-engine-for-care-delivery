"""add users, payment_methods, and subscriptions tables

Revision ID: c9a1e4f83b21
Revises: b7e3d9f12c45
Create Date: 2026-03-12 00:00:00.000000

Creates the tables required by the auth system and Stripe billing integration
that were added in the payment-integration PR but were missing an Alembic
migration, causing the app to crash on startup when the seed function tried
to insert User records into a non-existent table.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "c9a1e4f83b21"
down_revision = "b7e3d9f12c45"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── users ──────────────────────────────────────────────────────────────
    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("hashed_password", sa.String(length=255), nullable=False),
        sa.Column("full_name", sa.String(length=255), nullable=False),
        sa.Column(
            "role",
            sa.Enum("user", "admin", name="userrole"),
            nullable=True,
        ),
        sa.Column("is_active", sa.Boolean(), nullable=True),
        sa.Column("company_id", sa.Uuid(), sa.ForeignKey("companies.id"), nullable=True),
        sa.Column("password_reset_token", sa.String(length=255), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    # ── payment_methods ────────────────────────────────────────────────────
    op.create_table(
        "payment_methods",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("company_id", sa.Uuid(), sa.ForeignKey("companies.id"), nullable=False),
        sa.Column("stripe_customer_id", sa.String(length=255), nullable=False),
        sa.Column("stripe_payment_method_id", sa.String(length=255), nullable=False),
        sa.Column("card_brand", sa.String(length=50), nullable=True),
        sa.Column("card_last4", sa.String(length=4), nullable=True),
        sa.Column("card_exp_month", sa.String(length=2), nullable=True),
        sa.Column("card_exp_year", sa.String(length=4), nullable=True),
        sa.Column("is_default", sa.Boolean(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    # ── subscriptions ──────────────────────────────────────────────────────
    op.create_table(
        "subscriptions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("company_id", sa.Uuid(), sa.ForeignKey("companies.id"), nullable=False),
        sa.Column("stripe_customer_id", sa.String(length=255), nullable=False),
        sa.Column("stripe_subscription_id", sa.String(length=255), nullable=True),
        sa.Column("stripe_price_id", sa.String(length=255), nullable=True),
        sa.Column(
            "status",
            sa.Enum(
                "trialing", "active", "past_due", "canceled", "unpaid",
                name="subscriptionstatus",
            ),
            nullable=True,
        ),
        sa.Column("plan_name", sa.String(length=100), nullable=True),
        sa.Column("monthly_amount", sa.Float(), nullable=True),
        sa.Column("current_period_end", sa.String(length=50), nullable=True),
        sa.Column("cancel_at_period_end", sa.Boolean(), nullable=True),
        sa.Column("metadata", sa.JSON(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("company_id"),
        sa.UniqueConstraint("stripe_subscription_id"),
    )

    # ── Enable RLS on the new tables (consistent with b7e3d9f12c45) ────────
    from sqlalchemy import text
    conn = op.get_bind()
    for table in ("users", "payment_methods", "subscriptions"):
        conn.execute(text(f"ALTER TABLE public.{table} ENABLE ROW LEVEL SECURITY;"))
        conn.execute(text(f"ALTER TABLE public.{table} FORCE ROW LEVEL SECURITY;"))
        conn.execute(text(f"DROP POLICY IF EXISTS deny_anon_access ON public.{table};"))
        conn.execute(text(f"DROP POLICY IF EXISTS deny_authenticated_access ON public.{table};"))
        conn.execute(text(f"""
            CREATE POLICY deny_anon_access ON public.{table}
                AS RESTRICTIVE FOR ALL TO anon USING (false);
        """))
        conn.execute(text(f"""
            CREATE POLICY deny_authenticated_access ON public.{table}
                AS RESTRICTIVE FOR ALL TO authenticated USING (false);
        """))


def downgrade() -> None:
    from sqlalchemy import text
    conn = op.get_bind()
    for table in ("users", "payment_methods", "subscriptions"):
        conn.execute(text(f"DROP POLICY IF EXISTS deny_anon_access ON public.{table};"))
        conn.execute(text(f"DROP POLICY IF EXISTS deny_authenticated_access ON public.{table};"))
        conn.execute(text(f"ALTER TABLE public.{table} NO FORCE ROW LEVEL SECURITY;"))
        conn.execute(text(f"ALTER TABLE public.{table} DISABLE ROW LEVEL SECURITY;"))

    op.drop_table("subscriptions")
    op.drop_table("payment_methods")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
    op.execute("DROP TYPE IF EXISTS subscriptionstatus;")
    op.execute("DROP TYPE IF EXISTS userrole;")
