"""
LLM Service — multi-provider wrapper supporting:
  - Anthropic Claude (default)
  - OpenAI ChatGPT
  - Google Gemini

Switch providers at runtime via PUT /api/v1/llm-settings/provider.
All modules call `llm_service.client.messages.create(...)` and get back
a normalized response with `.content[0].text` — regardless of provider.
"""
import json
from app.core.config import settings


# ── Provider state (module-level, survives requests, reset on restart) ────────
# Initialized from config; can be changed at runtime via the llm-settings API.
_provider_state: dict = {
    "provider": settings.LLM_PROVIDER or "anthropic",
    "api_keys": {},   # runtime overrides (not persisted to disk)
}

PROVIDER_MODELS = {
    "anthropic": {
        "bulk":        "claude-sonnet-4-6",
        "strategy":    "claude-opus-4-6",
        "label":       "Claude (Anthropic)",
        "description": "Best reasoning and healthcare domain knowledge",
    },
    "openai": {
        "bulk":        "gpt-4o",
        "strategy":    "gpt-4o",
        "label":       "ChatGPT (OpenAI)",
        "description": "Fast, capable, large ecosystem of integrations",
    },
    "gemini": {
        "bulk":        "gemini-2.0-flash",
        "strategy":    "gemini-1.5-pro",
        "label":       "Gemini (Google)",
        "description": "Strong structured-data and medical content generation",
    },
}


# ── Normalized response objects ───────────────────────────────────────────────

class _TextBlock:
    __slots__ = ("text",)

    def __init__(self, text: str):
        self.text = text


class _NormalizedResponse:
    """Mimics Anthropic's Message so all module code works unchanged."""
    __slots__ = ("content",)

    def __init__(self, text: str):
        self.content = [_TextBlock(text)]


# ── Provider-agnostic messages proxy ─────────────────────────────────────────

class _MessagesProxy:
    """
    Proxy for `llm_service.client.messages`.
    `.create()` has the Anthropic signature and routes to the active provider.
    """

    def __init__(self, parent: "LLMService"):
        self._parent = parent

    def create(
        self,
        *,
        model: str,
        max_tokens: int,
        messages: list,
        system: str = "",
        **kwargs,
    ) -> _NormalizedResponse:
        provider = _provider_state["provider"]
        if provider == "openai":
            return self._call_openai(max_tokens, messages, system)
        if provider == "gemini":
            return self._call_gemini(max_tokens, messages, system)
        return self._call_anthropic(model, max_tokens, messages, system, **kwargs)

    # ── Anthropic ─────────────────────────────────────────────────────────
    def _call_anthropic(self, model, max_tokens, messages, system, **kwargs):
        kw: dict = {"model": model, "max_tokens": max_tokens, "messages": messages}
        if system:
            kw["system"] = system
        kw.update(kwargs)
        return self._parent._anthropic_client.messages.create(**kw)

    # ── OpenAI ────────────────────────────────────────────────────────────
    def _call_openai(self, max_tokens, messages, system):
        try:
            from openai import OpenAI  # optional dependency
        except ImportError:
            raise RuntimeError("openai package not installed — pip install openai")

        api_key = (
            _provider_state["api_keys"].get("openai")
            or settings.OPENAI_API_KEY
            or ""
        )
        client = OpenAI(api_key=api_key)
        oai_msgs = []
        if system:
            oai_msgs.append({"role": "system", "content": system})
        oai_msgs.extend(messages)
        resp = client.chat.completions.create(
            model=PROVIDER_MODELS["openai"]["bulk"],
            max_tokens=max_tokens,
            messages=oai_msgs,
        )
        return _NormalizedResponse(resp.choices[0].message.content or "")

    # ── Google Gemini ─────────────────────────────────────────────────────
    def _call_gemini(self, max_tokens, messages, system):
        try:
            import google.generativeai as genai  # optional dependency
        except ImportError:
            raise RuntimeError(
                "google-generativeai not installed — pip install google-generativeai"
            )

        api_key = (
            _provider_state["api_keys"].get("gemini")
            or settings.GOOGLE_AI_API_KEY
            or ""
        )
        genai.configure(api_key=api_key)
        gm = genai.GenerativeModel(PROVIDER_MODELS["gemini"]["bulk"])

        parts = []
        if system:
            parts.append(f"[System]: {system}\n")
        for m in messages:
            parts.append(f"[{m.get('role', 'user').capitalize()}]: {m['content']}")
        resp = gm.generate_content(
            "\n".join(parts),
            generation_config={"max_output_tokens": max_tokens},
        )
        return _NormalizedResponse(resp.text or "")


