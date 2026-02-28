"""
Website scraper — uses Playwright for JS rendering + BeautifulSoup for parsing.
Extracts raw HTML + CSS for brand guidelines, then hands off to LLM for structured extraction.
"""
import re
import json
from typing import Optional
from urllib.parse import urljoin, urlparse

try:
    from playwright.async_api import async_playwright
    PLAYWRIGHT_AVAILABLE = True
except ImportError:  # pragma: no cover
    PLAYWRIGHT_AVAILABLE = False  # pragma: no cover

from bs4 import BeautifulSoup
import httpx


class WebScraper:
    def __init__(self):
        self.headers = {
            "User-Agent": "Mozilla/5.0 (compatible; ArcheGTMBot/1.0; +https://archestudios.com/bot)"
        }

    async def scrape_website(self, url: str) -> dict:
        """
        Full website scrape: renders JS, extracts HTML, CSS colors/fonts,
        structured data, and key page content.
        Returns dict ready for LLM extraction.
        """
        if not url.startswith("http"):
            url = f"https://{url}"

        result = {
            "url": url,
            "pages": {},
            "brand_hints": {},
            "structured_data": [],
            "raw_html": "",
            "error": None,
        }

        try:
            if PLAYWRIGHT_AVAILABLE:
                result = await self._scrape_with_playwright(url, result)
            else:
                result = await self._scrape_with_httpx(url, result)
        except Exception as e:
            result["error"] = str(e)

        return result

    async def _scrape_with_playwright(self, url: str, result: dict) -> dict:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(
                user_agent=self.headers["User-Agent"],
                viewport={"width": 1280, "height": 800},
            )

            # Scrape key pages
            pages_to_scrape = await self._discover_key_pages(context, url)
            combined_html = ""

            for page_url in pages_to_scrape[:8]:  # cap at 8 pages
                try:
                    page = await context.new_page()
                    await page.goto(page_url, wait_until="networkidle", timeout=30000)
                    html = await page.content()
                    title = await page.title()
                    combined_html += f"\n\n<!-- PAGE: {page_url} TITLE: {title} -->\n{html}"
                    result["pages"][page_url] = {"title": title, "html_length": len(html)}
                    await page.close()
                except Exception:
                    pass

            result["raw_html"] = combined_html
            result["brand_hints"] = await self._extract_css_brand_hints(context, url)
            result["structured_data"] = self._extract_structured_data(combined_html)

            await browser.close()
        return result

    async def _scrape_with_httpx(self, url: str, result: dict) -> dict:
        """Fallback scraper using httpx (no JS rendering)."""
        async with httpx.AsyncClient(headers=self.headers, follow_redirects=True) as client:
            resp = await client.get(url, timeout=20.0)
            html = resp.text
            result["raw_html"] = html
            result["structured_data"] = self._extract_structured_data(html)

            soup = BeautifulSoup(html, "html.parser")
            # Discover and scrape additional pages
            links = self._extract_internal_links(soup, url)
            key_pages = self._prioritize_pages(links)

            for page_url in key_pages[:6]:
                try:
                    r = await client.get(page_url, timeout=15.0)
                    result["pages"][page_url] = {"html_length": len(r.text)}
                    result["raw_html"] += f"\n\n<!-- PAGE: {page_url} -->\n{r.text}"
                except Exception:
                    pass

        return result

    async def _discover_key_pages(self, context, base_url: str) -> list[str]:
        """Load homepage, extract links, return prioritized list of pages to scrape."""
        page = await context.new_page()
        try:
            await page.goto(base_url, wait_until="domcontentloaded", timeout=20000)
            html = await page.content()
        finally:
            await page.close()

        soup = BeautifulSoup(html, "html.parser")
        links = self._extract_internal_links(soup, base_url)
        prioritized = self._prioritize_pages(links)
        return [base_url] + prioritized[:7]

    def _extract_internal_links(self, soup: BeautifulSoup, base_url: str) -> list[str]:
        base_domain = urlparse(base_url).netloc
        links = set()
        for a in soup.find_all("a", href=True):
            href = a["href"]
            full_url = urljoin(base_url, href)
            if urlparse(full_url).netloc == base_domain:
                # Strip fragments and query strings for deduplication
                clean = full_url.split("#")[0].split("?")[0]
                if clean.startswith("http") and not clean.endswith((".pdf", ".jpg", ".png")):
                    links.add(clean)
        return list(links)

    def _prioritize_pages(self, links: list[str]) -> list[str]:
        """Sort links by relevance to healthcare marketing data extraction."""
        priority_keywords = [
            "service", "treatment", "therapy", "care", "provider", "team", "about",
            "doctor", "insurance", "location", "contact", "faq", "patient", "condition",
            "specialty", "ketamine", "tms", "psychiatr", "mental-health",
        ]
        scored = []
        for link in links:
            path = urlparse(link).path.lower()
            score = sum(kw in path for kw in priority_keywords)
            scored.append((score, link))
        scored.sort(reverse=True)
        return [l for _, l in scored]

    async def _extract_css_brand_hints(self, context, url: str) -> dict:
        """Extract color palette and fonts from CSS."""
        page = await context.new_page()
        brand = {"colors": [], "fonts": []}
        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=20000)

            # Extract computed styles from key elements
            colors_fonts = await page.evaluate("""() => {
                const elements = ['body', 'h1', 'h2', 'a', 'button', '.btn', 'header', 'nav'];
                const result = {colors: new Set(), fonts: new Set()};
                elements.forEach(sel => {
                    try {
                        const el = document.querySelector(sel);
                        if (!el) return;
                        const style = window.getComputedStyle(el);
                        result.colors.add(style.color);
                        result.colors.add(style.backgroundColor);
                        result.fonts.add(style.fontFamily);
                    } catch(e) {}
                });
                return {
                    colors: Array.from(result.colors).filter(c => c && c !== 'rgba(0, 0, 0, 0)'),
                    fonts: Array.from(result.fonts).filter(f => f)
                };
            }""")

            brand = colors_fonts
        except Exception:
            pass
        finally:
            await page.close()

        return brand

    def _extract_structured_data(self, html: str) -> list:
        """Extract JSON-LD structured data schemas from HTML."""
        soup = BeautifulSoup(html, "html.parser")
        schemas = []
        for script in soup.find_all("script", type="application/ld+json"):
            try:
                data = json.loads(script.string)
                schemas.append(data)
            except Exception:
                pass
        return schemas

    def extract_text_content(self, html: str) -> str:
        """Strip HTML tags, return readable text."""
        soup = BeautifulSoup(html, "html.parser")
        for tag in soup(["script", "style", "nav", "footer", "header"]):
            tag.decompose()
        text = soup.get_text(separator="\n", strip=True)
        # Collapse excessive whitespace
        text = re.sub(r"\n{3,}", "\n\n", text)
        return text[:50000]  # cap at 50k chars for LLM


scraper = WebScraper()
