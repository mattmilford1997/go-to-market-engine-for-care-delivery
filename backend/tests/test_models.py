"""Tests for SQLAlchemy models — creation, relationships, defaults."""
import uuid
import pytest
from app.models.company import Company, CompanyStatus
from app.models.referral import ReferralLead, Campaign, CampaignEnrollment, LeadStatus, TouchpointChannel, Touchpoint
from app.models.content import ContentItem, ApprovalItem, ContentType, ContentStatus
from app.models.seo import SEOReport, DirectoryProfile


class TestCompanyModel:
    def test_create_company_defaults(self, db):
        company = Company(
            name="Test Clinic",
            website_url="https://testclinic.com",
            slug="test-clinic",
        )
        db.add(company)
        db.commit()
        db.refresh(company)

        assert company.id is not None
        assert company.status == CompanyStatus.onboarding
        assert company.is_pilot is False
        assert company.budget_google_ads == 3000.0
        assert company.budget_meta_ads == 1500.0
        assert company.services == []
        assert company.providers == []
        assert company.locations == []
        assert company.insurance_accepted == []
        assert company.created_at is not None
        assert company.updated_at is not None

    def test_company_status_enum(self, db):
        for status in [CompanyStatus.onboarding, CompanyStatus.ingesting, CompanyStatus.active, CompanyStatus.paused]:
            company = Company(
                name=f"Clinic {status}",
                website_url=f"https://clinic-{status}.com",
                slug=f"clinic-{status}",
                status=status,
            )
            db.add(company)
        db.commit()

    def test_company_json_fields(self, db):
        company = Company(
            name="JSON Clinic",
            website_url="https://json.com",
            slug="json-clinic",
            services=[{"name": "TMS Therapy", "description": "Brain stimulation"}],
            providers=[{"name": "Dr. Smith", "credentials": "MD"}],
            locations=[{"city": "Phoenix", "state": "AZ"}],
            insurance_accepted=["Aetna", "BCBS"],
            differentiators=["Same-week intake"],
            brand_guidelines={"tone": "warm", "primary_color": "#2563EB"},
        )
        db.add(company)
        db.commit()
        db.refresh(company)

        assert len(company.services) == 1
        assert company.services[0]["name"] == "TMS Therapy"
        assert len(company.providers) == 1
        assert company.providers[0]["credentials"] == "MD"
        assert "Aetna" in company.insurance_accepted
        assert company.brand_guidelines["tone"] == "warm"

    def test_company_pilot_flag(self, db):
        company = Company(
            name="Pilot Co",
            website_url="https://pilot.com",
            slug="pilot-co",
            is_pilot=True,
        )
        db.add(company)
        db.commit()
        db.refresh(company)
        assert company.is_pilot is True

    def test_company_budget_fields(self, db):
        company = Company(
            name="Budget Test",
            website_url="https://budget.com",
            slug="budget-test",
            budget_google_ads=5000.0,
            budget_meta_ads=2500.0,
            budget_email=97.0,
            budget_fax=75.0,
            budget_voicemail=150.0,
            budget_mail=200.0,
        )
        db.add(company)
        db.commit()
        db.refresh(company)
        assert company.budget_google_ads == 5000.0
        assert company.budget_meta_ads == 2500.0
        assert company.budget_fax == 75.0

    def test_company_posting_frequency_default(self, db):
        company = Company(
            name="Freq Test",
            website_url="https://freq.com",
            slug="freq-test",
        )
        db.add(company)
        db.commit()
        db.refresh(company)
        assert company.posting_frequency["blog"] == 2
        assert company.posting_frequency["facebook"] == 5


class TestReferralLeadModel:
    def test_create_lead(self, db, created_company):
        lead = ReferralLead(
            company_id=created_company.id,
            npi="1234567890",
            first_name="John",
            last_name="Smith",
            credentials="MD",
            specialty="Family Medicine",
            practice_name="Smith Family Practice",
            fax="602-555-1234",
            phone="602-555-5678",
            email="john.smith@example.com",
            city="Phoenix",
            state="AZ",
            zip_code="85001",
            source="nppes",
        )
        db.add(lead)
        db.commit()
        db.refresh(lead)

        assert lead.id is not None
        assert lead.status == LeadStatus.new
        assert lead.is_suppressed is False
        assert lead.npi == "1234567890"

    def test_lead_status_transitions(self, db, created_company):
        lead = ReferralLead(
            company_id=created_company.id,
            first_name="Jane",
            last_name="Doe",
            source="nppes",
        )
        db.add(lead)
        db.commit()

        lead.status = LeadStatus.contacted
        db.commit()
        db.refresh(lead)
        assert lead.status == LeadStatus.contacted

        lead.status = LeadStatus.engaged
        db.commit()
        db.refresh(lead)
        assert lead.status == LeadStatus.engaged

    def test_lead_suppression(self, db, created_company):
        lead = ReferralLead(
            company_id=created_company.id,
            first_name="Opt",
            last_name="Out",
            source="nppes",
        )
        db.add(lead)
        db.commit()

        lead.is_suppressed = True
        lead.suppression_channel = "email"
        lead.status = LeadStatus.suppressed
        db.commit()
        db.refresh(lead)

        assert lead.is_suppressed is True
        assert lead.suppression_channel == "email"
        assert lead.status == LeadStatus.suppressed

    def test_touchpoint_relationship(self, db, created_company):
        lead = ReferralLead(
            company_id=created_company.id,
            first_name="Touch",
            last_name="Point",
            source="nppes",
        )
        db.add(lead)
        db.flush()

        tp = Touchpoint(
            lead_id=lead.id,
            company_id=created_company.id,
            channel=TouchpointChannel.email,
            status="sent",
            subject="Referral Partnership",
        )
        db.add(tp)
        db.commit()
        db.refresh(lead)

        assert len(lead.touchpoints) == 1
        assert lead.touchpoints[0].channel == TouchpointChannel.email


