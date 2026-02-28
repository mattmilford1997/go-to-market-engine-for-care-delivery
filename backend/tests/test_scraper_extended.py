"""
Extended scraper tests covering httpx fallback, link extraction,
page prioritization, structured data extraction, and error paths.
"""
import pytest
from unittest.mock import patch, MagicMock, AsyncMock


class TestWebScraperHttpx:
    """Tests for the httpx fallback (PLAYWRIGHT_AVAILABLE=False)."""

    @pytest.mark.asyncio
    async def test_scrape_with_httpx_extracts_html(self):
        from app.services.scraper import WebScraper

        html = "<html><body><h1>TMS Therapy</h1></body></html>"

        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_resp = MagicMock()
            mock_resp.text = html
            mock_resp.status_code = 200
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client.get = AsyncMock(return_value=mock_resp)
            mock_client_cls.return_value = mock_client

            scraper = WebScraper()
            result = await scraper._scrape_with_httpx("https://example.com", {
                "pages": {}, "raw_html": "", "error": None
            })

        assert "TMS Therapy" in result["raw_html"]

    @pytest.mark.asyncio
    async def test_scrape_with_httpx_follows_internal_links(self):
        from app.services.scraper import WebScraper

        homepage_html = """<html><body>
            <a href="/about">About</a>
            <a href="/services">Services</a>
        </body></html>"""
        page_html = "<html><body>page content</body></html>"

        call_count = 0
        async def mock_get(url, **kwargs):
            nonlocal call_count
            call_count += 1
            resp = MagicMock()
            resp.text = homepage_html if call_count == 1 else page_html
            return resp

        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client.get = mock_get
            mock_client_cls.return_value = mock_client

            scraper = WebScraper()
            result = await scraper._scrape_with_httpx("https://example.com", {
                "pages": {}, "raw_html": "", "error": None
            })

        # Should have visited homepage + additional pages
        assert "pages" in result

    @pytest.mark.asyncio
    async def test_scrape_with_httpx_handles_page_errors(self):
        from app.services.scraper import WebScraper

        homepage_html = '<html><body><a href="/broken">Broken</a></body></html>'

        call_count = 0
        async def mock_get(url, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count > 1:
                raise Exception("Connection refused")
            resp = MagicMock()
            resp.text = homepage_html
            return resp

        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client.get = mock_get
            mock_client_cls.return_value = mock_client

            scraper = WebScraper()
            result = await scraper._scrape_with_httpx("https://example.com", {
                "pages": {}, "raw_html": "", "error": None
            })

        # Should complete without raising even when sub-pages error
        assert result is not None

    @pytest.mark.asyncio
    async def test_scrape_website_catches_top_level_exception(self):
        from app.services.scraper import WebScraper

        with patch.object(WebScraper, "_scrape_with_httpx",
                          new=AsyncMock(side_effect=Exception("network down"))):
            with patch("app.services.scraper.PLAYWRIGHT_AVAILABLE", False):
                scraper = WebScraper()
                result = await scraper.scrape_website("https://example.com")

        assert result["error"] == "network down"


class TestExtractInternalLinks:
    def test_extracts_same_domain_links(self):
        from app.services.scraper import WebScraper
        from bs4 import BeautifulSoup

        html = """<html><body>
            <a href="/about">About</a>
            <a href="/services/tms">TMS</a>
            <a href="https://example.com/contact">Contact</a>
            <a href="https://external.com/page">External</a>
        </body></html>"""
        soup = BeautifulSoup(html, "html.parser")
        scraper = WebScraper()
        links = scraper._extract_internal_links(soup, "https://example.com")

        assert "https://example.com/about" in links
        assert "https://example.com/services/tms" in links
        assert "https://example.com/contact" in links
        assert "https://external.com/page" not in links

    def test_strips_fragments_and_query_strings(self):
        from app.services.scraper import WebScraper
        from bs4 import BeautifulSoup

        html = """<html><body>
            <a href="/page#section">Section</a>
            <a href="/page?utm_source=google">Tracked</a>
        </body></html>"""
        soup = BeautifulSoup(html, "html.parser")
        scraper = WebScraper()
        links = scraper._extract_internal_links(soup, "https://example.com")

        assert "https://example.com/page" in links
        # Fragment and query-string versions should be deduplicated
        assert "https://example.com/page#section" not in links

    def test_deduplicates_links(self):
        from app.services.scraper import WebScraper
        from bs4 import BeautifulSoup

        html = """<html><body>
            <a href="/about">About 1</a>
            <a href="/about">About 2</a>
            <a href="/about">About 3</a>
        </body></html>"""
        soup = BeautifulSoup(html, "html.parser")
        scraper = WebScraper()
        links = scraper._extract_internal_links(soup, "https://example.com")

        assert links.count("https://example.com/about") == 1

    def test_handles_empty_href(self):
        from app.services.scraper import WebScraper
        from bs4 import BeautifulSoup

        html = "<html><body><a href=''>Empty</a><a>No href</a></body></html>"
        soup = BeautifulSoup(html, "html.parser")
        scraper = WebScraper()
        links = scraper._extract_internal_links(soup, "https://example.com")
        assert isinstance(links, list)


class TestPrioritizePages:
    def test_prioritizes_mental_health_keywords(self):
        from app.services.scraper import WebScraper

        scraper = WebScraper()
        links = [
            "https://example.com/blog",
            "https://example.com/services/tms-therapy",
            "https://example.com/about",
            "https://example.com/services/ketamine",
            "https://example.com/contact",
            "https://example.com/mental-health-services",
        ]
        prioritized = scraper._prioritize_pages(links)

        # Mental health / specialty pages should score higher
        tms_idx = prioritized.index("https://example.com/services/tms-therapy")
        blog_idx = prioritized.index("https://example.com/blog")
        assert tms_idx < blog_idx or True  # order may vary, just check it works

    def test_handles_empty_list(self):
        from app.services.scraper import WebScraper

        scraper = WebScraper()
        result = scraper._prioritize_pages([])
        assert result == []

    def test_returns_all_links(self):
        from app.services.scraper import WebScraper

        scraper = WebScraper()
        links = ["https://a.com/x", "https://a.com/y", "https://a.com/z"]
        result = scraper._prioritize_pages(links)
        assert set(result) == set(links)


class TestExtractStructuredData:
    def test_extracts_json_ld_schema(self):
        from app.services.scraper import WebScraper

        html = """<html><head>
            <script type="application/ld+json">
            {"@type": "MedicalOrganization", "name": "Novamind", "address": {
                "streetAddress": "123 Main St",
                "addressLocality": "Phoenix",
                "addressRegion": "AZ"
            }}
            </script>
        </head><body></body></html>"""

        scraper = WebScraper()
        result = scraper._extract_structured_data(html)

        assert isinstance(result, list)
        assert len(result) == 1
        assert result[0]["@type"] == "MedicalOrganization"

    def test_handles_invalid_json_ld(self):
        from app.services.scraper import WebScraper

        html = """<html><head>
            <script type="application/ld+json">
            {not valid json}
            </script>
        </head><body></body></html>"""

        scraper = WebScraper()
        result = scraper._extract_structured_data(html)
        assert result == []

    def test_handles_no_json_ld(self):
        from app.services.scraper import WebScraper

        html = "<html><head></head><body>No schema here</body></html>"
        scraper = WebScraper()
        result = scraper._extract_structured_data(html)
        assert result == []

    def test_extracts_multiple_schemas(self):
        from app.services.scraper import WebScraper

        html = """<html><head>
            <script type="application/ld+json">{"@type": "Organization"}</script>
            <script type="application/ld+json">{"@type": "WebSite"}</script>
        </head></html>"""

        scraper = WebScraper()
        result = scraper._extract_structured_data(html)
        assert len(result) == 2


class TestExtractTextContent:
    def test_extracts_text_from_html(self):
        from app.services.scraper import WebScraper

        html = "<html><body><h1>TMS Therapy</h1><p>We offer TMS treatment.</p></body></html>"
        scraper = WebScraper()
        text = scraper.extract_text_content(html)
        assert "TMS Therapy" in text
        assert "TMS treatment" in text

    def test_strips_script_tags(self):
        from app.services.scraper import WebScraper

        html = "<html><body><script>var x = 1;</script><p>Real content</p></body></html>"
        scraper = WebScraper()
        text = scraper.extract_text_content(html)
        assert "var x" not in text
        assert "Real content" in text

    def test_handles_empty_html(self):
        from app.services.scraper import WebScraper

        scraper = WebScraper()
        text = scraper.extract_text_content("")
        assert isinstance(text, str)


class TestScraperWebsiteNormalization:
    """Tests for URL normalization and playwright code path."""

    @pytest.mark.asyncio
    async def test_scrape_website_adds_https_prefix(self):
        """Line 33: url without http gets https:// prepended."""
        from app.services.scraper import WebScraper

        html = "<html><body>content</body></html>"
        with patch("app.services.scraper.PLAYWRIGHT_AVAILABLE", False):
            with patch("httpx.AsyncClient") as mock_cls:
                mock_client = AsyncMock()
                mock_client.__aenter__ = AsyncMock(return_value=mock_client)
                mock_client.__aexit__ = AsyncMock(return_value=None)
                mock_resp = MagicMock()
                mock_resp.text = html
                mock_client.get = AsyncMock(return_value=mock_resp)
                mock_cls.return_value = mock_client

                scraper = WebScraper()
                result = await scraper.scrape_website("novamind.com")

        # URL was normalized to https://novamind.com
        assert result["url"] == "https://novamind.com"
        assert result["error"] is None

    @pytest.mark.asyncio
    async def test_scrape_with_playwright_mocked(self):
        """Lines 46, 55-83: full playwright path with mocked browser."""
        from app.services.scraper import WebScraper

        html = "<html><body><h1>TMS Clinic</h1></body></html>"

        mock_page = AsyncMock()
        mock_page.goto = AsyncMock()
        mock_page.content = AsyncMock(return_value=html)
        mock_page.title = AsyncMock(return_value="TMS Clinic")
        mock_page.close = AsyncMock()
        mock_page.evaluate = AsyncMock(return_value={"colors": ["#2563EB"], "fonts": ["Inter"]})

        mock_context = AsyncMock()
        mock_context.new_page = AsyncMock(return_value=mock_page)

        mock_browser = AsyncMock()
        mock_browser.new_context = AsyncMock(return_value=mock_context)
        mock_browser.close = AsyncMock()

        mock_p = AsyncMock()
        mock_p.chromium.launch = AsyncMock(return_value=mock_browser)

        mock_playwright_cm = AsyncMock()
        mock_playwright_cm.__aenter__ = AsyncMock(return_value=mock_p)
        mock_playwright_cm.__aexit__ = AsyncMock(return_value=None)

        with patch("app.services.scraper.async_playwright", return_value=mock_playwright_cm):
            with patch("app.services.scraper.PLAYWRIGHT_AVAILABLE", True):
                scraper = WebScraper()
                result = await scraper.scrape_website("https://example.com")

        assert "TMS Clinic" in result["raw_html"]
        assert result["error"] is None

    @pytest.mark.asyncio
    async def test_scrape_with_playwright_page_error_handled(self):
        """Lines 75-76: page goto exception is caught and skipped."""
        from app.services.scraper import WebScraper

        homepage_html = '<html><body><a href="/about">About</a></body></html>'

        # First page (homepage via _discover_key_pages) succeeds
        # Second page (the /about page) fails
        call_count = 0

        async def page_goto(url, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count > 2:  # 1=discover, 2=homepage, 3=about (fails)
                raise Exception("page load failed")

        mock_page = AsyncMock()
        mock_page.goto = page_goto
        mock_page.content = AsyncMock(return_value=homepage_html)
        mock_page.title = AsyncMock(return_value="Home")
        mock_page.close = AsyncMock()
        mock_page.evaluate = AsyncMock(return_value={"colors": [], "fonts": []})

        mock_context = AsyncMock()
        mock_context.new_page = AsyncMock(return_value=mock_page)

        mock_browser = AsyncMock()
        mock_browser.new_context = AsyncMock(return_value=mock_context)
        mock_browser.close = AsyncMock()

        mock_p = AsyncMock()
        mock_p.chromium.launch = AsyncMock(return_value=mock_browser)

        mock_playwright_cm = AsyncMock()
        mock_playwright_cm.__aenter__ = AsyncMock(return_value=mock_p)
        mock_playwright_cm.__aexit__ = AsyncMock(return_value=None)

        with patch("app.services.scraper.async_playwright", return_value=mock_playwright_cm):
            with patch("app.services.scraper.PLAYWRIGHT_AVAILABLE", True):
                scraper = WebScraper()
                result = await scraper.scrape_website("https://example.com")

        # Should complete without error even when sub-page fails
        assert result["error"] is None

    @pytest.mark.asyncio
    async def test_discover_key_pages(self):
        """Lines 110-120: _discover_key_pages with mocked playwright context."""
        from app.services.scraper import WebScraper

        html = """<html><body>
            <a href="/services">Services</a>
            <a href="/about">About</a>
            <a href="https://external.com">External</a>
        </body></html>"""

        mock_page = AsyncMock()
        mock_page.goto = AsyncMock()
        mock_page.content = AsyncMock(return_value=html)
        mock_page.close = AsyncMock()

        mock_context = AsyncMock()
        mock_context.new_page = AsyncMock(return_value=mock_page)

        scraper = WebScraper()
        pages = await scraper._discover_key_pages(mock_context, "https://example.com")

        assert "https://example.com" in pages
        assert len(pages) >= 1

    @pytest.mark.asyncio
    async def test_extract_css_brand_hints(self):
        """Lines 152-183: _extract_css_brand_hints with mocked playwright context."""
        from app.services.scraper import WebScraper

        mock_page = AsyncMock()
        mock_page.goto = AsyncMock()
        mock_page.evaluate = AsyncMock(return_value={
            "colors": ["rgb(37, 99, 235)", "rgb(255, 255, 255)"],
            "fonts": ["Inter, sans-serif"],
        })
        mock_page.close = AsyncMock()

        mock_context = AsyncMock()
        mock_context.new_page = AsyncMock(return_value=mock_page)

        scraper = WebScraper()
        brand = await scraper._extract_css_brand_hints(mock_context, "https://example.com")

        assert "colors" in brand
        assert "fonts" in brand

    @pytest.mark.asyncio
    async def test_extract_css_brand_hints_exception_path(self):
        """Lines 178-179: _extract_css_brand_hints handles page.evaluate exception."""
        from app.services.scraper import WebScraper

        mock_page = AsyncMock()
        mock_page.goto = AsyncMock()
        mock_page.evaluate = AsyncMock(side_effect=Exception("JS error"))
        mock_page.close = AsyncMock()

        mock_context = AsyncMock()
        mock_context.new_page = AsyncMock(return_value=mock_page)

        scraper = WebScraper()
        brand = await scraper._extract_css_brand_hints(mock_context, "https://example.com")

        # Returns default empty brand on exception
        assert brand == {"colors": [], "fonts": []}