# ── Client proxy ──────────────────────────────────────────────────────────────

class _ClientProxy:
    """Mimics the `anthropic.Anthropic()` client surface used by all modules."""

    def __init__(self, parent: "LLMService"):
        self.messages = _MessagesProxy(parent)


# ── Main LLM Service ──────────────────────────────────────────────────────────

class LLMService:
    def __init__(self):
        import anthropic
        self._anthropic_client = anthropic.Anthropic(
            api_key=settings.ANTHROPIC_API_KEY or "placeholder"
        )
        # Proxy client — all modules use `llm_service.client.messages.create(...)`
        self.client = _ClientProxy(self)

    # ── Model helpers ──────────────────────────────────────────────────────
    @property
    def model_bulk(self) -> str:
        return PROVIDER_MODELS[_provider_state["provider"]]["bulk"]

    @property
    def bulk_model(self) -> str:           # legacy alias
        return self.model_bulk

    @property
    def model_strategy(self) -> str:
        return PROVIDER_MODELS[_provider_state["provider"]]["strategy"]

    @property
    def strategy_model(self) -> str:       # legacy alias
        return self.model_strategy

    # ── Low-level helpers ─────────────────────────────────────────────────
    def _chat(self, prompt: str, system: str = "", use_strategy: bool = False, max_tokens: int = 4096) -> str:
        model = self.model_strategy if use_strategy else self.model_bulk
        return self.client.messages.create(
            model=model,
            max_tokens=max_tokens,
            messages=[{"role": "user", "content": prompt}],
            system=system,
        ).content[0].text

    def _chat_json(self, prompt: str, system: str = "", use_strategy: bool = False, max_tokens: int = 8192) -> dict | list:
        raw = self._chat(prompt, system=system, use_strategy=use_strategy, max_tokens=max_tokens)
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1]
            cleaned = cleaned.rsplit("```", 1)[0]
        try:
            return json.loads(cleaned)
        except json.JSONDecodeError as exc:
            raise ValueError(
                f"LLM returned incomplete JSON (response likely truncated at {max_tokens} tokens). "
                f"Parse error: {exc}. Raw tail: ...{cleaned[-200:]!r}"
            ) from exc

    # ── Company Ingestion ──────────────────────────────────────────────────

    def extract_company_data(self, raw_html: str, url: str) -> dict:
        system = (
            "You are a healthcare marketing data extraction specialist. "
            "Return ONLY valid JSON. Do not include markdown."
        )
        prompt = f"""Extract structured company data from this healthcare website.
URL: {url}

HTML content (truncated to 30k chars):
{raw_html[:30000]}

Return a JSON object with these exact keys:
{{
  "company_name": "string",
  "specialty_niche": "string",
  "services": [{{"name": "...", "description": "...", "conditions_treated": ["..."], "duration": "...", "cost_range": "..."}}],
  "providers": [{{"name": "...", "title": "...", "credentials": "...", "bio": "...", "specialties": ["..."]}}],
  "locations": [{{"name": "...", "address": "...", "city": "...", "state": "...", "zip": "...", "phone": "...", "hours": "..."}}],
  "insurance_accepted": ["string"],
  "differentiators": ["string"],
  "target_demographics": ["string"],
  "brand_guidelines": {{"tone": "...", "key_phrases": ["..."], "primary_color": "hex", "fonts": {{"heading": "...", "body": "..."}}, "imagery_style": "..."}}
}}"""
        return self._chat_json(prompt, system=system)

    # ── Module 1: Paid Ads ─────────────────────────────────────────────────

    def generate_google_ad_copy(self, company_data: dict, keyword_cluster: dict) -> dict:
        system = "You are a Google Ads specialist for healthcare. Return ONLY valid JSON."
        prompt = f"""Generate Google Responsive Search Ad copy for this healthcare company.

Company: {company_data['company_name']}
Specialty: {company_data.get('specialty_niche', '')}
Services: {json.dumps(company_data.get('services', [])[:5])}
Insurance: {', '.join(company_data.get('insurance_accepted', [])[:10])}
Differentiators: {', '.join(company_data.get('differentiators', [])[:5])}
Locations: {json.dumps(company_data.get('locations', [])[:3])}
Keyword cluster: {json.dumps(keyword_cluster)}

Return JSON:
{{
  "headlines": ["15 headlines, max 30 chars each"],
  "descriptions": ["4 descriptions, max 90 chars each"],
  "sitelinks": [{{"text": "...", "description1": "...", "description2": "...", "url_path": "..."}}],
  "callouts": ["6-10 callout extensions, max 25 chars each"],
  "structured_snippets": {{"header": "Services", "values": ["..."]}}
}}"""
        return self._chat_json(prompt, system=system)

    def generate_keyword_clusters(self, company_data: dict) -> list:
        system = "You are a healthcare SEO and PPC keyword specialist. Return ONLY valid JSON."
        prompt = f"""Generate Google Ads keyword clusters for this healthcare company.

Company: {company_data['company_name']}
Specialty: {company_data.get('specialty_niche', '')}
Services: {json.dumps(company_data.get('services', [])[:10])}
Locations: {json.dumps(company_data.get('locations', [])[:5])}
Insurance: {', '.join(company_data.get('insurance_accepted', [])[:10])}

Return array of 8-12 keyword cluster objects:
[{{"cluster_name": "...", "match_type": "phrase", "keywords": ["..."], "negative_keywords": ["..."], "intent": "...", "estimated_volume": "medium", "service": "..."}}]"""
        return self._chat_json(prompt, system=system)

    def generate_meta_ad_copy(self, company_data: dict, target_audience: dict) -> dict:
        system = "You are a Meta Ads specialist for healthcare. Return ONLY valid JSON."
        prompt = f"""Generate Meta (Facebook/Instagram) ad copy.

Company: {company_data['company_name']}
Specialty: {company_data.get('specialty_niche', '')}
Audience: {json.dumps(target_audience)}
Brand tone: {company_data.get('brand_guidelines', {}).get('tone', 'warm and clinical')}

Return JSON:
{{
  "primary_text": "125 chars max",
  "headline": "40 chars max",
  "description": "30 chars max",
  "cta": "LEARN_MORE|CONTACT_US|GET_QUOTE",
  "image_concept": "...",
  "placement_variants": {{"feed": {{"primary_text": "...", "headline": "..."}}, "stories": {{"text_overlay": "...", "cta_label": "..."}}, "reels": {{"hook": "...", "body": "...", "cta": "..."}}}}
}}"""
        return self._chat_json(prompt, system=system)

    # ── Module 2: Referral Marketing ───────────────────────────────────────

    def generate_fax_sheet_content(self, company_data: dict, target_specialty: str) -> dict:
        system = (
            "You are an expert healthcare referral marketing specialist with 15+ years experience "
            "creating physician-to-physician fax flyers for specialty practices. "
            "You know that effective fax marketing must be: (1) scannable in under 10 seconds, "
            "(2) black-and-white print-safe with no color dependency, (3) one page only, "
            "(4) action-oriented with a single clear CTA, (5) credibility-driven with real stats. "
            "Return ONLY valid JSON."
        )
        name = company_data.get('company_name', '')
        specialty_niche = company_data.get('specialty_niche', '')
        services = company_data.get('services', [])
        insurance = company_data.get('insurance_accepted', [])
        differentiators = company_data.get('differentiators', [])
        locations = company_data.get('locations', [])
        phone = company_data.get('phone', '[PHONE]')
        website = company_data.get('website_url', '[WEBSITE]')
        fax_number = company_data.get('fax', '[FAX NUMBER]')

        prompt = f"""Create a high-converting one-page physician referral fax flyer for {name} \
targeting {target_specialty} providers.

PRACTICE CONTEXT:
- Specialty niche: {specialty_niche}
- Services: {json.dumps([s.get('name','') for s in services[:8]])}
- Insurance accepted: {', '.join(insurance[:20])}
- Differentiators: {json.dumps(differentiators[:6])}
- Locations: {json.dumps(locations[:3])}
- Phone: {phone}
- Website: {website}
- Fax: {fax_number}

BEST PRACTICES TO IMPLEMENT:
1. HEADLINE: Bold, benefit-driven, ≤10 words. Must immediately answer "why refer here?"
   Example pattern: "[Specialty] Patients Get [Outcome] — Fast Intake, [Insurance] Accepted"
2. SUBJECT LINE: 50 chars max, catchy, uses an action verb or urgency word ("Now Accepting", "New Service", "Faster Access")
3. OPENING HOOK: 2-sentence max. Lead with the referring physician's pain point (e.g., "Your patients with treatment-resistant depression deserve faster access to specialized care.") NOT with the practice's name.
4. SOCIAL PROOF / STATS SECTION: Include 2-3 verifiable or plausible outcome statistics specific to the specialty being targeted. Format as bold callout numbers (e.g., "85% of patients see improvement within 6 weeks").
5. WHY REFER — BULLET POINTS: 4-5 scannable bullets, each ≤15 words. Focus on what matters to the referring physician: ease of referral, patient outcomes, communication back to referring provider, insurance coverage, and speed of access.
6. SERVICES RELEVANT TO THIS SPECIALTY: List only the 3-5 services most relevant to {target_specialty}. Do NOT list all services.
7. INSURANCE / ACCESS: One clear sentence about insurance. Include "Most major plans accepted" if broadly true. Mention self-pay or sliding scale if applicable.
8. INTAKE PROCESS (3 simple steps): Make it dead simple. E.g., "1. Fax referral form below  2. We call patient within 24 hours  3. You receive a care coordination note"
9. AVAILABILITY NOTE: Urgency-creating but honest. E.g., "New patient appointments available within [X] business days" or "Same-week intake for urgent cases."
10. SINGLE CLEAR CTA: One primary action only. Phone number in large format. Do NOT list multiple CTAs.
11. FAX-BACK REFERRAL FORM: Tear-off style. Keep to 6 fields max. Include urgency checkbox (Routine / Urgent / ASAP).
12. BRAND CONSISTENCY: Use the practice name consistently. Tone: warm but clinically credible. No exclamation points. No ALL CAPS except for the headline.
13. COMPLIANCE: Include opt-out line. No guaranteed outcome claims. HIPAA-safe language.
14. DESIGN NOTES: Describe the layout for the designer — where the header goes, where the fax-back form sits (bottom third), where the stat callouts appear.

Return a single JSON object:
{{
  "subject_line": "50-char max catchy subject for the fax cover",
  "headline": "Bold benefit-driven headline ≤10 words",
  "tagline": "Supporting subheadline 1 sentence",
  "opening_hook": "2-sentence opening that leads with the referring physician's pain point",
  "stat_callouts": [
    {{"stat": "85%", "description": "of patients see symptom improvement within 6 weeks"}},
    {{"stat": "48 hrs", "description": "average time to first appointment for new referrals"}},
    {{"stat": "95%", "description": "of referring providers receive a care coordination note within 5 days"}}
  ],
  "why_refer_bullets": [
    "Bullet 1 ≤15 words focused on ease/speed",
    "Bullet 2 ≤15 words focused on patient outcomes",
    "Bullet 3 ≤15 words focused on communication back to referring provider",
    "Bullet 4 ≤15 words focused on insurance/access",
    "Bullet 5 ≤15 words focused on a unique differentiator"
  ],
  "relevant_services": ["Service 1", "Service 2", "Service 3"],
  "insurance_line": "One sentence about insurance accepted",
  "intake_steps": [
    {{"step": 1, "action": "Fax the referral form below or call [PHONE]"}},
    {{"step": 2, "action": "We contact your patient within 24 business hours"}},
    {{"step": 3, "action": "You receive a care coordination note within 5 days"}}
  ],
  "availability_note": "New patient appointments available within X business days",
  "primary_cta": {{
    "action": "Call to refer",
    "phone": "{phone}",
    "secondary": "Or fax referral form below to {fax_number}"
  }},
  "fax_back_form": {{
    "title": "Referral Request Form — {name}",
    "fields": ["Patient Name", "Date of Birth", "Referring Provider Name & NPI", "Reason for Referral / Diagnosis", "Urgency: [ ] Routine  [ ] Urgent  [ ] ASAP", "Best Phone to Reach Patient"],
    "return_fax": "{fax_number}"
  }},
  "footer_contact": {{
    "phone": "{phone}",
    "website": "{website}",
    "fax": "{fax_number}"
  }},
  "opt_out_text": "To stop receiving faxes from {name}, fax REMOVE to {fax_number}",
  "design_notes": "Describe the one-page layout: header zone (top 20%), stat callout bar (below header), two-column body (why refer bullets left, services + intake right), fax-back form (bottom 30% separated by dashed cut line). Black and white print safe.",
  "intro_paragraph": "A 3-4 sentence summary paragraph combining the opening hook and key value proposition, suitable for use as the body text if the structured layout is not used."
}}"""
        return self._chat_json(prompt, system=system, max_tokens=8192)

    def generate_voicemail_scripts(self, company_data: dict, target_specialty: str) -> list:
        system = "You are a healthcare marketing copywriter. Return ONLY valid JSON."
        prompt = f"""Generate 3 ringless voicemail scripts for {company_data['company_name']} targeting {target_specialty}.

Requirements: 30-45s (75-115 words), introduce practice, highlight service, mention insurance, include opt-out.

Return: [{{"variant": 1, "focus": "...", "script": "Hi, this is...", "word_count": 90, "estimated_duration_seconds": 35}}]"""
        return self._chat_json(prompt, system=system)

    def generate_email_sequence(self, company_data: dict, target_specialty: str) -> list:
        system = "You are a healthcare B2B email marketing specialist. Return ONLY valid JSON."
        prompt = f"""Generate a 7-email referral sequence for {company_data['company_name']} targeting {target_specialty}.

Spans 28 days. Include CAN-SPAM footer and placeholders {{PROVIDER_FIRST_NAME}}, {{PRACTICE_NAME}}, {{CITY}}.

Return: [{{"step": 1, "day": 1, "subject": "...", "preview_text": "...", "body": "...", "cta": "...", "focus": "introduction"}}]"""
        return self._chat_json(prompt, system=system)

    def generate_postcard_copy(self, company_data: dict) -> dict:
        system = "You are a direct mail healthcare marketing specialist. Return ONLY valid JSON."
        prompt = f"""Generate a 6x9 referral postcard for {company_data['company_name']}.

Specialty: {company_data.get('specialty_niche', '')}
Services: {json.dumps(company_data.get('services', [])[:5])}
Insurance: {', '.join(company_data.get('insurance_accepted', [])[:10])}

Return JSON: {{"front": {{"headline": "...", "subheadline": "...", "key_points": ["..."], "cta_text": "...", "cta_url_placeholder": "[QR_CODE_URL]"}}, "back": {{"headline": "...", "body": "...", "services_list": ["..."], "insurance_note": "...", "contact_info_placeholder": "[PRACTICE_INFO]", "return_address_placeholder": "[RETURN_ADDRESS]"}}, "design_notes": "..."}}"""
        return self._chat_json(prompt, system=system)

    # ── Module 3: Content ──────────────────────────────────────────────────

    def generate_blog_post(self, company_data: dict, keyword: str, target_word_count: int = 1500) -> dict:
        system = "You are a healthcare content writer and SEO specialist. Return ONLY valid JSON."
        prompt = f"""Write a {target_word_count}-word SEO blog post for {company_data['company_name']}.
Target keyword: {keyword}
Brand tone: {company_data.get('brand_guidelines', {}).get('tone', 'warm and clinical')}

Return JSON: {{"title": "...", "meta_description": "...", "slug": "...", "target_keyword": "{keyword}", "secondary_keywords": ["..."], "body_markdown": "...", "faq_schema": [{{"question": "...", "answer": "..."}}], "estimated_word_count": {target_word_count}, "internal_link_suggestions": ["..."], "image_alt_text_suggestions": ["..."]}}"""
        return self._chat_json(prompt, system=system, use_strategy=False, max_tokens=8192)

    def generate_social_posts(self, company_data: dict, content_type: str, count: int = 5) -> list:
        system = "You are a healthcare social media manager. Return ONLY valid JSON."
        prompt = f"""Generate {count} {content_type} posts for {company_data['company_name']}.
Brand tone: {company_data.get('brand_guidelines', {}).get('tone', 'warm, clinical, empathetic')}
Services: {', '.join([s.get('name', '') for s in company_data.get('services', [])[:5]])}
HIPAA: No patient identifiers. No guaranteed outcome claims.

Return [{{"type": "...", "caption": "...", "hashtags": ["..."], "image_concept": "...", "best_days": ["Tuesday"], "best_times": ["7AM"]}}]"""
        return self._chat_json(prompt, system=system)

    def generate_content_calendar(self, company_data: dict, weeks: int = 12) -> dict:
        system = "You are a healthcare content strategist. Return ONLY valid JSON."
        prompt = f"""Create a {weeks}-week content calendar for {company_data['company_name']}.
Services: {', '.join([s.get('name', '') for s in company_data.get('services', [])[:10]])}

Return: {{"strategy_overview": "...", "content_pillars": ["..."], "weeks": [{{"week": 1, "theme": "...", "blog_topics": [{{"title": "...", "target_keyword": "...", "word_count": 1500}}], "social_themes": [{{"platform": "facebook", "theme": "...", "post_ideas": ["..."]}}]}}]}}"""
        return self._chat_json(prompt, system=system, use_strategy=True, max_tokens=8192)

    # ── Module 4: SEO ──────────────────────────────────────────────────────

    def analyze_seo_data(self, company_data: dict, gsc_data: dict, crawl_results: dict) -> dict:
        system = "You are a technical SEO specialist for healthcare. Return ONLY valid JSON."
        prompt = f"""Analyze SEO data for {company_data['company_name']} ({company_data.get('website_url', '')}).

GSC data: {json.dumps(gsc_data)[:5000]}
Crawl results: {json.dumps(crawl_results)[:5000]}

Return: {{"summary": "...", "quick_wins": [{{"action": "...", "priority": "high", "expected_impact": "...", "effort": "low"}}], "technical_fixes": [{{"issue": "...", "affected_pages": [], "fix": "...", "priority": "high"}}], "content_opportunities": [{{"keyword": "...", "intent": "...", "recommended_format": "..."}}], "local_seo_actions": [{{"action": "...", "priority": "..."}}], "schema_recommendations": [{{"schema_type": "...", "page": "...", "impact": "..."}}], "30_day_action_plan": [{{"week": 1, "actions": ["..."]}}]}}"""
        return self._chat_json(prompt, system=system, use_strategy=True)

    # ── Module 5: Directory Profiles ───────────────────────────────────────

    def generate_directory_profiles(self, company_data: dict, platform: str) -> dict:
        system = "You are a healthcare directory profile optimization specialist. Return ONLY valid JSON."
        prompt = f"""Generate optimized {platform} directory profile for {company_data['company_name']}.

Services: {json.dumps(company_data.get('services', [])[:8])}
Insurance: {', '.join(company_data.get('insurance_accepted', [])[:20])}
Providers: {json.dumps(company_data.get('providers', [])[:5])}
Locations: {json.dumps(company_data.get('locations', [])[:3])}

Return: {{"practice_description_50": "...", "practice_description_150": "...", "practice_description_500": "...", "provider_bios": [{{"provider_name": "...", "bio_first_person": "...", "bio_third_person": "...", "specialties": ["..."], "conditions_treated": ["..."], "treatment_approaches": ["..."]}}], "services": ["..."], "conditions": ["..."], "insurance": ["..."], "faq": [{{"question": "...", "answer": "..."}}], "platform_specific_tags": ["..."]}}"""
        return self._chat_json(prompt, system=system)


llm_service = LLMService()
