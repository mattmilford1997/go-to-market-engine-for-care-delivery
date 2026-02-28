"""Tests for service layer: LLM, NPPES, scraper, ingestion."""
import json
import pytest
from unittest.mock import patch, MagicMock, AsyncMock


class TestLLMService:
    """Tests for LLM service — mock the Anthropic client."""

    def _make_llm_with_mock(self, response_text: str):
        """Helper: return an LLMService instance with mocked Anthropic client."""
        from app.services.llm import LLMService
        svc = LLMService.__new__(LLMService)
        mock_client = MagicMock()
        mock_response = MagicMock()
        mock_response.content = [MagicMock(text=response_text)]
        mock_client.messages.create.return_value = mock_response
        svc.client = mock_client
        svc.bulk_model = "claude-sonnet-4-6"
        svc.strategy_model = "claude-opus-4-6"
        return svc

    def test_extract_company_data_returns_dict(self):
        expected = {
            "company_name": "Novamind Mental Health",
            "specialty_niche": "TMS therapy, ketamine",
            "services": [{"name": "TMS Therapy"}],
            "providers": [],
            "locations": [],
            "insurance_accepted": [],
            "differentiators": [],
            "target_demographics": [],
            "brand_guidelines": {"tone": "warm"},
        }
        svc = self._make_llm_with_mock(json.dumps(expected))
        result = svc.extract_company_data("<html>test</html>", "https://novamind.com")
        assert result["company_name"] == "Novamind Mental Health"
        assert result["specialty_niche"] == "TMS therapy, ketamine"

    def test_generate_keyword_clusters_returns_list(self):
        expected = [
            {"cluster_name": "TMS Local", "keywords": ["tms therapy near me"], "service": "TMS"},
            {"cluster_name": "Ketamine Phoenix", "keywords": ["ketamine therapy phoenix"], "service": "Ketamine"},
        ]
        svc = self._make_llm_with_mock(json.dumps(expected))
        result = svc.generate_keyword_clusters({"company_name": "Novamind", "services": []})
        assert isinstance(result, list)
        assert len(result) == 2
        assert result[0]["cluster_name"] == "TMS Local"

    def test_generate_google_ad_copy_structure(self):
        expected = {
            "headlines": [f"H{i}" for i in range(15)],
            "descriptions": [f"D{i}" for i in range(4)],
            "sitelinks": [],
            "callouts": ["Same-week intake"],
            "structured_snippets": {"header": "Services", "values": ["TMS", "Ketamine"]},
        }
        svc = self._make_llm_with_mock(json.dumps(expected))
        result = svc.generate_google_ad_copy(
            {"company_name": "Novamind", "services": [], "insurance_accepted": [], "differentiators": [], "locations": []},
            {"cluster_name": "TMS", "keywords": ["tms therapy"]}
        )
        assert len(result["headlines"]) == 15
        assert len(result["descriptions"]) == 4

    def test_generate_fax_sheet_content(self):
        expected = {
            "headline": "Refer Your Patients",
            "intro_paragraph": "We offer TMS therapy.",
            "key_services_for_this_specialty": ["TMS"],
            "opt_out_text": "To stop faxes, call us",
        }
        svc = self._make_llm_with_mock(json.dumps(expected))
        result = svc.generate_fax_sheet_content({"company_name": "Novamind"}, "PCP")
        assert result["headline"] == "Refer Your Patients"
        assert "opt_out_text" in result

    def test_generate_voicemail_scripts_returns_three_variants(self):
        expected = [
            {"variant": i, "script": f"Script {i}", "word_count": 85, "estimated_duration_seconds": 35}
            for i in range(1, 4)
        ]
        svc = self._make_llm_with_mock(json.dumps(expected))
        result = svc.generate_voicemail_scripts({"company_name": "Novamind"}, "PCP")
        assert len(result) == 3
        for script in result:
            assert "script" in script
            assert "variant" in script

    def test_generate_email_sequence_returns_seven_emails(self):
        expected = [
            {"step": i, "day": i * 4, "subject": f"Subject {i}", "body": f"Body {i}", "cta": "Schedule"}
            for i in range(1, 8)
        ]
        svc = self._make_llm_with_mock(json.dumps(expected))
        result = svc.generate_email_sequence({"company_name": "Novamind", "insurance_accepted": []}, "PCP")
        assert len(result) == 7
        assert result[0]["step"] == 1

    def test_generate_blog_post_structure(self):
        expected = {
            "title": "Is TMS Covered by Insurance?",
            "meta_description": "Learn about TMS coverage.",
            "slug": "tms-insurance-coverage",
            "target_keyword": "TMS therapy insurance",
            "body_markdown": "# Is TMS Covered?\n\nYes...",
            "faq_schema": [{"question": "Q", "answer": "A"}],
            "estimated_word_count": 1500,
        }
        svc = self._make_llm_with_mock(json.dumps(expected))
        result = svc.generate_blog_post({"company_name": "Novamind"}, "TMS therapy insurance")
        assert result["title"] == "Is TMS Covered by Insurance?"
        assert result["meta_description"] == "Learn about TMS coverage."
        assert len(result["slug"]) > 0

    def test_generate_social_posts_structure(self):
        expected = [
            {"type": "educational", "caption": "TMS can help...", "hashtags": ["mentalhealth"], "image_concept": "Person smiling"}
        ] * 5
        svc = self._make_llm_with_mock(json.dumps(expected))
        result = svc.generate_social_posts({"company_name": "Novamind"}, "facebook", 5)
        assert len(result) == 5
        assert "caption" in result[0]

    def test_generate_directory_profiles_structure(self):
        expected = {
            "practice_description_50": "Short.",
            "practice_description_150": "Medium description here.",
            "practice_description_500": "Long description...",
            "provider_bios": [{"provider_name": "Dr. Chen", "bio_first_person": "I specialize..."}],
            "services": ["TMS Therapy"],
            "conditions": ["Depression"],
            "insurance": ["Aetna"],
        }
        svc = self._make_llm_with_mock(json.dumps(expected))
        result = svc.generate_directory_profiles({"company_name": "Novamind"}, "psychology_today")
        assert "practice_description_50" in result
        assert len(result["provider_bios"]) == 1

    def test_chat_json_strips_markdown_fences(self):
        """Ensure _chat_json handles ```json ... ``` wrapped responses."""
        raw = '```json\n{"key": "value"}\n```'
        svc = self._make_llm_with_mock(raw)
        result = svc._chat_json("prompt")
        assert result["key"] == "value"

    def test_generate_postcard_copy(self):
        expected = {
            "front": {"headline": "Get Better", "key_points": ["TMS", "Ketamine"], "cta_text": "Call Now"},
            "back": {"headline": "About Us", "body": "We help patients..."},
        }
        svc = self._make_llm_with_mock(json.dumps(expected))
        result = svc.generate_postcard_copy({"company_name": "Novamind"})
        assert result["front"]["headline"] == "Get Better"
        assert "cta_text" in result["front"]


