"""
Extended LLM service tests covering methods not tested in test_services.py.
"""
import json
import pytest
from unittest.mock import MagicMock, patch


def _company_data():
    return {
        "company_name": "Novamind Mental Health",
        "website_url": "https://novamindmentalhealth.com",
        "specialty_niche": "TMS therapy",
        "services": [{"name": "TMS Therapy"}, {"name": "Ketamine Infusions"}],
        "providers": [{"name": "Dr. Chen", "credentials": "MD"}],
        "locations": [{"city": "Phoenix", "state": "AZ", "phone": "602-555-0100"}],
        "insurance_accepted": ["Aetna", "BCBS"],
        "differentiators": ["Same-week intake"],
        "brand_guidelines": {"tone": "warm and clinical", "primary_color": "#2563EB"},
    }


def _make_llm(return_value):
    """Create an LLMService whose _chat returns a JSON string."""
    from app.services.llm import LLMService
    svc = LLMService.__new__(LLMService)
    mock_client = MagicMock()
    mock_resp = MagicMock()
    mock_resp.content = [MagicMock(text=json.dumps(return_value))]
    mock_client.messages.create.return_value = mock_resp
    svc.client = mock_client
    svc.bulk_model = "claude-haiku-4-5-20251001"
    svc.strategy_model = "claude-opus-4-6"
    return svc


class TestLLMMetaAdCopy:
    def test_generate_meta_ad_copy_returns_dict(self):
        payload = {
            "primary_text": "Find relief from depression.",
            "headline": "TMS Therapy Phoenix",
            "cta": "LEARN_MORE",
        }
        svc = _make_llm(payload)
        audience = {"name": "Depression Seekers", "age": "25-54"}
        result = svc.generate_meta_ad_copy(_company_data(), audience)
        assert result["headline"] == "TMS Therapy Phoenix"
        assert result["cta"] == "LEARN_MORE"

    def test_generate_meta_ad_copy_uses_strategy_model(self):
        from app.services.llm import LLMService
        svc = LLMService.__new__(LLMService)
        mock_client = MagicMock()
        mock_resp = MagicMock()
        mock_resp.content = [MagicMock(text='{"primary_text": "x", "headline": "y", "cta": "LEARN_MORE"}')]
        mock_client.messages.create.return_value = mock_resp
        svc.client = mock_client
        svc.bulk_model = "bulk-model"
        svc.strategy_model = "strategy-model"

        svc.generate_meta_ad_copy(_company_data(), {})
        # Meta ad copy uses bulk model (not strategy)
        call_kwargs = mock_client.messages.create.call_args
        assert call_kwargs is not None


class TestLLMSEOAnalysis:
    def test_analyze_seo_data_returns_recommendations(self):
        payload = {
            "summary": "Site needs improvement",
            "quick_wins": [{"action": "Add meta descriptions", "priority": "high"}],
            "technical_fixes": [],
            "content_opportunities": [{"keyword": "tms phoenix", "intent": "commercial"}],
            "local_seo_actions": [],
            "schema_recommendations": [],
            "30_day_action_plan": [],
        }
        svc = _make_llm(payload)
        result = svc.analyze_seo_data(
            _company_data(),
            {"impressions": 1000},
            {"pages": [], "errors": [], "meta_issues": []},
        )
        assert len(result["quick_wins"]) == 1
        assert result["summary"] == "Site needs improvement"

    def test_analyze_seo_data_uses_strategy_model(self):
        from app.services.llm import LLMService
        svc = LLMService.__new__(LLMService)
        mock_client = MagicMock()
        mock_resp = MagicMock()
        mock_resp.content = [MagicMock(text='{"quick_wins": [], "technical_fixes": [], "content_opportunities": []}')]
        mock_client.messages.create.return_value = mock_resp
        svc.client = mock_client
        svc.bulk_model = "bulk"
        svc.strategy_model = "strategy"

        svc.analyze_seo_data(_company_data(), {}, {})
        call_kwargs = mock_client.messages.create.call_args[1]
        assert call_kwargs["model"] == "strategy"


