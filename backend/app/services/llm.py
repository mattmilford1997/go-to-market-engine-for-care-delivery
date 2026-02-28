"""
LLM Service — wraps Anthropic Claude API.
Coded against API spec; plug in ANTHROPIC_API_KEY via .env to activate.
"""
import json
from typing import Optional
import anthropic
from app.core.config import settings


class LLMService:
    def __init__(self):
        self.client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY or "placeholder")
        self.bulk_model = settings.LLM_MODEL_BULK
        self.strategy_model = settings.LLM_MODEL_STRATEGY

    def _chat(self, prompt: str, system: str = "", use_strategy: bool = False, max_tokens: int = 4096) -> str:
        model = self.strategy_model if use_strategy else self.bulk_model
        messages = [{"role": "user", "content": prompt}]
        kwargs = {"model": model, "max_tokens": max_tokens, "messages": messages}
        if system:
            kwargs["system"] = system
        response = self.client.messages.create(**kwargs)
        return response.content[0].text

    def _chat_json(self, prompt: str, system: str = "", use_strategy: bool = False) -> dict | list:
        raw = self._chat(prompt, system=system, use_strategy=use_strategy)
        # Strip markdown code fences if present
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1]
            cleaned = cleaned.rsplit("```", 1)[0]
        return json.loads(cleaned)

    # ------------------------------------------------------------------ #
    # Company Ingestion
    # ------------------------------------------------------------------ #

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
  "specialty_niche": "string — e.g. 'TMS therapy, ketamine infusions, psychiatric medication management'",
  "services": [
    {{"name": "...", "description": "...", "conditions_treated": ["..."], "duration": "...", "cost_range": "..."}}
  ],
  "providers": [
    {{"name": "...", "title": "...", "credentials": "...", "bio": "...", "specialties": ["..."]}}
  ],
  "locations": [
    {{"name": "...", "address": "...", "city": "...", "state": "...", "zip": "...", "phone": "...", "hours": "..."}}
  ],
  "insurance_accepted": ["string"],
  "differentiators": ["string"],
  "target_demographics": ["string"],
  "brand_guidelines": {{
    "tone": "e.g. warm and clinical",
    "key_phrases": ["..."],
    "primary_color": "hex if inferable",
    "fonts": {{"heading": "...", "body": "..."}},
    "imagery_style": "..."
  }}
}}"""
        return self._chat_json(prompt, system=system)

    # ------------------------------------------------------------------ #
    # Module 1: Paid Ads
    # ------------------------------------------------------------------ #

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
  "headlines": ["array of exactly 15 headlines, max 30 chars each"],
  "descriptions": ["array of exactly 4 descriptions, max 90 chars each"],
  "sitelinks": [
    {{"text": "...", "description1": "...", "description2": "...", "url_path": "..."}}
  ],
  "callouts": ["array of 6-10 callout extensions, max 25 chars each"],
  "structured_snippets": {{
    "header": "Services",
    "values": ["..."]
  }}
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

Generate keyword clusters. Each cluster represents one ad group.

Return array of objects:
[
  {{
    "cluster_name": "TMS Therapy - Local",
    "match_type": "phrase",
    "keywords": ["tms therapy near me", "tms treatment depression {{city}}", "..."],
    "negative_keywords": ["..."],
    "intent": "high — treatment-seeking",
    "estimated_volume": "medium",
    "service": "TMS Therapy"
  }}
]

Generate 8-12 clusters covering all major services and location variations."""
        return self._chat_json(prompt, system=system)

    def generate_meta_ad_copy(self, company_data: dict, target_audience: dict) -> dict:
        system = "You are a Meta Ads specialist for healthcare. Return ONLY valid JSON."
        prompt = f"""Generate Meta (Facebook/Instagram) ad copy for this healthcare company.

Company: {company_data['company_name']}
Specialty: {company_data.get('specialty_niche', '')}
Audience: {json.dumps(target_audience)}
Brand tone: {company_data.get('brand_guidelines', {}).get('tone', 'warm and clinical')}

Return JSON:
{{
  "primary_text": "Primary ad text (125 chars max for feed)",
  "headline": "Headline (40 chars max)",
  "description": "Description (30 chars max)",
  "cta": "LEARN_MORE | CONTACT_US | GET_QUOTE | BOOK_TRAVEL",
  "image_concept": "Detailed description of ideal image/creative for this ad",
  "placement_variants": {{
    "feed": {{"primary_text": "...", "headline": "..."}},
    "stories": {{"text_overlay": "...", "cta_label": "..."}},
    "reels": {{"hook": "...", "body": "...", "cta": "..."}}
  }}
}}"""
        return self._chat_json(prompt, system=system)

    # ------------------------------------------------------------------ #
    # Module 2: Referral Marketing
    # ------------------------------------------------------------------ #

    def generate_fax_sheet_content(self, company_data: dict, target_specialty: str) -> dict:
        system = "You are a healthcare referral marketing specialist. Return ONLY valid JSON."
        prompt = f"""Generate a professional referral fax sheet for a healthcare practice targeting {target_specialty} providers.

Company: {company_data['company_name']}
Specialty: {company_data.get('specialty_niche', '')}
Services: {json.dumps(company_data.get('services', [])[:5])}
Insurance: {', '.join(company_data.get('insurance_accepted', [])[:15])}
Differentiators: {', '.join(company_data.get('differentiators', [])[:5])}
Locations: {json.dumps(company_data.get('locations', [])[:3])}
Providers: {json.dumps([{{'name': p.get('name'), 'credentials': p.get('credentials')}} for p in company_data.get('providers', [])[:5]])}

Return JSON:
{{
  "headline": "...",
  "tagline": "...",
  "intro_paragraph": "...",
  "key_services_for_this_specialty": ["..."],
  "why_refer_points": ["..."],
  "insurance_section": "...",
  "intake_process": "...",
  "availability_note": "...",
  "fax_back_form": {{
    "title": "Referral Request",
    "fields": ["Patient Name", "DOB", "Referring Provider", "Reason for Referral", "Urgency", "Best Contact"]
  }},
  "footer_cta": "...",
  "opt_out_text": "To stop receiving faxes from us, fax REMOVE to [FAX NUMBER] or call [PHONE]"
}}"""
        return self._chat_json(prompt, system=system)

    def generate_voicemail_scripts(self, company_data: dict, target_specialty: str) -> list:
        system = "You are a healthcare marketing copywriter. Return ONLY valid JSON."
        prompt = f"""Generate 3 ringless voicemail scripts for physician referral outreach.

Company: {company_data['company_name']}
Target: {target_specialty} providers
Services: {company_data.get('specialty_niche', '')}
Tone: {company_data.get('brand_guidelines', {}).get('tone', 'warm and professional')}

Requirements:
- 30-45 seconds when read aloud (roughly 75-115 words)
- Introduce the practice
- Highlight one service relevant to {target_specialty}
- Mention insurance acceptance
- Provide callback number placeholder [PHONE]
- Include opt-out: "To opt out of future messages, please press 9 or call us"

Return array of 3 script variants:
[
  {{
    "variant": 1,
    "focus": "...",
    "script": "Hi, this is [PROVIDER NAME] from [COMPANY NAME]...",
    "word_count": 90,
    "estimated_duration_seconds": 35
  }}
]"""
        return self._chat_json(prompt, system=system)

    def generate_email_sequence(self, company_data: dict, target_specialty: str) -> list:
        system = "You are a healthcare B2B email marketing specialist. Return ONLY valid JSON."
        prompt = f"""Generate a 7-email referral outreach sequence for physician-to-physician marketing.

Company: {company_data['company_name']}
Target: {target_specialty} providers
Services: {company_data.get('specialty_niche', '')}
Insurance: {', '.join(company_data.get('insurance_accepted', [])[:10])}
Differentiators: {', '.join(company_data.get('differentiators', [])[:5])}

Sequence spans 28 days. Must include:
- CAN-SPAM compliant footer with physical address + unsubscribe link
- Personalization placeholders: {{PROVIDER_FIRST_NAME}}, {{PRACTICE_NAME}}, {{CITY}}

Return array of 7 emails:
[
  {{
    "step": 1,
    "day": 1,
    "subject": "...",
    "preview_text": "...",
    "body": "Full email body with placeholders...",
    "cta": "...",
    "focus": "introduction"
  }}
]"""
        return self._chat_json(prompt, system=system)

    def generate_postcard_copy(self, company_data: dict) -> dict:
        system = "You are a direct mail healthcare marketing specialist. Return ONLY valid JSON."
        prompt = f"""Generate copy for a 6x9 referral marketing postcard for {company_data['company_name']}.

Specialty: {company_data.get('specialty_niche', '')}
Services: {json.dumps(company_data.get('services', [])[:5])}
Insurance: {', '.join(company_data.get('insurance_accepted', [])[:10])}
Differentiators: {', '.join(company_data.get('differentiators', [])[:3])}

Return JSON:
{{
  "front": {{
    "headline": "...",
    "subheadline": "...",
    "key_points": ["3-4 bullet points max"],
    "cta_text": "...",
    "cta_url_placeholder": "[QR_CODE_URL]"
  }},
  "back": {{
    "headline": "...",
    "body": "...",
    "services_list": ["..."],
    "insurance_note": "...",
    "contact_info_placeholder": "[PRACTICE_INFO]",
    "return_address_placeholder": "[RETURN_ADDRESS]"
  }},
  "design_notes": "Brief notes for designer on layout, colors, imagery"
}}"""
        return self._chat_json(prompt, system=system)

    # ------------------------------------------------------------------ #
    # Module 3: Content
    # ------------------------------------------------------------------ #

    def generate_blog_post(self, company_data: dict, keyword: str, target_word_count: int = 1500) -> dict:
        system = "You are a healthcare content writer and SEO specialist. Return ONLY valid JSON."
        prompt = f"""Write a {target_word_count}-word SEO-optimized blog post for a healthcare practice.

Company: {company_data['company_name']}
Specialty: {company_data.get('specialty_niche', '')}
Target keyword: {keyword}
Brand tone: {company_data.get('brand_guidelines', {}).get('tone', 'warm and clinical')}
Services: {json.dumps(company_data.get('services', [])[:5])}

Requirements:
- Medically accurate (cite general evidence, no fake statistics)
- H1, H2s, H3s for structure
- FAQ section at end (5 questions)
- Meta description (155 chars max)
- Target keyword in H1, first paragraph, 2-3 H2s naturally
- Patient-friendly CTA at end
- Schema markup hints in metadata

Return JSON:
{{
  "title": "H1 title with target keyword",
  "meta_description": "...",
  "slug": "url-friendly-slug",
  "target_keyword": "{keyword}",
  "secondary_keywords": ["..."],
  "body_markdown": "Full post in markdown with headers...",
  "faq_schema": [
    {{"question": "...", "answer": "..."}}
  ],
  "estimated_word_count": {target_word_count},
  "internal_link_suggestions": ["..."],
  "image_alt_text_suggestions": ["..."]
}}"""
        return self._chat_json(prompt, system=system, use_strategy=False)

    def generate_social_posts(self, company_data: dict, content_type: str, count: int = 5) -> list:
        system = "You are a healthcare social media manager. Return ONLY valid JSON."
        prompt = f"""Generate {count} {content_type} social media posts for a healthcare practice.

Company: {company_data['company_name']}
Specialty: {company_data.get('specialty_niche', '')}
Brand tone: {company_data.get('brand_guidelines', {}).get('tone', 'warm, clinical, empathetic')}
Services: {', '.join([s.get('name', '') for s in company_data.get('services', [])[:5]])}

Content types to mix: educational, awareness, provider spotlight, treatment explainer, community.
Include: condition awareness, destigmatization messaging, treatment-seeking encouragement.
HIPAA: No patient identifiers. No claims about guaranteed outcomes.

Return array of {count} post objects:
[
  {{
    "type": "educational | awareness | provider_spotlight | treatment_explainer | community",
    "caption": "Full post text with natural paragraph breaks",
    "hashtags": ["healthcare", "mentalhealth", "..."],
    "image_concept": "Description of ideal image/graphic",
    "best_days": ["Tuesday", "Thursday"],
    "best_times": ["7AM", "12PM"]
  }}
]"""
        return self._chat_json(prompt, system=system)

    def generate_content_calendar(self, company_data: dict, weeks: int = 12) -> dict:
        system = "You are a healthcare content strategist. Return ONLY valid JSON."
        prompt = f"""Create a {weeks}-week content calendar for a healthcare practice.

Company: {company_data['company_name']}
Specialty: {company_data.get('specialty_niche', '')}
Services: {', '.join([s.get('name', '') for s in company_data.get('services', [])[:10]])}

Return JSON:
{{
  "strategy_overview": "...",
  "content_pillars": ["..."],
  "weeks": [
    {{
      "week": 1,
      "theme": "...",
      "blog_topics": [{{"title": "...", "target_keyword": "...", "word_count": 1500}}],
      "social_themes": [{{"platform": "facebook|instagram|linkedin", "theme": "...", "post_ideas": ["..."]}}]
    }}
  ]
}}"""
        return self._chat_json(prompt, system=system, use_strategy=True)

    # ------------------------------------------------------------------ #
    # Module 4: SEO
    # ------------------------------------------------------------------ #

    def analyze_seo_data(self, company_data: dict, gsc_data: dict, crawl_results: dict) -> dict:
        system = "You are a technical SEO specialist for healthcare. Return ONLY valid JSON."
        prompt = f"""Analyze this healthcare website's SEO data and provide actionable recommendations.

Company: {company_data['company_name']}
Website: {company_data.get('website_url', '')}
Specialty: {company_data.get('specialty_niche', '')}
Locations: {json.dumps(company_data.get('locations', [])[:3])}

Google Search Console data: {json.dumps(gsc_data)[:5000]}
Crawl results: {json.dumps(crawl_results)[:5000]}

Return JSON:
{{
  "summary": "...",
  "quick_wins": [{{"action": "...", "priority": "high", "expected_impact": "...", "effort": "low"}}],
  "technical_fixes": [{{"issue": "...", "affected_pages": [], "fix": "...", "priority": "high|medium|low"}}],
  "content_opportunities": [{{"keyword": "...", "intent": "...", "recommended_format": "..."}}],
  "local_seo_actions": [{{"action": "...", "priority": "..."}}],
  "schema_recommendations": [{{"schema_type": "...", "page": "...", "impact": "..."}}],
  "30_day_action_plan": [{{"week": 1, "actions": ["..."]}}]
}}"""
        return self._chat_json(prompt, system=system, use_strategy=True)

    # ------------------------------------------------------------------ #
    # Module 5: Directory Profiles
    # ------------------------------------------------------------------ #

    def generate_directory_profiles(self, company_data: dict, platform: str) -> dict:
        system = "You are a healthcare directory profile optimization specialist. Return ONLY valid JSON."
        prompt = f"""Generate optimized directory profile content for {platform} for this healthcare practice.

Company: {company_data['company_name']}
Specialty: {company_data.get('specialty_niche', '')}
Services: {json.dumps(company_data.get('services', [])[:8])}
Insurance: {', '.join(company_data.get('insurance_accepted', [])[:20])}
Providers: {json.dumps(company_data.get('providers', [])[:5])}
Locations: {json.dumps(company_data.get('locations', [])[:3])}
Differentiators: {', '.join(company_data.get('differentiators', [])[:5])}
Platform: {platform}

Return JSON:
{{
  "practice_description_50": "50-word description",
  "practice_description_150": "150-word description",
  "practice_description_500": "500-word description optimized for {platform}'s algorithm",
  "provider_bios": [
    {{
      "provider_name": "...",
      "bio_first_person": "...",
      "bio_third_person": "...",
      "specialties": ["..."],
      "conditions_treated": ["..."],
      "treatment_approaches": ["..."]
    }}
  ],
  "services": ["..."],
  "conditions": ["..."],
  "insurance": ["..."],
  "faq": [{{"question": "...", "answer": "..."}}],
  "platform_specific_tags": ["..."]
}}"""
        return self._chat_json(prompt, system=system)


llm_service = LLMService()
