"""Integration tests for /approval API routes."""
import uuid
import pytest
from app.models.content import ApprovalItem, ContentItem, ContentType, ContentStatus


@pytest.fixture
def approval_items(db, created_company):
    """Create a set of approval items across different modules."""
    items = []
    for module, itype in [
        ("referral", "fax_sheet"),
        ("referral", "email_sequence"),
        ("content", "blog_post"),
        ("content", "social_facebook"),
        ("paid_ads", "google_ad_copy"),
        ("seo", "seo_report"),
    ]:
        ci = ContentItem(
            company_id=created_company.id,
            content_type=ContentType.blog_post,
            title=f"Test {module} {itype}",
        )
        db.add(ci)
        db.flush()

        ap = ApprovalItem(
            company_id=created_company.id,
            content_item_id=ci.id,
            item_type=itype,
            title=f"{module.title()} — {itype.replace('_', ' ').title()}",
            module=module,
            status="pending",
            preview_data={"body_preview": f"Preview for {itype}"},
        )
        db.add(ap)
        items.append(ap)
    db.commit()
    return items


class TestApprovalQueue:
    def test_queue_empty_for_new_company(self, client, created_company):
        resp = client.get(f"/api/v1/approval/{created_company.id}/queue")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_queue_count_zero(self, client, created_company):
        resp = client.get(f"/api/v1/approval/{created_company.id}/queue/count")
        assert resp.status_code == 200
        assert resp.json()["pending"] == 0

    def test_queue_shows_pending_items(self, client, created_company, approval_items):
        resp = client.get(f"/api/v1/approval/{created_company.id}/queue")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == len(approval_items)

    def test_queue_count_matches_items(self, client, created_company, approval_items):
        resp = client.get(f"/api/v1/approval/{created_company.id}/queue/count")
        assert resp.json()["pending"] == len(approval_items)

    def test_queue_filter_by_module(self, client, created_company, approval_items):
        resp = client.get(f"/api/v1/approval/{created_company.id}/queue?module=referral")
        assert resp.status_code == 200
        items = resp.json()
        assert all(i["module"] == "referral" for i in items)
        assert len(items) == 2  # fax_sheet + email_sequence

    def test_queue_filter_content_module(self, client, created_company, approval_items):
        resp = client.get(f"/api/v1/approval/{created_company.id}/queue?module=content")
        items = resp.json()
        assert all(i["module"] == "content" for i in items)
        assert len(items) == 2

    def test_queue_item_has_required_fields(self, client, created_company, approval_items):
        resp = client.get(f"/api/v1/approval/{created_company.id}/queue")
        item = resp.json()[0]
        for field in ("id", "item_type", "title", "status", "module", "preview_data"):
            assert field in item


class TestApprovalActions:
    def test_approve_item(self, client, created_company, approval_items, db):
        item = approval_items[0]
        resp = client.post(
            f"/api/v1/approval/{created_company.id}/items/{item.id}/action",
            json={"action": "approve"}
        )
        assert resp.status_code == 200
        assert resp.json()["action"] == "approve"

        # Item should no longer be in pending queue
        queue_resp = client.get(f"/api/v1/approval/{created_company.id}/queue")
        ids = [i["id"] for i in queue_resp.json()]
        assert str(item.id) not in ids

    def test_reject_item_with_notes(self, client, created_company, approval_items):
        item = approval_items[1]
        resp = client.post(
            f"/api/v1/approval/{created_company.id}/items/{item.id}/action",
            json={"action": "reject", "reviewer_notes": "Not the right tone for our brand."}
        )
        assert resp.status_code == 200
        assert resp.json()["action"] == "reject"

    def test_edit_and_approve(self, client, created_company, approval_items):
        item = approval_items[2]
        resp = client.post(
            f"/api/v1/approval/{created_company.id}/items/{item.id}/action",
            json={
                "action": "edit_and_approve",
                "reviewer_notes": "Fixed the tone.",
                "edited_content": {"body": "Updated content body after editing."}
            }
        )
        assert resp.status_code == 200

    def test_invalid_action_returns_400(self, client, created_company, approval_items):
        item = approval_items[0]
        resp = client.post(
            f"/api/v1/approval/{created_company.id}/items/{item.id}/action",
            json={"action": "invalid_action"}
        )
        assert resp.status_code == 400

    def test_action_on_nonexistent_item(self, client, created_company):
        resp = client.post(
            f"/api/v1/approval/{created_company.id}/items/{uuid.uuid4()}/action",
            json={"action": "approve"}
        )
        assert resp.status_code == 404


class TestBulkApprove:
    def test_bulk_approve_all(self, client, created_company, approval_items):
        resp = client.post(f"/api/v1/approval/{created_company.id}/bulk-approve", json={})
        assert resp.status_code == 200
        assert resp.json()["approved_count"] == len(approval_items)

        # Queue should be empty now
        queue = client.get(f"/api/v1/approval/{created_company.id}/queue").json()
        assert queue == []

    def test_bulk_approve_by_module(self, client, created_company, approval_items):
        resp = client.post(
            f"/api/v1/approval/{created_company.id}/bulk-approve",
            json={"module": "referral"}
        )
        assert resp.status_code == 200
        assert resp.json()["approved_count"] == 2

    def test_bulk_approve_by_ids(self, client, created_company, approval_items):
        ids = [str(approval_items[0].id), str(approval_items[1].id)]
        resp = client.post(
            f"/api/v1/approval/{created_company.id}/bulk-approve",
            json={"item_ids": ids}
        )
        assert resp.status_code == 200
        assert resp.json()["approved_count"] == 2


class TestApprovalHistory:
    def test_history_empty(self, client, created_company):
        resp = client.get(f"/api/v1/approval/{created_company.id}/history")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_history_shows_approved_items(self, client, created_company, approval_items):
        item = approval_items[0]
        client.post(
            f"/api/v1/approval/{created_company.id}/items/{item.id}/action",
            json={"action": "approve"}
        )
        resp = client.get(f"/api/v1/approval/{created_company.id}/history?status=approved")
        assert resp.status_code == 200
        approved_ids = [i["id"] for i in resp.json()]
        assert str(item.id) in approved_ids