class TestLLMDirectoryProfiles:
    def test_generate_directory_profiles_returns_dict(self):
        payload = {
            "practice_description_50": "Novamind offers TMS and ketamine.",
            "practice_description_150": "Novamind Mental Health provides TMS therapy...",
            "practice_description_500": "Full description...",
            "provider_bios": [{"provider_name": "Dr. Chen", "bio_first_person": "I am..."}],
            "services": ["TMS Therapy"],
            "conditions": ["Depression", "Anxiety"],
            "insurance": ["Aetna"],
            "faq": [{"question": "Do you accept insurance?", "answer": "Yes."}],
        }
        svc = _make_llm(payload)
        result = svc.generate_directory_profiles(_company_data(), "psychology_today")

        assert result["practice_description_50"].startswith("Novamind")
        assert len(result["provider_bios"]) == 1
        assert "Depression" in result["conditions"]

    def test_generate_directory_profiles_with_different_platform(self):
        payload = {"practice_description_50": "Short.", "practice_description_150": "Medium.",
                   "practice_description_500": "Long.", "provider_bios": [], "services": [],
                   "conditions": [], "insurance": [], "faq": []}
        svc = _make_llm(payload)
        result = svc.generate_directory_profiles(_company_data(), "healthgrades")
        assert result is not None


class TestLLMContentCalendar:
    def test_generate_content_calendar_returns_weeks(self):
        payload = {
            "strategy_overview": "Focus on education and trust-building",
            "content_pillars": ["Treatment education", "Patient stories"],
            "weeks": [
                {"week": i, "theme": f"Week {i}", "blog_topics": [], "social_themes": []}
                for i in range(1, 5)
            ]
        }
        svc = _make_llm(payload)
        result = svc.generate_content_calendar(_company_data(), weeks=4)

        assert len(result["weeks"]) == 4
        assert result["strategy_overview"] != ""

    def test_generate_content_calendar_uses_strategy_model(self):
        from app.services.llm import LLMService
        svc = LLMService.__new__(LLMService)
        mock_client = MagicMock()
        mock_resp = MagicMock()
        mock_resp.content = [MagicMock(text='{"weeks": []}')]
        mock_client.messages.create.return_value = mock_resp
        svc.client = mock_client
        svc.bulk_model = "bulk"
        svc.strategy_model = "strategy"

        svc.generate_content_calendar(_company_data(), weeks=12)
        call_kwargs = mock_client.messages.create.call_args[1]
        assert call_kwargs["model"] == "strategy"


class TestLLMJsonStripping:
    def test_strips_json_code_fence_with_language(self):
        from app.services.llm import LLMService
        svc = LLMService.__new__(LLMService)
        mock_client = MagicMock()
        mock_resp = MagicMock()
        mock_resp.content = [MagicMock(text='```json\n{"key": "value"}\n```')]
        mock_client.messages.create.return_value = mock_resp
        svc.client = mock_client
        svc.bulk_model = "model"
        svc.strategy_model = "model"

        result = svc._chat_json("test prompt")
        assert result == {"key": "value"}

    def test_strips_plain_code_fence(self):
        from app.services.llm import LLMService
        svc = LLMService.__new__(LLMService)
        mock_client = MagicMock()
        mock_resp = MagicMock()
        mock_resp.content = [MagicMock(text='```\n{"key": "value"}\n```')]
        mock_client.messages.create.return_value = mock_resp
        svc.client = mock_client
        svc.bulk_model = "model"
        svc.strategy_model = "model"

        result = svc._chat_json("test prompt")
        assert result == {"key": "value"}

    def test_returns_raw_json_without_fence(self):
        from app.services.llm import LLMService
        svc = LLMService.__new__(LLMService)
        mock_client = MagicMock()
        mock_resp = MagicMock()
        mock_resp.content = [MagicMock(text='{"key": "value"}')]
        mock_client.messages.create.return_value = mock_resp
        svc.client = mock_client
        svc.bulk_model = "model"
        svc.strategy_model = "model"

        result = svc._chat_json("test prompt")
        assert result == {"key": "value"}


class TestLLMIngestionExtended:
    def test_extract_company_data_includes_url(self):
        payload = {
            "company_name": "Novamind",
            "specialty_niche": "TMS",
            "services": [],
            "providers": [],
            "locations": [],
            "insurance_accepted": [],
            "differentiators": [],
            "target_demographics": [],
            "brand_guidelines": {},
        }
        svc = _make_llm(payload)
        result = svc.extract_company_data("<html>content</html>", "https://example.com")
        assert result["company_name"] == "Novamind"
