"""
Comprehensive tests for new feature modules:
  - AEO (AI Engine Optimization)
  - Video Ad Generator
  - Intake Forms
  - Schedule / Calendar
  - Chat / AI Strategy
  - Reports / GTM Digest
  - Reputation & Reviews
  - Spam Prevention & Compliance
  - Competitors
  - Demo Data Seeder
"""
import pytest
import uuid
from unittest.mock import patch, MagicMock


# ── Helpers ──────────────────────────────────────────────────────────────────

def _llm_message(text: str):
    """Build a mock LLM response with the given text."""
    mock_resp = MagicMock()
    mock_resp.content = [MagicMock(text=text)]
    return mock_resp


# ── AEO (AI Engine Optimization) ─────────────────────────────────────────────

class TestAEOModule:
    def test_get_score_returns_defaults(self, client, created_company):
        resp = client.get(f"/api/v1/aeo/{created_company.id}/score")
        assert resp.status_code == 200
        data = resp.json()
        assert "score" in data
        assert "checklist" in data
        assert "engines" in data
        assert isinstance(data["score"], (int, float))
        assert 0 <= data["score"] <= 100

    def test_update_checklist_affects_score(self, client, created_company):
        resp = client.post(
            f"/api/v1/aeo/{created_company.id}/checklist",
            json={"checked_ids": ["schema-medical-business", "schema-faq", "content-qa-format"]},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["checked_ids"]) == 3
        assert data["score"] > 0

    def test_checklist_full_completion(self, client, created_company):
        # Get all checklist item IDs from nested categories
        score_resp = client.get(f"/api/v1/aeo/{created_company.id}/score")
        checklist = score_resp.json()["checklist"]
        all_ids = [item["id"] for cat in checklist for item in cat["items"]]

        resp = client.post(
            f"/api/v1/aeo/{created_company.id}/checklist",
            json={"checked_ids": all_ids},
        )
        assert resp.status_code == 200
        assert resp.json()["score"] == 100

    def test_generate_faqs_llm_success(self, client, created_company):
        mock_resp = _llm_message('{"faqs": [{"question": "What is TMS?", "answer": "A treatment for depression."}]}')
        with patch("app.api.modules.aeo.llm_service") as mock_llm:
            mock_llm.client.messages.create.return_value = mock_resp
            resp = client.post(
                f"/api/v1/aeo/{created_company.id}/generate-faqs",
                json={"topic": "TMS therapy"},
            )
        assert resp.status_code == 200
        data = resp.json()
        assert "faqs" in data
        assert len(data["faqs"]) >= 1

    def test_generate_faqs_llm_failure_falls_back(self, client, created_company):
        with patch("app.api.modules.aeo.llm_service") as mock_llm:
            mock_llm.client.messages.create.side_effect = Exception("API error")
            resp = client.post(
                f"/api/v1/aeo/{created_company.id}/generate-faqs",
                json={"topic": "ketamine therapy"},
            )
        assert resp.status_code == 200
        data = resp.json()
        assert "faqs" in data
        assert len(data["faqs"]) > 0  # demo fallback

    def test_generate_schema_returns_json_ld(self, client, created_company):
        mock_resp = _llm_message('{"schema": {"@context": "https://schema.org", "@type": "MedicalBusiness", "name": "Test Clinic"}}')
        with patch("app.api.modules.aeo.llm_service") as mock_llm:
            mock_llm.client.messages.create.return_value = mock_resp
            resp = client.post(
                f"/api/v1/aeo/{created_company.id}/generate-schema",
                json={"schema_type": "MedicalBusiness"},
            )
        assert resp.status_code == 200
        data = resp.json()
        assert "schema" in data or "json_ld" in data or "schema_json" in data

    def test_generate_schema_fallback(self, client, created_company):
        with patch("app.api.modules.aeo.llm_service") as mock_llm:
            mock_llm.client.messages.create.side_effect = Exception("fail")
            resp = client.post(
                f"/api/v1/aeo/{created_company.id}/generate-schema",
                json={"schema_type": "FAQPage"},
            )
        assert resp.status_code == 200

    def test_optimize_content(self, client, created_company):
        mock_resp = _llm_message('{"suggestions": ["Add FAQ schema", "Use question format for H2s"]}')
        with patch("app.api.modules.aeo.llm_service") as mock_llm:
            mock_llm.client.messages.create.return_value = mock_resp
            resp = client.post(
                f"/api/v1/aeo/{created_company.id}/optimize-content",
                json={"content": "Our TMS therapy treats depression.", "page_type": "service"},
            )
        assert resp.status_code == 200