class TestCampaignModel:
    def test_create_campaign(self, db, created_company):
        campaign = Campaign(
            company_id=created_company.id,
            name="30-Day Referral Blitz",
            module="referral",
            channel="multi",
            status="active",
        )
        db.add(campaign)
        db.commit()
        db.refresh(campaign)

        assert campaign.id is not None
        assert campaign.impressions == 0
        assert campaign.clicks == 0
        assert campaign.spend == 0.0

    def test_campaign_enrollment(self, db, created_company):
        from datetime import date

        campaign = Campaign(
            company_id=created_company.id,
            name="Test Campaign",
            module="referral",
            channel="email",
        )
        lead = ReferralLead(
            company_id=created_company.id,
            first_name="Enroll",
            last_name="Test",
            source="nppes",
        )
        db.add_all([campaign, lead])
        db.flush()

        enrollment = CampaignEnrollment(
            campaign_id=campaign.id,
            lead_id=lead.id,
            current_step=0,
            next_action_date=date.today(),
        )
        db.add(enrollment)
        db.commit()
        db.refresh(campaign)

        assert len(campaign.enrollments) == 1
        assert campaign.enrollments[0].current_step == 0


class TestContentModels:
    def test_create_content_item(self, db, created_company):
        item = ContentItem(
            company_id=created_company.id,
            content_type=ContentType.blog_post,
            status=ContentStatus.pending_review,
            title="Is TMS Covered by Insurance?",
            body="# Is TMS Covered?\n\nMany insurers cover TMS therapy...",
            target_keyword="TMS therapy insurance coverage",
            meta_description="Learn about TMS insurance coverage options.",
        )
        db.add(item)
        db.commit()
        db.refresh(item)

        assert item.id is not None
        assert item.content_type == ContentType.blog_post
        assert item.status == ContentStatus.pending_review

    def test_all_content_types(self, db, created_company):
        for ct in ContentType:
            item = ContentItem(
                company_id=created_company.id,
                content_type=ct,
                title=f"Test {ct.value}",
            )
            db.add(item)
        db.commit()

    def test_approval_item(self, db, created_company):
        item = ContentItem(
            company_id=created_company.id,
            content_type=ContentType.fax_sheet,
            title="Referral Fax Sheet - PCP",
        )
        db.add(item)
        db.flush()

        approval = ApprovalItem(
            company_id=created_company.id,
            content_item_id=item.id,
            item_type="fax_sheet",
            title="Fax Sheet for Primary Care",
            module="referral",
            status="pending",
        )
        db.add(approval)
        db.commit()
        db.refresh(approval)

        assert approval.id is not None
        assert approval.status == "pending"

    def test_content_status_workflow(self, db, created_company):
        item = ContentItem(
            company_id=created_company.id,
            content_type=ContentType.blog_post,
            title="Workflow Test",
            status=ContentStatus.pending_review,
        )
        db.add(item)
        db.commit()

        item.status = ContentStatus.approved
        db.commit()
        db.refresh(item)
        assert item.status == ContentStatus.approved

        item.status = ContentStatus.published
        db.commit()
        db.refresh(item)
        assert item.status == ContentStatus.published


class TestSEOModels:
    def test_create_seo_report(self, db, created_company):
        report = SEOReport(
            company_id=created_company.id,
            report_type="technical_audit",
            pagespeed_mobile=72,
            pagespeed_desktop=89,
            core_web_vitals={"lcp": "2.1s", "cls": "0.05", "fid": "45ms"},
            meta_issues=[{"url": "/", "issue": "missing_h1", "severity": "high"}],
            recommendations=[{"action": "Add H1 tag", "priority": "high"}],
        )
        db.add(report)
        db.commit()
        db.refresh(report)

        assert report.id is not None
        assert report.pagespeed_mobile == 72
        assert report.pagespeed_desktop == 89
        assert report.core_web_vitals["lcp"] == "2.1s"

    def test_create_directory_profile(self, db, created_company):
        profile = DirectoryProfile(
            company_id=created_company.id,
            platform="psychology_today",
            completeness_score=0,
            auto_create_status="pending",
        )
        db.add(profile)
        db.commit()
        db.refresh(profile)

        assert profile.id is not None
        assert profile.is_claimed is False
        assert profile.credentials_stored is False

    def test_directory_profile_score_update(self, db, created_company):
        profile = DirectoryProfile(
            company_id=created_company.id,
            platform="healthgrades",
            description_short="Short desc",
            description_medium="Medium desc with more detail",
            description_long="Full long description",
            completeness_score=75,
        )
        db.add(profile)
        db.commit()
        db.refresh(profile)
        assert profile.completeness_score == 75
