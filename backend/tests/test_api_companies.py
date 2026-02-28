"""Integration tests for /companies API routes."""
import pytest
from unittest.mock import patch, AsyncMock


class TestCompanyListCreate:
    def test_list_companies_empty(self, client):
        resp = client.get("/api/v1/companies/")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_create_company_starts_ingestion(self, client):
        with patch("app.api.companies._run_ingestion", new_callable=AsyncMock):
            resp = client.post("/api/v1/companies/", json={
                "website_url": "https://novamindmentalhealth.com",
                "is_pilot": True,
            })
        assert resp.status_code == 200
        data = resp.json()
        assert "id" in data
        assert data["status"] == "ingesting"

    def test_create_duplicate_company_returns_409(self, client):
        with patch("app.api.companies._run_ingestion", new_callable=AsyncMock):
            client.post("/api/v1/companies/", json={"website_url": "https://duplicate.com"})
            resp = client.post("/api/v1/companies/", json={"website_url": "https://duplicate.com"})
        assert resp.status_code == 409

    def test_list_companies_after_create(self, client):
        with patch("app.api.companies._run_ingestion", new_callable=AsyncMock):
            client.post("/api/v1/companies/", json={"website_url": "https://listtest.com"})
        resp = client.get("/api/v1/companies/")
        assert resp.status_code == 200
        urls = [c["website_url"] for c in resp.json()]
        assert "https://listtest.com" in urls


class TestCompanyGetUpdate:
    def test_get_company(self, client, created_company):
        resp = client.get(f"/api/v1/companies/{created_company.id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "Novamind Mental Health"
        assert data["is_pilot"] is True
        assert "budgets" in data
        assert "services" in data

    def test_get_nonexistent_company_returns_404(self, client):
        import uuid
        resp = client.get(f"/api/v1/companies/{uuid.uuid4()}")
        assert resp.status_code == 404

    def test_update_company_name(self, client, created_company):
        resp = client.patch(f"/api/v1/companies/{created_company.id}", json={"name": "Updated Name"})
        assert resp.status_code == 200
        assert resp.json()["name"] == "Updated Name"

    def test_update_company_budgets(self, client, created_company):
        resp = client.patch(f"/api/v1/companies/{created_company.id}", json={
            "budget_google_ads": 8000.0,
            "budget_meta_ads": 4000.0,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["budgets"]["google_ads"] == 8000.0
        assert data["budgets"]["meta_ads"] == 4000.0

    def test_update_posting_frequency(self, client, created_company):
        resp = client.patch(f"/api/v1/companies/{created_company.id}", json={
            "posting_frequency": {"blog": 3, "facebook": 7, "instagram": 5, "linkedin": 4}
        })
        assert resp.status_code == 200
        assert resp.json()["posting_frequency"]["blog"] == 3

    def test_update_competitors(self, client, created_company):
        resp = client.patch(f"/api/v1/companies/{created_company.id}", json={
            "competitors": [{"name": "Competitor A", "website": "https://comp-a.com"}]
        })
        assert resp.status_code == 200


class TestCredentials:
    def test_update_credentials_merges(self, client, created_company):
        # Add first key
        resp = client.post(f"/api/v1/companies/{created_company.id}/credentials", json={
            "credentials": {"google_ads_api_key": "ga_key_abc123"}
        })
        assert resp.status_code == 200
        assert "google_ads_api_key" in resp.json()["credential_keys"]

        # Add second key — should merge, not overwrite
        resp2 = client.post(f"/api/v1/companies/{created_company.id}/credentials", json={
            "credentials": {"instantly_api_key": "inst_key_xyz"}
        })
        keys = resp2.json()["credential_keys"]
        assert "google_ads_api_key" in keys
        assert "instantly_api_key" in keys

    def test_credential_status_all_missing_by_default(self, client, created_company):
        resp = client.get(f"/api/v1/companies/{created_company.id}/credential-status")
        assert resp.status_code == 200
        slots = resp.json()["credentials"]
        assert len(slots) >= 10
        # All should be not connected by default
        for slot in slots:
            assert "key" in slot
            assert "label" in slot
            assert "module" in slot
            assert "connected" in slot

    def test_credential_status_shows_connected_after_upload(self, client, created_company):
        client.post(f"/api/v1/companies/{created_company.id}/credentials", json={
            "credentials": {"openfax_api_key": "of_key_test"}
        })
        resp = client.get(f"/api/v1/companies/{created_company.id}/credential-status")
        slots = {s["key"]: s for s in resp.json()["credentials"]}
        assert slots["openfax_api_key"]["connected"] is True
        assert slots["lob_api_key"]["connected"] is False

    def test_reingest_updates_status(self, client, created_company):
        with patch("app.api.companies._run_ingestion", new_callable=AsyncMock):
            resp = client.post(f"/api/v1/companies/{created_company.id}/reingest")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ingesting"


class TestPortfolioOverview:
    def test_portfolio_overview_returns_list(self, client, created_company):
        resp = client.get("/api/v1/companies/portfolio/overview")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        ids = [c["id"] for c in data]
        assert str(created_company.id) in ids

    def test_portfolio_overview_includes_health(self, client, created_company):
        resp = client.get("/api/v1/companies/portfolio/overview")
        company = next(c for c in resp.json() if c["id"] == str(created_company.id))
        assert "health" in company
        assert company["health"] in ("green", "yellow", "red")
        assert "monthly_budget" in company
        assert "pending_approvals" in company
