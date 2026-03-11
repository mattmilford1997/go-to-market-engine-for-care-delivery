"""enable row level security on all public tables

Revision ID: b7e3d9f12c45
Revises: a3f21c9e4d01
Create Date: 2026-03-11 00:00:00.000000

This migration fixes the Supabase security linter errors:
  rls_disabled_in_public — 10 tables in the public schema had RLS disabled.

Architecture context:
  - All data access goes through the FastAPI backend, which connects as the
    Supabase service-role user (bypasses RLS by design).
  - The Supabase anon/authenticated roles are NOT used for direct table access.
  - Therefore we enable RLS on every table and add RESTRICTIVE DENY-ALL policies
    for the `anon` and `authenticated` roles, ensuring that any accidental direct
    PostgREST / Supabase client access is blocked.
  - The `service_role` (used by the backend) bypasses RLS automatically in
    Supabase, so no additional policy is needed for it.
  - `alembic_version` is an internal Alembic table; RLS is enabled to prevent
    any external reads via PostgREST.
"""
from alembic import op
from sqlalchemy import text

# Tables flagged by the Supabase security linter
TABLES = [
    "referral_leads",
    "companies",
    "campaigns",
    "content_items",
    "seo_reports",
    "directory_profiles",
    "touchpoints",
    "campaign_enrollments",
    "approval_items",
    "alembic_version",
]

revision = "b7e3d9f12c45"
down_revision = "a3f21c9e4d01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Enable RLS on all affected tables and add deny-all policies for anon/authenticated."""
    conn = op.get_bind()

    for table in TABLES:
        # Enable Row Level Security
        conn.execute(text(f"ALTER TABLE public.{table} ENABLE ROW LEVEL SECURITY;"))

        # Force RLS even for table owners (belt-and-suspenders)
        conn.execute(text(f"ALTER TABLE public.{table} FORCE ROW LEVEL SECURITY;"))

        # Drop any pre-existing policies to avoid conflicts on re-run
        conn.execute(text(f"DROP POLICY IF EXISTS deny_anon_access ON public.{table};"))
        conn.execute(text(f"DROP POLICY IF EXISTS deny_authenticated_access ON public.{table};"))

        # Deny all access to the anon role (unauthenticated PostgREST requests)
        conn.execute(text(f"""
            CREATE POLICY deny_anon_access ON public.{table}
                AS RESTRICTIVE
                FOR ALL
                TO anon
                USING (false);
        """))

        # Deny all access to the authenticated role
        # (direct Supabase client calls with a user JWT are also blocked —
        #  all legitimate access must go through the FastAPI backend which
        #  uses the service_role key and bypasses RLS)
        conn.execute(text(f"""
            CREATE POLICY deny_authenticated_access ON public.{table}
                AS RESTRICTIVE
                FOR ALL
                TO authenticated
                USING (false);
        """))


def downgrade() -> None:
    """Remove RLS policies and disable RLS on all affected tables."""
    conn = op.get_bind()

    for table in TABLES:
        conn.execute(text(f"DROP POLICY IF EXISTS deny_anon_access ON public.{table};"))
        conn.execute(text(f"DROP POLICY IF EXISTS deny_authenticated_access ON public.{table};"))
        conn.execute(text(f"ALTER TABLE public.{table} NO FORCE ROW LEVEL SECURITY;"))
        conn.execute(text(f"ALTER TABLE public.{table} DISABLE ROW LEVEL SECURITY;"))