class TestNPPESService:
    """Tests for NPPES lead generation service."""

    def test_parse_nppes_result_full(self):
        from app.services.nppes import parse_nppes_result
        raw = {
            "number": "1234567890",
            "basic": {
                "first_name": "John",
                "last_name": "Smith",
                "credential": "MD",
            },
            "addresses": [
                {
                    "address_purpose": "LOCATION",
                    "address_1": "123 Main St",
                    "city": "Phoenix",
                    "state": "AZ",
                    "postal_code": "85001",
                    "telephone_number": "602-555-1234",
                    "fax_number": "602-555-4321",
                }
            ],
            "taxonomies": [
                {"desc": "Family Medicine", "primary": True}
            ],
        }
        result = parse_nppes_result(raw)
        assert result["npi"] == "1234567890"
        assert result["first_name"] == "John"
        assert result["last_name"] == "Smith"
        assert result["credentials"] == "MD"
        assert result["specialty"] == "Family Medicine"
        assert result["city"] == "Phoenix"
        assert result["state"] == "AZ"
        assert result["zip_code"] == "85001"
        assert result["fax"] == "602-555-4321"
        assert result["source"] == "nppes"

    def test_parse_nppes_result_minimal(self):
        from app.services.nppes import parse_nppes_result
        raw = {"number": "9876543210", "basic": {}, "addresses": [], "taxonomies": []}
        result = parse_nppes_result(raw)
        assert result["npi"] == "9876543210"
        assert result["first_name"] == ""
        assert result["city"] == ""

    def test_parse_nppes_zip_truncated(self):
        from app.services.nppes import parse_nppes_result
        raw = {
            "number": "1111111111",
            "basic": {},
            "addresses": [{"address_purpose": "LOCATION", "postal_code": "85001-1234"}],
            "taxonomies": [],
        }
        result = parse_nppes_result(raw)
        assert result["zip_code"] == "85001"

    @pytest.mark.asyncio
    async def test_query_nppes_returns_list(self):
        from app.services.nppes import query_nppes
        mock_data = {
            "results": [
                {
                    "number": "1234567890",
                    "basic": {"first_name": "Jane", "last_name": "Doe", "credential": "DO"},
                    "addresses": [{"address_purpose": "LOCATION", "city": "Phoenix", "state": "AZ", "postal_code": "85001"}],
                    "taxonomies": [{"desc": "Internal Medicine", "primary": True}],
                }
            ]
        }
        import httpx
        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client_cls.return_value.__aenter__.return_value = mock_client
            mock_resp = MagicMock()
            mock_resp.json.return_value = mock_data
            mock_resp.raise_for_status = MagicMock()
            mock_client.get = AsyncMock(return_value=mock_resp)

            results = await query_nppes("Phoenix", "AZ", "207Q00000X")
            assert isinstance(results, list)

    @pytest.mark.asyncio
    async def test_query_nppes_handles_error(self):
        from app.services.nppes import query_nppes
        import httpx
        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client_cls.return_value.__aenter__.return_value = mock_client
            mock_client.get = AsyncMock(side_effect=Exception("Network error"))
            results = await query_nppes("Phoenix", "AZ", "207Q00000X")
            assert results == []

    @pytest.mark.asyncio
    async def test_generate_lead_list_no_locations(self):
        from app.services.nppes import generate_lead_list_for_company
        result = await generate_lead_list_for_company({"company_name": "Test", "locations": []})
        assert result == []

    @pytest.mark.asyncio
    async def test_generate_lead_list_deduplicates(self):
        from app.services.nppes import generate_lead_list_for_company
        duplicate_lead = {
            "number": "1234567890",
            "basic": {"first_name": "John", "last_name": "Smith"},
            "addresses": [{"address_purpose": "LOCATION", "city": "Phoenix", "state": "AZ", "postal_code": "85001"}],
            "taxonomies": [{"desc": "Family Medicine", "primary": True}],
        }

        with patch("app.services.nppes.query_nppes", return_value=[duplicate_lead, duplicate_lead]):
            result = await generate_lead_list_for_company({
                "company_name": "Novamind",
                "specialty_niche": "tms therapy",
                "locations": [{"city": "Phoenix", "state": "AZ"}],
            })
            npis = [l["npi"] for l in result]
            assert len(npis) == len(set(npis))


