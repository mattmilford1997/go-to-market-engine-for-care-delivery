"""Integration tests for /referral API routes."""
import io
import pytest
from unittest.mock import patch, AsyncMock
from app.models.referral import ReferralLead, LeadStatus


@pytest.fixture
def leads(db, created_company):
    """Seed referral leads for testing."""
    records = []
    specialties = ["Family Medicine", "Internal Medicine", "Psychiatry", "Psychology", "LCSW"]
    for i, specialty in enumerate(specialties):
        lead = ReferralLead(
            company_id=created_company.id,
            npi=f"111111111{i}",
            first_name=f"Dr{i}",
            last_name=f"Provider{i}",
            credentials="MD" if i < 3 else "LCSW",
            specialty=specialty,
            practice_name=f"Practice {i}",
            city="Phoenix",
            state="AZ",
            fax=f"602-555-{i:04d}",
            email=f"dr{i}@example.com",
            source="nppes",
        )
        db.add(lead)
        records.append(lead)
    db.commit()
    return records


class TestLeadList:
    def test_list_leads_empty(self, client, created_company):
        resp = client.get(f"/api/v1/referral/{created_company.id}/leads")
        assert resp.status_code == 200
        assert resp.json()["total"] == 0
        assert resp.json()["leads"] == []

    def test_list_leads_with_data(self, client, created_company, leads):
        resp = client.get(f"/api/v1/referral/{created_company.id}/leads")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == len(leads)
        assert len(data["leads"]) == len(leads)

    def test_list_leads_filter_by_status(self, client, created_company, leads, db):
        leads[0].status = LeadStatus.contacted
        db.commit()
        resp = client.get(f"/api/v1/referral/{created_company.id}/leads?status=contacted")
        assert resp.status_code == 200
        assert all(l["status"] == "contacted" for l in resp.json()["leads"])

    def test_list_leads_filter_by_state(self, client, created_company, leads):
        resp = client.get(f"/api/v1/referral/{created_company.id}/leads?state=AZ")
        assert resp.status_code == 200
        data = resp.json()
        assert all(l.get("state") == "AZ" for l in data["leads"] if l.get("state"))

    def test_lead_has_required_fields(self, client, created_company, leads):
        resp = client.get(f"/api/v1/referral/{created_company.id}/leads")
        lead = resp.json()["leads"][0]
        for field in ("id", "npi", "first_name", "last_name", "specialty", "status", "source"):
            assert field in lead

    def test_get_single_lead(self, client, created_company, leads):
        lead_id = str(leads[0].id)
        resp = client.get(f"/api/v1/referral/{created_company.id}/leads/{lead_id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == lead_id
        assert "touchpoints" in data

    def test_get_nonexistent_lead_404(self, client, created_company):
        import uuid
        resp = client.get(f"/api/v1/referral/{created_company.id}/leads/{uuid.uuid4()}")
        assert resp.status_code == 404


class TestLeadOperations:
    def test_generate_leads_starts_background_task(self, client, created_company):
        with patch("app.api.modules.referral._generate_leads_bg", new_callable=AsyncMock):
            resp = client.post(f"/api/v1/referral/{created_company.id}/leads/generate")
        assert resp.status_code == 200
        assert resp.json()["status"] == "generating"

    def test_upload_leads_csv_canonical_headers(self, client, created_company):
        """Standard NPPES-style headers work as before."""
        csv_content = "npi,first_name,last_name,specialty,practice_name,fax,phone,email,address,city,state,zip\n"
        csv_content += "1112223333,Alice,Jones,Psychiatry,Jones Practice,602-111-2222,602-333-4444,alice@example.com,100 Main St,Phoenix,AZ,85001\n"
        csv_content += "2223334444,Bob,Brown,Family Medicine,Brown Clinic,480-111-2222,480-333-4444,bob@example.com,200 Oak Ave,Scottsdale,AZ,85251\n"

        resp = client.post(
            f"/api/v1/referral/{created_company.id}/leads/upload",
            files={"file": ("leads.csv", io.BytesIO(csv_content.encode()), "text/csv")},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["created"] == 2
        assert data["errors"] == []
        assert "column_mapping" in data
        assert data["campaign_id"] is None  # no list_name provided

    def test_upload_leads_csv_natural_language_headers(self, client, created_company):
        """Fuzzy column mapping handles human-written header variations."""
        csv_content = "NPI Number,First Name,Last Name,Credentials,Medical Specialty,Practice Name,Fax Number,Phone,Email Address,Street Address,City,State,Zip Code\n"
        csv_content += "1112223333,Carol,Davis,MD,Neurology,Davis Neuro,602-111-0001,602-222-0001,carol@neuro.com,500 Oak St,Phoenix,AZ,85004\n"

        resp = client.post(
            f"/api/v1/referral/{created_company.id}/leads/upload",
            files={"file": ("providers.csv", io.BytesIO(csv_content.encode()), "text/csv")},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["created"] == 1
        assert data["errors"] == []
        # Verify columns were recognized
        col_map = data["column_mapping"]
        assert "First Name" in col_map and col_map["First Name"] == "first_name"
        assert "NPI Number" in col_map and col_map["NPI Number"] == "npi"
        assert "Fax Number" in col_map and col_map["Fax Number"] == "fax"
        assert "Medical Specialty" in col_map and col_map["Medical Specialty"] == "specialty"
        assert "Zip Code" in col_map and col_map["Zip Code"] == "zip"

    def test_upload_csv_mixed_case_stripped_headers(self, client, created_company):
        """Headers with spaces, mixed case, and extra punctuation are normalized."""
        csv_content = "  fname ,  lname ,faxno,emailaddress,practicestate\n"
        csv_content += "Jane,Smith,480-555-0001,jane@clinic.com,AZ\n"

        resp = client.post(
            f"/api/v1/referral/{created_company.id}/leads/upload",
            files={"file": ("list.csv", io.BytesIO(csv_content.encode()), "text/csv")},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["created"] == 1
        col_map = data["column_mapping"]
        assert "fname" in " ".join(col_map.values()) or "first_name" in col_map.values()

    def test_upload_csv_with_unrecognized_columns(self, client, created_company):
        """Unrecognized columns are reported but don't cause failures."""
        csv_content = "first_name,last_name,fax,custom_field_xyz,another_unknown\n"
        csv_content += "Tom,Ray,602-100-0001,value1,value2\n"

        resp = client.post(
            f"/api/v1/referral/{created_company.id}/leads/upload",
            files={"file": ("list.csv", io.BytesIO(csv_content.encode()), "text/csv")},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["created"] == 1
        assert "custom_field_xyz" in data["unrecognized_columns"]
        assert "another_unknown" in data["unrecognized_columns"]

    def test_upload_csv_with_list_name_creates_campaign(self, client, created_company, db):
        """Providing list_name creates a named Campaign and enrolls all leads."""
        from app.models.referral import Campaign
        csv_content = "first_name,last_name,specialty,fax\n"
        csv_content += "Dana,Lee,Pediatrics,602-555-1001\n"
        csv_content += "Eric,Wong,Family Medicine,602-555-1002\n"
        csv_content += "Fiona,Black,LCSW,602-555-1003\n"

        resp = client.post(
            f"/api/v1/referral/{created_company.id}/leads/upload",
            files={"file": ("list.csv", io.BytesIO(csv_content.encode()), "text/csv")},
            data={"list_name": "Pediatricians in Texas"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["created"] == 3
        assert data["list_name"] == "Pediatricians in Texas"
        assert data["campaign_id"] is not None

        # Verify campaign was created in DB
        campaign = db.query(Campaign).filter(
            Campaign.id == data["campaign_id"]
        ).first()
        assert campaign is not None
        assert campaign.name == "Pediatricians in Texas"
        assert campaign.channel == "csv_upload"

    def test_upload_csv_excel_bom_encoding(self, client, created_company):
        """Excel-saved CSVs with UTF-8 BOM are handled correctly."""
        csv_content = "\ufeffFirst Name,Last Name,fax\nGrace,Hopper,602-555-9999\n"

        resp = client.post(
            f"/api/v1/referral/{created_company.id}/leads/upload",
            files={"file": ("excel_export.csv", io.BytesIO(csv_content.encode("utf-8-sig")), "text/csv")},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["created"] == 1
        assert data["errors"] == []

    def test_update_lead_status(self, client, created_company, leads):
        lead_id = str(leads[0].id)
        resp = client.patch(
            f"/api/v1/referral/{created_company.id}/leads/{lead_id}",
            json={"status": "contacted"}
        )
        assert resp.status_code == 200

    def test_suppress_lead(self, client, created_company, leads):
        lead_id = str(leads[0].id)
        resp = client.post(
            f"/api/v1/referral/{created_company.id}/leads/{lead_id}/suppress?channel=email"
        )
        assert resp.status_code == 200
        assert resp.json()["suppressed"] is True


class TestCollateralGeneration:
    def test_generate_fax_sheet(self, client, created_company, mock_llm):
        with patch("app.api.modules.referral._generate_fax_sheet_bg", new_callable=AsyncMock):
            resp = client.post(
                f"/api/v1/referral/{created_company.id}/generate/fax-sheet",
                json={"target_specialty": "primary care physician"}
            )
        assert resp.status_code == 200
        assert resp.json()["status"] == "generating"

    def test_generate_voicemail_scripts(self, client, created_company, mock_llm):
        with patch("app.api.modules.referral._generate_voicemail_bg", new_callable=AsyncMock):
            resp = client.post(
                f"/api/v1/referral/{created_company.id}/generate/voicemail-scripts",
                json={"target_specialty": "neurologist"}
            )
        assert resp.status_code == 200

    def test_generate_email_sequence(self, client, created_company, mock_llm):
        with patch("app.api.modules.referral._generate_email_sequence_bg", new_callable=AsyncMock):
            resp = client.post(
                f"/api/v1/referral/{created_company.id}/generate/email-sequence",
                json={"target_specialty": "therapist"}
            )
        assert resp.status_code == 200

    def test_generate_postcard(self, client, created_company, mock_llm):
        with patch("app.api.modules.referral._generate_postcard_bg", new_callable=AsyncMock):
            resp = client.post(f"/api/v1/referral/{created_company.id}/generate/postcard")
        assert resp.status_code == 200

    def test_generate_all_collateral(self, client, created_company, mock_llm):
        with patch("app.api.modules.referral._generate_fax_sheet_bg", new_callable=AsyncMock), \
             patch("app.api.modules.referral._generate_voicemail_bg", new_callable=AsyncMock), \
             patch("app.api.modules.referral._generate_email_sequence_bg", new_callable=AsyncMock), \
             patch("app.api.modules.referral._generate_postcard_bg", new_callable=AsyncMock):
            resp = client.post(f"/api/v1/referral/{created_company.id}/generate/all-collateral")
        assert resp.status_code == 200
        assert "tasks" in resp.json()


class TestCampaigns:
    def test_list_campaigns_empty(self, client, created_company):
        resp = client.get(f"/api/v1/referral/{created_company.id}/campaigns")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_launch_campaign(self, client, created_company, leads):
        lead_ids = [str(l.id) for l in leads[:3]]
        resp = client.post(
            f"/api/v1/referral/{created_company.id}/campaigns/launch",
            json={
                "name": "Q1 Referral Blitz",
                "lead_ids": lead_ids,
                "channels": ["email", "fax"],
            }
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "campaign_id" in data
        assert data["enrolled_leads"] == 3
        assert data["status"] == "active"

    def test_list_campaigns_after_launch(self, client, created_company, leads):
        lead_ids = [str(l.id) for l in leads[:2]]
        client.post(
            f"/api/v1/referral/{created_company.id}/campaigns/launch",
            json={"name": "Test Campaign", "lead_ids": lead_ids, "channels": ["email"]}
        )
        resp = client.get(f"/api/v1/referral/{created_company.id}/campaigns")
        assert len(resp.json()) >= 1

    def test_get_campaign_sequence(self, client, created_company):
        resp = client.get(f"/api/v1/referral/{created_company.id}/campaigns/fake-id/sequence")
        assert resp.status_code == 200
        data = resp.json()
        assert "sequence" in data
        assert len(data["sequence"]) == 8
        # Verify sequence has all required channels
        channels = {step["channel"] for step in data["sequence"]}
        assert "email" in channels
        assert "fax" in channels
        assert "voicemail" in channels
        assert "mail" in channels