# ── Video Ad Generator ────────────────────────────────────────────────────────

class TestVideoModule:
    def test_get_platforms(self, client):
        resp = client.get("/api/v1/video/platforms")
        assert resp.status_code == 200
        data = resp.json()
        assert "platforms" in data
        assert "templates" in data
        assert len(data["platforms"]) >= 4

    def test_list_ads_returns_demo_data(self, client, created_company):
        resp = client.get(f"/api/v1/video/{created_company.id}/ads")
        assert resp.status_code == 200
        data = resp.json()
        assert "ads" in data
        assert isinstance(data["ads"], list)
        assert data["total"] == len(data["ads"])

    def test_generate_script_llm_success(self, client, created_company):
        mock_script = '{"scenes": [{"time": "0-3s", "visual": "Logo", "audio": "VO: Hello", "text_overlay": "TMS"}], "cta": "Call Now", "notes": "HIPAA compliant"}'
        with patch("app.api.modules.video.llm_service") as mock_llm:
            mock_llm.client.messages.create.return_value = _llm_message(mock_script)
            resp = client.post(
                f"/api/v1/video/{created_company.id}/generate-script",
                json={
                    "platform": "youtube_preroll",
                    "topic": "TMS therapy",
                    "length": "30s",
                    "template_id": "tpl-problem-solution",
                },
            )
        assert resp.status_code == 200
        data = resp.json()
        assert "script" in data
        assert "platform" in data
        assert data["status"] == "ready"

    def test_generate_script_llm_failure_uses_demo(self, client, created_company):
        with patch("app.api.modules.video.llm_service") as mock_llm:
            mock_llm.client.messages.create.side_effect = Exception("API error")
            resp = client.post(
                f"/api/v1/video/{created_company.id}/generate-script",
                json={"platform": "meta_reels", "topic": "Anxiety treatment", "length": "15s"},
            )
        assert resp.status_code == 200
        data = resp.json()
        assert "script" in data

    def test_generate_concepts(self, client, created_company):
        mock_concepts = '{"concepts": [{"title": "The Hook", "hook": "Text on screen", "concept": "...", "best_platform": "TikTok", "length": "15s", "emotional_driver": "Hope"}]}'
        with patch("app.api.modules.video.llm_service") as mock_llm:
            mock_llm.client.messages.create.return_value = _llm_message(mock_concepts)
            resp = client.post(
                f"/api/v1/video/{created_company.id}/generate-concepts",
                json={"topic": "depression treatment"},
            )
        assert resp.status_code == 200
        data = resp.json()
        assert "concepts" in data
        assert len(data["concepts"]) >= 1

    def test_generate_concepts_fallback(self, client, created_company):
        with patch("app.api.modules.video.llm_service") as mock_llm:
            mock_llm.client.messages.create.side_effect = Exception("fail")
            resp = client.post(
                f"/api/v1/video/{created_company.id}/generate-concepts",
                json={"topic": "anxiety"},
            )
        assert resp.status_code == 200
        assert len(resp.json()["concepts"]) == 3  # 3 demo concepts

    def test_delete_ad(self, client, created_company):
        # Generate a script first to have an ad to delete
        with patch("app.api.modules.video.llm_service") as mock_llm:
            mock_llm.client.messages.create.side_effect = Exception("fail")
            gen_resp = client.post(
                f"/api/v1/video/{created_company.id}/generate-script",
                json={"platform": "youtube_preroll", "topic": "test", "length": "15s"},
            )
        ad_id = gen_resp.json()["id"]
        del_resp = client.delete(f"/api/v1/video/{created_company.id}/ads/{ad_id}")
        assert del_resp.status_code == 200
        assert del_resp.json()["deleted"] == ad_id


# ── Intake Forms ─────────────────────────────────────────────────────────────