class TestWebScraper:
    """Tests for the website scraper (mocked HTTP)."""

    def test_extract_text_content_strips_html(self):
        from app.services.scraper import WebScraper
        scraper = WebScraper()
        html = "<html><body><h1>TMS Therapy</h1><script>alert(1)</script><p>We offer TMS.</p></body></html>"
        text = scraper.extract_text_content(html)
        assert "TMS Therapy" in text
        assert "We offer TMS." in text
        assert "alert" not in text

    def test_extract_text_caps_at_50k(self):
        from app.services.scraper import WebScraper
        scraper = WebScraper()
        long_html = "<html><body><p>" + "a " * 30000 + "</p></body></html>"
        text = scraper.extract_text_content(long_html)
        assert len(text) <= 50000

    def test_extract_internal_links(self):
        from app.services.scraper import WebScraper
        from bs4 import BeautifulSoup
        scraper = WebScraper()
        html = """
        <html><body>
          <a href="/services">Services</a>
          <a href="/providers">Providers</a>
          <a href="https://external.com">External</a>
          <a href="/about">About</a>
        </body></html>
        """
        soup = BeautifulSoup(html, "html.parser")
        links = scraper._extract_internal_links(soup, "https://novamind.com")
        assert "https://novamind.com/services" in links
        assert "https://novamind.com/providers" in links
        assert "https://novamind.com/about" in links
        assert not any("external.com" in l for l in links)

    def test_prioritize_pages_by_keyword(self):
        from app.services.scraper import WebScraper
        scraper = WebScraper()
        links = [
            "https://novamind.com/contact",
            "https://novamind.com/blog/news",
            "https://novamind.com/services/tms-therapy",
            "https://novamind.com/providers",
            "https://novamind.com/insurance",
        ]
        prioritized = scraper._prioritize_pages(links)
        # Service/provider/insurance pages should score higher
        high_priority = prioritized[:3]
        assert any("tms" in l or "service" in l for l in high_priority)

    def test_extract_structured_data(self):
        from app.services.scraper import WebScraper
        scraper = WebScraper()
        html = """
        <html><head>
          <script type="application/ld+json">
          {"@type": "MedicalOrganization", "name": "Novamind", "telephone": "602-555-0100"}
          </script>
        </head></html>
        """
        schemas = scraper._extract_structured_data(html)
        assert len(schemas) == 1
        assert schemas[0]["@type"] == "MedicalOrganization"
        assert schemas[0]["name"] == "Novamind"

    def test_extract_structured_data_invalid_json(self):
        from app.services.scraper import WebScraper
        scraper = WebScraper()
        html = '<script type="application/ld+json">{ invalid json }</script>'
        schemas = scraper._extract_structured_data(html)
        assert schemas == []

    def test_extract_structured_data_multiple_schemas(self):
        from app.services.scraper import WebScraper
        scraper = WebScraper()
        html = """
        <script type="application/ld+json">{"@type": "Organization"}</script>
        <script type="application/ld+json">{"@type": "LocalBusiness"}</script>
        """
        schemas = scraper._extract_structured_data(html)
        assert len(schemas) == 2

    @pytest.mark.asyncio
    async def test_scrape_website_fallback_on_playwright_missing(self):
        from app.services.scraper import WebScraper
        scraper = WebScraper()

        mock_response = MagicMock()
        mock_response.text = "<html><body><h1>Novamind</h1></body></html>"

        with patch("app.services.scraper.PLAYWRIGHT_AVAILABLE", False):
            with patch("httpx.AsyncClient") as mock_cls:
                mock_client = AsyncMock()
                mock_cls.return_value.__aenter__.return_value = mock_client
                mock_client.get = AsyncMock(return_value=mock_response)
                result = await scraper.scrape_website("https://novamind.com")
                assert "raw_html" in result