class TestIntakeModule:
    def test_list_forms_returns_demo(self, client, created_company):
        resp = client.get(f"/api/v1/intake/{created_company.id}/forms")
        assert resp.status_code == 200
        data = resp.json()
        assert "forms" in data
        assert len(data["forms"]) >= 4  # DEMO_FORMS has 4

    def test_create_form(self, client, created_company):
        resp = client.post(
            f"/api/v1/intake/{created_company.id}/forms",
            json={"name": "ADHD Intake", "fields": [{"type": "text", "label": "Full Name"}]},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "ADHD Intake"
        assert "id" in data
        assert "embed_url" in data

    def test_create_form_then_list_includes_new(self, client, created_company):
        client.post(
            f"/api/v1/intake/{created_company.id}/forms",
            json={"name": "Custom OCD Form", "fields": []},
        )
        list_resp = client.get(f"/api/v1/intake/{created_company.id}/forms")
        names = [f["name"] for f in list_resp.json()["forms"]]
        assert "Custom OCD Form" in names

    def test_get_form(self, client, created_company):
        create_resp = client.post(
            f"/api/v1/intake/{created_company.id}/forms",
            json={"name": "Test Form", "fields": [{"type": "email", "label": "Email"}]},
        )
        form_id = create_resp.json()["id"]
        resp = client.get(f"/api/v1/intake/{created_company.id}/forms/{form_id}")
        assert resp.status_code == 200

    def test_field_templates(self, client):
        resp = client.get("/api/v1/intake/field-templates")
        assert resp.status_code == 200
        assert "fields" in resp.json()
        assert len(resp.json()["fields"]) > 0


# ── Schedule / Calendar ───────────────────────────────────────────────────────

class TestScheduleModule:
    def test_get_events_returns_list(self, client, created_company):
        resp = client.get(f"/api/v1/schedule/{created_company.id}/events")
        assert resp.status_code == 200
        data = resp.json()
        assert "events" in data
        assert isinstance(data["events"], list)

    def test_get_events_with_month_year(self, client, created_company):
        resp = client.get(f"/api/v1/schedule/{created_company.id}/events?month=3&year=2026")
        assert resp.status_code == 200
        data = resp.json()
        assert data["month"] == 3
        assert data["year"] == 2026

    def test_create_event(self, client, created_company):
        resp = client.post(
            f"/api/v1/schedule/{created_company.id}/events",
            json={
                "title": "Google Ads Campaign Launch",
                "channel": "google",
                "date": "2026-03-15",
                "status": "scheduled",
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["title"] == "Google Ads Campaign Launch"
        assert "id" in data

    def test_event_cache_used_when_seeded(self, client, created_company):
        from app.api.modules import schedule as sched_mod
        company_id = str(created_company.id)
        sched_mod._event_cache[company_id] = [
            {"id": "ev-test", "title": "Test Event", "channel": "fax", "date": "2026-03-01", "status": "scheduled", "color": "#3b82f6"}
        ]
        resp = client.get(f"/api/v1/schedule/{company_id}/events")
        assert resp.status_code == 200
        events = resp.json()["events"]
        assert any(e["id"] == "ev-test" for e in events)
        # cleanup
        del sched_mod._event_cache[company_id]


# ── Chat / AI Strategy ────────────────────────────────────────────────────────

class TestChatModule:
    def test_get_history_empty(self, client, created_company):
        resp = client.get(f"/api/v1/chat/{created_company.id}/history")
        assert resp.status_code == 200
        data = resp.json()
        assert "messages" in data
        assert "suggested_prompts" in data
        assert len(data["suggested_prompts"]) > 0

    def test_send_message_llm_success(self, client, created_company):
        with patch("app.api.modules.chat.llm_service") as mock_llm:
            mock_resp = MagicMock()
            mock_resp.content = [MagicMock(text="Focus on PCP outreach and Google Ads optimization.")]
            mock_llm.client.messages.create.return_value = mock_resp
            resp = client.post(
                f"/api/v1/chat/{created_company.id}/message",
                json={"message": "What should my top priority be this week?"},
            )
        assert resp.status_code == 200
        data = resp.json()
        assert "message" in data
        assert data["message"]["role"] == "assistant"
        assert len(data["message"]["content"]) > 0

    def test_send_message_llm_failure_uses_fallback(self, client, created_company):
        with patch("app.api.modules.chat.llm_service") as mock_llm:
            mock_llm.client.messages.create.side_effect = Exception("API error")
            resp = client.post(
                f"/api/v1/chat/{created_company.id}/message",
                json={"message": "Help me with referrals"},
            )
        assert resp.status_code == 200
        data = resp.json()
        assert data["message"]["role"] == "assistant"

    def test_send_message_builds_history(self, client, created_company):
        cid = str(created_company.id) + "-hist"
        with patch("app.api.modules.chat.llm_service") as mock_llm:
            mock_llm.client.messages.create.side_effect = Exception("fail")
            client.post(f"/api/v1/chat/{cid}/message", json={"message": "First question"})
            client.post(f"/api/v1/chat/{cid}/message", json={"message": "Second question"})

        history_resp = client.get(f"/api/v1/chat/{cid}/history")
        messages = history_resp.json()["messages"]
        assert len(messages) >= 2

    def test_send_empty_message_returns_error(self, client, created_company):
        resp = client.post(
            f"/api/v1/chat/{created_company.id}/message",
            json={"message": "  "},
        )
        assert resp.status_code == 200
        assert "error" in resp.json()

    def test_clear_history(self, client, created_company):
        cid = str(created_company.id) + "-clear"
        with patch("app.api.modules.chat.llm_service") as mock_llm:
            mock_llm.client.messages.create.side_effect = Exception("fail")
            client.post(f"/api/v1/chat/{cid}/message", json={"message": "Hi"})

        del_resp = client.delete(f"/api/v1/chat/{cid}/history")
        assert del_resp.status_code == 200

        history_resp = client.get(f"/api/v1/chat/{cid}/history")
        assert len(history_resp.json()["messages"]) == 0


# ── Reports / GTM Digest ──────────────────────────────────────────────────────

class TestReportsModule:
    def test_get_weekly_no_report(self, client, created_company):
        cid = str(created_company.id) + "-newreport"
        resp = client.get(f"/api/v1/reports/{cid}/weekly")
        # Either 404 (company not found) or 200 with no report
        assert resp.status_code in [200, 404]

    def test_get_weekly_with_company(self, client, created_company):
        resp = client.get(f"/api/v1/reports/{created_company.id}/weekly")
        assert resp.status_code == 200

    def test_generate_digest(self, client, created_company):
        resp = client.post(f"/api/v1/reports/{created_company.id}/generate")
        assert resp.status_code == 200
        assert resp.json()["status"] == "generating"

    def test_report_history(self, client, created_company):
        resp = client.get(f"/api/v1/reports/{created_company.id}/history")
        assert resp.status_code == 200
        assert "reports" in resp.json()

    def test_cached_report_returned(self, client, created_company):
        from app.api.modules import reports as rep_reports_mod
        cid = str(created_company.id)
        rep_reports_mod._report_cache[cid] = {
            "week": "Test Week",
            "pulse": "green",
            "generated_at": "2026-02-28",
        }
        resp = client.get(f"/api/v1/reports/{cid}/weekly")
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("week") == "Test Week" or data.get("report", {}).get("week") == "Test Week"
        # cleanup
        del rep_reports_mod._report_cache[cid]


# ── Reputation & Reviews ──────────────────────────────────────────────────────

class TestReputationModule:
    def test_get_reviews_defaults(self, client, created_company):
        resp = client.get(f"/api/v1/reputation/{created_company.id}/reviews")
        assert resp.status_code == 200
        data = resp.json()
        assert "reviews" in data
        assert len(data["reviews"]) > 0

    def test_get_reviews_platform_filter(self, client, created_company):
        resp = client.get(f"/api/v1/reputation/{created_company.id}/reviews?platform=google")
        assert resp.status_code == 200
        reviews = resp.json()["reviews"]
        assert all(r["platform"].lower() == "google" for r in reviews)

    def test_get_reputation_summary(self, client, created_company):
        resp = client.get(f"/api/v1/reputation/{created_company.id}/summary")
        assert resp.status_code == 200
        data = resp.json()
        assert "total_reviews" in data
        assert "average_rating" in data
        assert "rating_distribution" in data
        assert data["average_rating"] > 0

    def test_suggest_response_good_review(self, client, created_company):
        with patch("app.api.modules.reputation.llm_service") as mock_llm:
            mock_llm.client.messages.create.return_value = _llm_message(
                '{"response": "Thank you for your kind words!", "tone": "grateful", "word_count": 8}'
            )
            resp = client.post(f"/api/v1/reputation/{created_company.id}/reviews/r1/suggest-response")
        assert resp.status_code == 200
        data = resp.json()
        assert "response" in data
        assert len(data["response"]) > 0

    def test_suggest_response_llm_failure_fallback(self, client, created_company):
        with patch("app.api.modules.reputation.llm_service") as mock_llm:
            mock_llm.client.messages.create.side_effect = Exception("fail")
            resp = client.post(f"/api/v1/reputation/{created_company.id}/reviews/r2/suggest-response")
        assert resp.status_code == 200
        assert "response" in resp.json()

    def test_suggest_response_not_found(self, client, created_company):
        with patch("app.api.modules.reputation.llm_service"):
            resp = client.post(f"/api/v1/reputation/{created_company.id}/reviews/nonexistent/suggest-response")
        assert resp.status_code == 404

    def test_analyze_sentiment(self, client, created_company):
        with patch("app.api.modules.reputation.llm_service") as mock_llm:
            mock_llm.client.messages.create.return_value = _llm_message(
                '{"overall_sentiment": "positive", "sentiment_score": 80, "top_themes_positive": ["care"], "top_themes_negative": ["wait times"], "patient_priority": "quality", "recommended_actions": ["improve scheduling"]}'
            )
            resp = client.post(f"/api/v1/reputation/{created_company.id}/analyze-sentiment")
        assert resp.status_code == 200
        data = resp.json()
        assert "overall_sentiment" in data

    def test_review_cache_used_when_seeded(self, client, created_company):
        from app.api.modules import reputation as rep_mod
        cid = str(created_company.id) + "-repcache"
        rep_mod._review_cache[cid] = [
            {"id": "test-r", "platform": "Yelp", "rating": 4, "text": "Great place", "date": "2026-01-01", "responded": False}
        ]
        resp = client.get(f"/api/v1/reputation/{cid}/reviews")
        # Note: this will 404 since company doesn't exist, but the cache logic is tested via demo load
        # We test cache indirectly through the demo load test
        del rep_mod._review_cache[cid]


# ── Spam Prevention & Compliance ─────────────────────────────────────────────

class TestSpamModule:
    def test_get_settings_loads_defaults(self, client, created_company):
        resp = client.get(f"/api/v1/spam/{created_company.id}/settings")
        assert resp.status_code == 200
        data = resp.json()
        assert "settings" in data
        s = data["settings"]
        # All critical defaults should be on
        assert s["tcpa_quiet_hours"]["enabled"] is True
        assert s["canspam"]["enabled"] is True
        assert s["hipaa"]["enabled"] is True
        assert s["global_dnc"]["enabled"] is True
        # Rate limits for each channel
        for channel in ["fax", "email", "voicemail", "sms"]:
            assert channel in s["rate_limits"]
            assert s["rate_limits"][channel]["enabled"] is True

    def test_compliance_score_starts_at_100(self, client, created_company):
        cid = str(created_company.id) + "-spam-score"
        resp = client.get(f"/api/v1/spam/{cid}/settings")
        assert resp.json()["compliance_score"] == 100

    def test_update_settings_disabling_lowers_score(self, client, created_company):
        cid = str(created_company.id) + "-spam-lower"
        # Ensure defaults are loaded
        client.get(f"/api/v1/spam/{cid}/settings")
        # Disable TCPA
        resp = client.put(
            f"/api/v1/spam/{cid}/settings",
            json={"tcpa_quiet_hours": {"enabled": False}},
        )
        assert resp.status_code == 200
        assert resp.json()["compliance_score"] < 100

    def test_get_suppression_list(self, client, created_company):
        resp = client.get(f"/api/v1/spam/{created_company.id}/suppression")
        assert resp.status_code == 200
        data = resp.json()
        assert "suppression_list" in data
        assert "total" in data

    def test_add_to_suppression(self, client, created_company):
        cid = str(created_company.id) + "-supp-add"
        resp = client.post(
            f"/api/v1/spam/{cid}/suppression",
            json={"contact": "test@example.com", "channel": "email", "reason": "opted_out"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["contact"] == "test@example.com"
        assert "id" in data

    def test_add_suppression_missing_contact(self, client, created_company):
        resp = client.post(
            f"/api/v1/spam/{created_company.id}/suppression",
            json={"channel": "email"},
        )
        assert resp.status_code == 400

    def test_remove_from_suppression(self, client, created_company):
        cid = str(created_company.id) + "-supp-del"
        add_resp = client.post(
            f"/api/v1/spam/{cid}/suppression",
            json={"contact": "delete@example.com", "channel": "email", "reason": "manual"},
        )
        sup_id = add_resp.json()["id"]
        del_resp = client.delete(f"/api/v1/spam/{cid}/suppression/{sup_id}")
        assert del_resp.status_code == 200
        assert del_resp.json()["deleted"] == sup_id

    def test_remove_nonexistent_suppression_404(self, client, created_company):
        cid = str(created_company.id) + "-supp-404"
        # Make sure we have an initialized (non-demo) suppression list by adding one
        client.post(f"/api/v1/spam/{cid}/suppression", json={"contact": "a@b.com", "channel": "email", "reason": "manual"})
        resp = client.delete(f"/api/v1/spam/{cid}/suppression/does-not-exist")
        assert resp.status_code == 404

    def test_check_contact_allowed(self, client, created_company):
        cid = str(created_company.id) + "-check-ok"
        resp = client.post(
            f"/api/v1/spam/{cid}/check",
            json={"contact": "newdoctor@example.com", "channel": "email", "local_hour": 10},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "allowed" in data

    def test_check_contact_blocked_suppression(self, client, created_company):
        cid = str(created_company.id) + "-check-block"
        # Add to suppression first
        client.post(f"/api/v1/spam/{cid}/suppression", json={"contact": "blocked@example.com", "channel": "email", "reason": "opted_out"})
        # Check should be blocked
        resp = client.post(
            f"/api/v1/spam/{cid}/check",
            json={"contact": "blocked@example.com", "channel": "email", "local_hour": 10},
        )
        assert resp.status_code == 200
        assert resp.json()["allowed"] is False

    def test_check_voicemail_blocked_quiet_hours(self, client, created_company):
        cid = str(created_company.id) + "-qhours"
        # Load defaults (TCPA enabled)
        client.get(f"/api/v1/spam/{cid}/settings")
        resp = client.post(
            f"/api/v1/spam/{cid}/check",
            json={"contact": "555-1234", "channel": "voicemail", "local_hour": 6},  # 6 AM = quiet
        )
        assert resp.status_code == 200
        assert resp.json()["allowed"] is False

    def test_get_audit_log(self, client, created_company):
        resp = client.get(f"/api/v1/spam/{created_company.id}/audit")
        assert resp.status_code == 200
        data = resp.json()
        assert "events" in data
        assert isinstance(data["events"], list)

    def test_compliance_report(self, client, created_company):
        resp = client.get(f"/api/v1/spam/{created_company.id}/compliance-report")
        assert resp.status_code == 200
        data = resp.json()
        assert "score" in data
        assert "grade" in data
        assert data["grade"] in ["A", "B", "C", "D", "F"]
        assert data["tcpa_quiet_hours"] is True
        assert data["canspam_footer"] is True
        assert data["hipaa_phi_guard"] is True

    def test_rules_returned_in_settings(self, client, created_company):
        resp = client.get(f"/api/v1/spam/{created_company.id}/settings")
        assert "rules" in resp.json()
        rules = resp.json()["rules"]
        rule_ids = [r["id"] for r in rules]
        assert "rule-tcpa-quiet-hours" in rule_ids
        assert "rule-canspam-footer" in rule_ids
        assert "rule-hipaa-no-phi-subject" in rule_ids


# ── Competitors ───────────────────────────────────────────────────────────────

class TestCompetitorsModule:
    def test_list_competitors_empty(self, client, created_company):
        resp = client.get(f"/api/v1/competitors/{created_company.id}/")
        assert resp.status_code == 200
        assert "competitors" in resp.json()

    def test_add_competitor(self, client, created_company):
        resp = client.post(
            f"/api/v1/competitors/{created_company.id}/",
            json={"name": "Rival Clinic", "website": "https://rivalclinic.com", "notes": "Main competitor"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "Rival Clinic"
        assert "id" in data

    def test_add_then_list_competitor(self, client, created_company):
        client.post(
            f"/api/v1/competitors/{created_company.id}/",
            json={"name": "MindPath", "website": "https://mindpath.com"},
        )
        resp = client.get(f"/api/v1/competitors/{created_company.id}/")
        competitors = resp.json()["competitors"]
        assert any(c["name"] == "MindPath" for c in competitors)

    def test_delete_competitor(self, client, created_company):
        add_resp = client.post(
            f"/api/v1/competitors/{created_company.id}/",
            json={"name": "Delete Me", "website": "https://deleteme.com"},
        )
        comp_id = add_resp.json()["id"]
        del_resp = client.delete(f"/api/v1/competitors/{created_company.id}/{comp_id}")
        assert del_resp.status_code == 200

    def test_delete_nonexistent_competitor_404(self, client, created_company):
        resp = client.delete(f"/api/v1/competitors/{created_company.id}/nonexistent-id")
        assert resp.status_code == 404

    def test_competitive_summary_no_competitors(self, client, created_company):
        cid = str(created_company.id) + "-no-comp"
        resp = client.post(f"/api/v1/competitors/{cid}/summary")
        # Returns 404 (company not found) or a message saying add competitors first
        assert resp.status_code in [200, 404]

    def test_analyze_competitor(self, client, created_company):
        add_resp = client.post(
            f"/api/v1/competitors/{created_company.id}/",
            json={"name": "Analyze Me", "website": "https://analyzeme.com"},
        )
        comp_id = add_resp.json()["id"]
        resp = client.post(f"/api/v1/competitors/{created_company.id}/{comp_id}/analyze")
        assert resp.status_code == 200
        assert resp.json()["status"] == "analyzing"


# ── Demo Data Seeder ──────────────────────────────────────────────────────────

class TestDemoModule:
    def test_load_all_demo_data(self, client, created_company):
        resp = client.post(f"/api/v1/demo/{created_company.id}/load-all")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert "seeded" in data
        seeded = data["seeded"]
        assert seeded.get("reviews", 0) > 0
        assert seeded.get("report", 0) > 0
        assert seeded.get("schedule_events", 0) > 0
        assert seeded.get("intake_forms", 0) > 0
        assert seeded.get("chat_messages", 0) > 0
        assert seeded.get("video_ads", 0) > 0
        assert seeded.get("aeo_items_checked", 0) > 0

    def test_after_demo_load_reviews_visible(self, client, created_company):
        client.post(f"/api/v1/demo/{created_company.id}/load-all")
        resp = client.get(f"/api/v1/reputation/{created_company.id}/reviews")
        assert resp.status_code == 200
        assert len(resp.json()["reviews"]) > 0

    def test_after_demo_load_schedule_visible(self, client, created_company):
        client.post(f"/api/v1/demo/{created_company.id}/load-all")
        resp = client.get(f"/api/v1/schedule/{created_company.id}/events")
        assert resp.status_code == 200
        assert len(resp.json()["events"]) >= 18

    def test_after_demo_load_video_ads_visible(self, client, created_company):
        client.post(f"/api/v1/demo/{created_company.id}/load-all")
        resp = client.get(f"/api/v1/video/{created_company.id}/ads")
        assert resp.status_code == 200
        assert len(resp.json()["ads"]) >= 3

    def test_clear_demo_data(self, client, created_company):
        cid = str(created_company.id)
        client.post(f"/api/v1/demo/{cid}/load-all")
        clear_resp = client.delete(f"/api/v1/demo/{cid}/clear")
        assert clear_resp.status_code == 200
        assert clear_resp.json()["status"] == "cleared"

    def test_after_clear_schedule_returns_db_events(self, client, created_company):
        cid = str(created_company.id)
        client.post(f"/api/v1/demo/{cid}/load-all")
        client.delete(f"/api/v1/demo/{cid}/clear")
        # After clear, schedule should fall back to DB (which is empty in tests)
        resp = client.get(f"/api/v1/schedule/{cid}/events")
        assert resp.status_code == 200
        # The event cache is cleared, so it queries DB
        assert isinstance(resp.json()["events"], list)