class TestIngestionService:
    """Tests for the company ingestion pipeline."""

    def test_slugify(self):
        from app.services.ingestion import _slugify
        assert _slugify("Novamind Mental Health") == "novamind-mental-health"
        assert _slugify("TMS & Ketamine Clinic!") == "tms-ketamine-clinic"
        assert _slugify("  Leading  Spaces  ") == "leading-spaces"
        assert len(_slugify("A" * 100)) <= 80

    def test_slugify_special_characters(self):
        from app.services.ingestion import _slugify
        assert _slugify("Dr. John's Practice") == "dr-johns-practice"
        assert _slugify("Clinic #1") == "clinic-1"

    @pytest.mark.asyncio
    async def test_ingest_company_full_pipeline(self):
        from app.services.ingestion import ingest_company

        mock_scrape_result = {
            "url": "https://novamind.com",
            "raw_html": "<html><body>Novamind TMS Therapy</body></html>",
            "brand_hints": {"colors": ["#2563EB", "rgb(255, 255, 255)"], "fonts": ["Inter, sans-serif"]},
            "structured_data": [{"@type": "MedicalOrganization", "name": "Novamind"}],
            "pages": {},
            "error": None,
        }
        mock_llm_result = {
            "company_name": "Novamind Mental Health",
            "specialty_niche": "TMS therapy",
            "services": [{"name": "TMS Therapy"}],
            "providers": [],
            "locations": [{"city": "Phoenix", "state": "AZ"}],
            "insurance_accepted": ["Aetna"],
            "differentiators": [],
            "target_demographics": [],
            "brand_guidelines": {"tone": "warm"},
        }

        with patch("app.services.ingestion.scraper.scrape_website", return_value=mock_scrape_result):
            with patch("app.services.ingestion.llm_service.extract_company_data", return_value=mock_llm_result):
                result = await ingest_company("https://novamind.com")

        assert result["company_name"] == "Novamind Mental Health"
        assert result["slug"] == "novamind-mental-health"
        assert result["website_url"] == "https://novamind.com"
        assert "css_colors_raw" in result["brand_guidelines"]

    @pytest.mark.asyncio
    async def test_ingest_company_adds_slug_and_url(self):
        from app.services.ingestion import ingest_company

        mock_scrape = {
            "raw_html": "<html>test</html>",
            "brand_hints": {},
            "structured_data": [],
            "error": None,
        }
        mock_llm = {
            "company_name": "Test Clinic",
            "services": [],
            "providers": [],
            "locations": [],
            "insurance_accepted": [],
            "differentiators": [],
            "target_demographics": [],
            "brand_guidelines": {},
        }

        with patch("app.services.ingestion.scraper.scrape_website", return_value=mock_scrape):
            with patch("app.services.ingestion.llm_service.extract_company_data", return_value=mock_llm):
                result = await ingest_company("https://testclinic.com")

        assert result["slug"] == "test-clinic"
        assert result["website_url"] == "https://testclinic.com"

    @pytest.mark.asyncio
    async def test_ingest_company_raises_on_empty_html(self):
        from app.services.ingestion import ingest_company

        mock_scrape = {"raw_html": "", "brand_hints": {}, "structured_data": [], "error": "Timeout"}

        with patch("app.services.ingestion.scraper.scrape_website", return_value=mock_scrape):
            with pytest.raises(ValueError, match="Failed to scrape"):
                await ingest_company("https://broken.com")
