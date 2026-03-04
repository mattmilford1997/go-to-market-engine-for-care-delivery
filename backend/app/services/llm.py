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
_provider_state: dict = {
    "provider": settings.LLM_PROVIDER or "anthropic",
    "api_keys": {},
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
    def __init__(self, parent: "LLMService"):
        self._parent = parent

    def create(self, *, model: str, max_tokens: int, messages: list, system: str = "", **kwargs) -> _NormalizedResponse:
        provider = _provider_state["provider"]
        if provider == "openai":
            return self._call_openai(max_tokens, messages, system)
        if provider == "gemini":
            return self._call_gemini(max_tokens, messages, system)
        return self._call_anthropic(model, max_tokens, messages, system, **kwargs)

    def _call_anthropic(self, model, max_tokens, messages, system, **kwargs):
        kw: dict = {"model": model, "max_tokens": max_tokens, "messages": messages}
        if system:
            kw["system"] = system
        kw.update(kwargs)
        return self._parent._anthropic_client.messages.create(**kw)

    def _call_openai(self, max_tokens, messages, system):
        try:
            from openai import OpenAI
        except ImportError:
            raise RuntimeError("openai package not installed — pip install openai")
        api_key = _provider_state["api_keys"].get("openai") or settings.OPENAI_API_KEY or ""
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

    def _call_gemini(self, max_tokens, messages, system):
        try:
            import google.generativeai as genai
        except ImportError:
            raise RuntimeError("google-generativeai not installed — pip install google-generativeai")
        api_key = _provider_state["api_keys"].get("gemini") or settings.GOOGLE_AI_API_KEY or ""
        genai.configure(api_key=api_key)
        gm = genai.GenerativeModel(PROVIDER_MODELS["gemini"]["bulk"])
        parts = []
        if system:
            parts.append(f"[System]: {system}\n")
        for m in messages:
            parts.append(f"[{m.get('role', 'user').capitalize()}]: {m['content']}")
        resp = gm.generate_content("\n".join(parts), generation_config={"max_output_tokens": max_tokens})
        return _NormalizedResponse(resp.text or "")


class _ClientProxy:
    def __init__(self, parent: "LLMService"):
        self.messages = _MessagesProxy(parent)


# ── Main LLM Service ──────────────────────────────────────────────────────────

class LLMService:
    def __init__(self):
        import anthropic
        self._anthropic_client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY or "placeholder")
        self.client = _ClientProxy(self)

    @property
    def model_bulk(self) -> str:
        return PROVIDER_MODELS[_provider_state["provider"]]["bulk"]

    @property
    def bulk_model(self) -> str:
        return self.model_bulk

    @property
    def model_strategy(self) -> str:
        return PROVIDER_MODELS[_provider_state["provider"]]["strategy"]

    @property
    def strategy_model(self) -> str:
        return self.model_strategy

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

    # ══════════════════════════════════════════════════════════════════════════
    # MODULE 1: PAID ADS — WORLD-CLASS GENERATION
    # ══════════════════════════════════════════════════════════════════════════

    def generate_google_ad_copy(self, company_data: dict, keyword_cluster: dict) -> dict:
        """
        World-class Google RSA generation implementing:
        - 15 headlines with pinning strategy (PIN_1, PIN_2, PIN_3 annotations)
        - Keyword insertion tokens {KeyWord:Default} for dynamic insertion
        - Ad Strength optimization (Excellent target: 15 unique headlines, 4 descriptions)
        - SKAG (Single Keyword Ad Group) alignment
        - Emotional + rational appeal balance
        - Healthcare compliance (no guaranteed outcomes, no superlatives without proof)
        - All 7 extension types: sitelinks, callouts, structured snippets, call, location, price, image
        - Quality Score optimization: relevance, CTR signals, landing page alignment
        - Competitor conquest variants (if competitor keywords in cluster)
        - Mobile-preferred descriptions
        """
        system = (
            "You are a world-class Google Ads specialist with 10+ years in healthcare PPC. "
            "You have managed $50M+ in Google Ads spend for mental health, psychiatry, and specialty medical practices. "
            "You know that Ad Strength 'Excellent' requires: 15 unique headlines (no repetition of key phrases), "
            "4 descriptions with varied CTAs, and that Google's ML needs diversity to find winning combinations. "
            "You follow all Google Ads healthcare advertising policies: no guaranteed outcomes, no 'best' without substantiation, "
            "no before/after claims. You write copy that achieves 8-10% CTR in healthcare verticals. "
            "Return ONLY valid JSON."
        )
        name = company_data.get('company_name', '')
        specialty = company_data.get('specialty_niche', '')
        services = company_data.get('services', [])
        insurance = company_data.get('insurance_accepted', [])
        differentiators = company_data.get('differentiators', [])
        locations = company_data.get('locations', [])
        cluster_name = keyword_cluster.get('cluster_name', '')
        keywords = keyword_cluster.get('keywords', [])
        intent = keyword_cluster.get('intent', 'transactional')

        prompt = f"""Generate a world-class Google Responsive Search Ad (RSA) for this healthcare practice.

PRACTICE: {name}
SPECIALTY: {specialty}
SERVICES: {json.dumps([s.get('name','') for s in services[:8]])}
INSURANCE: {', '.join(insurance[:15])}
DIFFERENTIATORS: {json.dumps(differentiators[:6])}
LOCATIONS: {json.dumps([f"{l.get('city','')}, {l.get('state','')}" for l in locations[:3]])}
KEYWORD CLUSTER: {cluster_name}
TOP KEYWORDS: {', '.join(keywords[:10])}
SEARCH INTENT: {intent}

HEADLINE REQUIREMENTS (15 total, each ≤30 characters including spaces):
- Headlines 1-3: Include the primary keyword naturally (for PIN_1 position — always shown)
- Headlines 4-6: Lead with a patient benefit or outcome ("Feel Better Faster", "Same-Week Appointments")
- Headlines 7-9: Address objections ("Insurance Accepted", "No Referral Needed", "Telehealth Available")
- Headlines 10-12: Social proof or credibility ("Board-Certified Providers", "Accepting New Patients")
- Headlines 13-15: Urgency or CTA ("Call Today", "Book Online Now", "Free Consultation")
- Use {"{"}KeyWord:{cluster_name}{"}"} token in at least 2 headlines for dynamic keyword insertion
- NO duplicate phrases across headlines
- Every headline must be able to stand alone and make sense
- Avoid ALL CAPS (except abbreviations like TMS, TRD, ADHD)

DESCRIPTION REQUIREMENTS (4 total, each ≤90 characters):
- Description 1: Lead with the patient problem + solution. Include primary keyword.
- Description 2: Focus on ease/access (insurance, location, telehealth, no waitlist)
- Description 3: Social proof + outcome-oriented language (without guarantees)
- Description 4: Strong CTA with urgency. Include phone number placeholder or "Call Now"
- Each description must work with ANY combination of headlines
- Vary sentence structure across descriptions

EXTENSIONS — generate all 7 types:
1. Sitelinks (6): Deep links to specific service pages with 2-line descriptions each
2. Callouts (10): Short USPs ≤25 chars (e.g., "Same-Day Appointments", "All Insurance Accepted")
3. Structured Snippets: Services header with 8 specific service names
4. Call Extension: Business phone with call scheduling note
5. Location Extension: City/state targeting note
6. Price Extension (if applicable): Service pricing tiers
7. Image Extension: Description of 3 hero image concepts for Google's image extension

CAMPAIGN STRATEGY NOTES:
- Bidding recommendation for this intent level
- Audience layering suggestions (in-market, custom intent, remarketing)
- Device bid adjustment recommendations
- Ad schedule recommendations for healthcare

Return JSON:
{{
  "ad_group_name": "{cluster_name} — {intent}",
  "headlines": [
    {{"text": "≤30 chars", "pin": "PIN_1|PIN_2|PIN_3|FLEXIBLE", "category": "keyword|benefit|objection|proof|cta", "keyword_insertion": true|false}},
    ... 15 total
  ],
  "descriptions": [
    {{"text": "≤90 chars", "pin": "PIN_1|PIN_2|FLEXIBLE", "focus": "problem_solution|access|proof|cta", "mobile_preferred": false}},
    ... 4 total
  ],
  "final_url_path": {{"path1": "≤15 chars", "path2": "≤15 chars"}},
  "extensions": {{
    "sitelinks": [
      {{"headline": "≤25 chars", "description1": "≤35 chars", "description2": "≤35 chars", "url_path": "/page-path"}},
      ... 6 total
    ],
    "callouts": ["≤25 chars", ... 10 total],
    "structured_snippets": {{
      "header": "Services",
      "values": ["Service 1", ... 8 total]
    }},
    "call_extension": {{"phone_placeholder": "[PRACTICE_PHONE]", "call_reporting": true, "call_schedule": "Mon-Fri 8AM-6PM"}},
    "location_extension": {{"note": "Serving [CITY], [STATE] and surrounding areas"}},
    "price_extension": [
      {{"service": "...", "price_qualifier": "From", "price": "$XXX", "unit": "per session", "description": "...", "url_path": "/service-page"}}
    ],
    "image_extension_concepts": [
      {{"concept": "...", "alt_text": "...", "emotional_tone": "..."}}
    ]
  }},
  "ad_strength_analysis": {{
    "predicted_strength": "Excellent|Good|Average",
    "headline_diversity_score": "1-10",
    "keyword_coverage": "1-10",
    "cta_variety": "1-10",
    "improvement_tips": ["tip 1", "tip 2"]
  }},
  "campaign_strategy": {{
    "recommended_bid_strategy": "Target CPA|Maximize Conversions|Target ROAS",
    "target_cpa_estimate": "$XX-$XX",
    "audience_layers": ["In-market: Mental Health Services", "Custom Intent: [keywords]", "Remarketing: Site Visitors"],
    "device_bid_adjustments": {{"mobile": "+20%", "tablet": "-10%", "desktop": "0%"}},
    "ad_schedule": "Weekdays 7AM-9PM, Weekends 9AM-5PM",
    "geographic_targeting": "Radius targeting recommendation",
    "negative_keyword_additions": ["free therapy", "self help books", "online forums"]
  }},
  "a_b_test_variants": [
    {{"variant": "A", "hypothesis": "...", "headlines_to_test": ["...", "..."], "metric": "CTR|Conv Rate"}}
  ]
}}"""
        return self._chat_json(prompt, system=system, max_tokens=8192)

    def generate_keyword_clusters(self, company_data: dict) -> list:
        """
        World-class keyword research implementing:
        - Full-funnel keyword mapping (awareness → consideration → decision)
        - SKAG structure for maximum Quality Score
        - Competitor conquest keywords
        - Branded vs non-branded segmentation
        - Local intent keywords
        - Long-tail high-intent keywords
        - Negative keyword lists
        - Search volume and CPC estimates
        """
        system = (
            "You are a world-class healthcare PPC and SEO keyword strategist. "
            "You understand the full patient journey from symptom search to appointment booking. "
            "You know that healthcare keywords have unique compliance requirements (no guaranteed outcomes). "
            "You structure keyword clusters using SKAG methodology for maximum Quality Score. "
            "Return ONLY valid JSON."
        )
        name = company_data.get('company_name', '')
        specialty = company_data.get('specialty_niche', '')
        services = company_data.get('services', [])
        locations = company_data.get('locations', [])
        insurance = company_data.get('insurance_accepted', [])

        prompt = f"""Generate world-class Google Ads keyword clusters for this healthcare practice.

PRACTICE: {name}
SPECIALTY: {specialty}
SERVICES: {json.dumps([s.get('name','') for s in services[:12]])}
LOCATIONS: {json.dumps([f"{l.get('city','')}, {l.get('state','')}" for l in locations[:5]])}
INSURANCE: {', '.join(insurance[:10])}

Generate 12-15 keyword clusters covering the FULL patient journey funnel:

FUNNEL STAGES TO COVER:
1. AWARENESS (informational): "what is [condition]", "symptoms of [condition]", "[condition] treatment options"
2. CONSIDERATION (research): "types of [treatment]", "[treatment] vs [treatment]", "how does [treatment] work"
3. DECISION (transactional): "[treatment] near me", "book [specialty] appointment", "[specialty] accepting new patients"
4. LOCAL (geo-intent): "[city] [specialty]", "[specialty] [city] [state]", "[neighborhood] mental health"
5. INSURANCE (access): "[insurance] mental health coverage", "[specialty] that accepts [insurance]"
6. CONDITION-SPECIFIC: One cluster per major condition/service treated
7. BRANDED: Practice name + services
8. COMPETITOR CONQUEST: Generic terms that competitors bid on (no specific competitor names)

For each cluster, provide:
- 15-20 keywords per cluster (mix of exact, phrase, broad match modifier)
- Match type recommendation
- Negative keywords specific to this cluster
- Estimated monthly search volume tier (high/medium/low)
- Estimated CPC range for healthcare
- Conversion intent score (1-10)
- Recommended landing page type
- Ad copy angle recommendation

Return array of cluster objects:
[{{
  "cluster_name": "descriptive name",
  "funnel_stage": "awareness|consideration|decision|local|insurance|condition|branded|conquest",
  "primary_keyword": "main keyword",
  "match_type": "exact|phrase|broad",
  "keywords": [
    {{"keyword": "...", "match_type": "exact|phrase|broad", "estimated_monthly_searches": "high|medium|low", "estimated_cpc": "$X-$XX"}}
  ],
  "negative_keywords": ["...", ...],
  "intent": "informational|commercial|transactional|navigational",
  "conversion_intent_score": 8,
  "estimated_monthly_volume": "high|medium|low",
  "recommended_landing_page": "homepage|service-page|condition-page|contact",
  "ad_copy_angle": "benefit|urgency|social-proof|problem-solution",
  "bid_strategy_note": "...",
  "service": "service name this maps to"
}}]"""
        return self._chat_json(prompt, system=system, use_strategy=True, max_tokens=8192)

    # ══════════════════════════════════════════════════════════════════════════
    # MODULE 1B: META ADS — WORLD-CLASS GENERATION
    # ══════════════════════════════════════════════════════════════════════════

    def generate_meta_ad_copy(self, company_data: dict, target_audience: dict) -> dict:
        """
        World-class Meta Ads generation implementing:
        - Hook-first copywriting (first 3 words must stop the scroll)
        - Pattern interrupt techniques
        - Emotional resonance for mental health audiences
        - Platform-native formats: Feed, Stories, Reels, Messenger, Audience Network
        - 3-2-2 creative testing framework (3 audiences, 2 creatives, 2 ad copies)
        - AIDA and PAS copywriting frameworks
        - Social proof integration
        - Healthcare-compliant language (no stigmatizing language, no guaranteed outcomes)
        - Retargeting variants (cold, warm, hot audiences)
        - Video script hooks for Reels
        """
        system = (
            "You are a world-class Meta Ads strategist specializing in healthcare and mental health advertising. "
            "You have generated $30M+ in patient acquisition revenue through Facebook and Instagram campaigns. "
            "You know that mental health ads require extreme sensitivity — no stigmatizing language, no 'crazy', "
            "no before/after mental state comparisons, no guaranteed outcomes. "
            "You know Meta's healthcare advertising restrictions and work within them creatively. "
            "You understand that the first 3 words of primary text determine whether someone stops scrolling. "
            "You use the Hook → Problem → Agitate → Solution → CTA framework for cold audiences "
            "and Social Proof → Benefit → CTA for warm audiences. "
            "Return ONLY valid JSON."
        )
        name = company_data.get('company_name', '')
        specialty = company_data.get('specialty_niche', '')
        services = company_data.get('services', [])
        insurance = company_data.get('insurance_accepted', [])
        differentiators = company_data.get('differentiators', [])
        tone = company_data.get('brand_guidelines', {}).get('tone', 'warm, empathetic, clinically credible')
        audience_name = target_audience.get('name', 'general audience')
        audience_pain = target_audience.get('pain_points', [])
        audience_demo = target_audience.get('demographics', {})

        prompt = f"""Generate world-class Meta (Facebook/Instagram) ad copy for this healthcare practice.

PRACTICE: {name}
SPECIALTY: {specialty}
SERVICES: {json.dumps([s.get('name','') for s in services[:8]])}
INSURANCE: {', '.join(insurance[:10])}
DIFFERENTIATORS: {json.dumps(differentiators[:5])}
BRAND TONE: {tone}
TARGET AUDIENCE: {audience_name}
AUDIENCE PAIN POINTS: {json.dumps(audience_pain[:5])}
AUDIENCE DEMOGRAPHICS: {json.dumps(audience_demo)}

COPYWRITING REQUIREMENTS:

PRIMARY TEXT (3 variants — cold, warm, retargeting):
- COLD (awareness): Hook with a relatable problem statement. Use "You" language. No clinical jargon.
  Pattern: [Relatable situation] + [Emotional validation] + [Solution teaser] + [Soft CTA]
  Example hook patterns: "When medication after medication hasn't helped..." / "You've tried everything..."
- WARM (consideration): Lead with social proof or specific outcome. More specific about the service.
  Pattern: [Social proof] + [Specific benefit] + [Objection handling] + [Direct CTA]
- RETARGETING (decision): Urgency + specific offer + remove friction. Very direct.
  Pattern: [Reminder] + [Specific offer/ease] + [Urgency] + [Hard CTA]

HEADLINE (3 variants per audience temperature):
- ≤40 characters
- Must work as a standalone statement
- A/B test: benefit-led vs. question-led vs. social-proof-led

DESCRIPTION (3 variants):
- ≤30 characters
- Reinforce the headline
- Include insurance or access information

PLACEMENT-SPECIFIC COPY:
1. FEED (Facebook + Instagram): Full copy with all elements
2. STORIES: 3-5 word text overlay + strong visual direction
3. REELS: 3-second hook script (spoken) + on-screen text overlay + CTA
4. MESSENGER: Conversational opener for click-to-Messenger ads
5. AUDIENCE NETWORK: Simplified version for banner/interstitial

CREATIVE DIRECTION (for each placement):
- Image concept with specific visual elements, color mood, subject description
- Video concept (15-second and 30-second versions)
- Carousel concept (3-5 cards with progressive story)

AUDIENCE TARGETING RECOMMENDATIONS:
- Interest targeting stacks
- Lookalike audience seeds
- Custom audience segments
- Exclusions

Return JSON:
{{
  "campaign_objective": "AWARENESS|TRAFFIC|ENGAGEMENT|LEADS|CONVERSIONS",
  "audience_temperature": "cold|warm|hot",
  "ad_variants": [
    {{
      "variant_name": "Cold — Problem-Aware",
      "audience_temperature": "cold",
      "primary_text": "≤125 chars for feed, hook-first",
      "primary_text_extended": "Full version up to 500 chars with full PAS framework",
      "headline": "≤40 chars",
      "description": "≤30 chars",
      "cta_button": "LEARN_MORE|CONTACT_US|GET_QUOTE|BOOK_NOW|CALL_NOW",
      "copywriting_framework": "PAS|AIDA|Social Proof|Urgency",
      "hook_analysis": "Why the first 3 words stop the scroll"
    }},
    ... 3 variants (cold, warm, retargeting)
  ],
  "placement_copy": {{
    "feed": {{
      "primary_text": "...",
      "headline": "...",
      "description": "...",
      "image_concept": {{
        "subject": "...",
        "setting": "...",
        "color_mood": "...",
        "text_overlay": "...",
        "emotional_tone": "...",
        "avoid": ["stigmatizing imagery", "clinical/sterile settings", "sad faces"]
      }},
      "video_concept_15s": "...",
      "video_concept_30s": "...",
      "carousel_cards": [
        {{"card_number": 1, "headline": "...", "body": "...", "image_concept": "...", "url_path": "/..."}}
      ]
    }},
    "stories": {{
      "text_overlay": "3-5 words max",
      "visual_direction": "...",
      "cta_sticker": "...",
      "swipe_up_text": "..."
    }},
    "reels": {{
      "hook_script_3s": "Spoken words for first 3 seconds",
      "on_screen_text_sequence": ["Text at 0s", "Text at 3s", "Text at 8s"],
      "voiceover_script": "Full 15-30 second script",
      "music_mood": "...",
      "cta_overlay": "..."
    }},
    "messenger": {{
      "opener": "Conversational first message",
      "quick_replies": ["Option 1", "Option 2", "Option 3"]
    }}
  }},
  "audience_targeting": {{
    "interest_stacks": [
      {{"stack_name": "Mental Health Seekers", "interests": ["...", "..."], "behaviors": ["...", "..."]}},
      {{"stack_name": "Healthcare Decision Makers", "interests": ["...", "..."], "behaviors": ["...", "..."]}}
    ],
    "lookalike_seeds": ["Current patients", "Website visitors 180 days", "Video viewers 75%"],
    "custom_audiences": ["Website visitors", "Engaged with page", "Video viewers"],
    "exclusions": ["Current patients", "Employees", "Competitors"],
    "demographic_targeting": {{"age_range": "25-65", "gender": "All", "detailed_targeting": "..."}}
  }},
  "budget_recommendations": {{
    "testing_budget": "$50-100/day for 7-day creative test",
    "scaling_threshold": "3x ROAS or $50 CPA",
    "creative_refresh_cycle": "Every 2-3 weeks or when frequency >3"
  }},
  "compliance_notes": ["No guaranteed outcomes", "No before/after mental state", "No stigmatizing language"],
  "a_b_testing_plan": {{
    "framework": "3-2-2 (3 audiences, 2 creatives, 2 copy variants)",
    "primary_metric": "Cost Per Lead",
    "secondary_metric": "CTR",
    "test_duration": "7-14 days minimum",
    "winner_criteria": "Statistical significance at 95% confidence"
  }}
}}"""
        return self._chat_json(prompt, system=system, max_tokens=8192)

    # ══════════════════════════════════════════════════════════════════════════
    # MODULE 2: REFERRAL MARKETING
    # ══════════════════════════════════════════════════════════════════════════

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

        prompt = f"""Create a high-converting one-page physician referral fax flyer for {name} targeting {target_specialty} providers.

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
2. SUBJECT LINE: 50 chars max, catchy, uses an action verb or urgency word
3. OPENING HOOK: 2-sentence max. Lead with the referring physician's pain point
4. SOCIAL PROOF / STATS SECTION: Include 2-3 verifiable outcome statistics
5. WHY REFER — BULLET POINTS: 4-5 scannable bullets, each ≤15 words
6. SERVICES RELEVANT TO THIS SPECIALTY: List only the 3-5 most relevant services
7. INSURANCE / ACCESS: One clear sentence about insurance
8. INTAKE PROCESS (3 simple steps): Make it dead simple
9. AVAILABILITY NOTE: Urgency-creating but honest
10. SINGLE CLEAR CTA: One primary action only
11. FAX-BACK REFERRAL FORM: Tear-off style, 6 fields max
12. COMPLIANCE: Include opt-out line. No guaranteed outcome claims. HIPAA-safe language.

Return a single JSON object:
{{
  "subject_line": "50-char max catchy subject",
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
  "design_notes": "One-page layout: header zone (top 20%), stat callout bar, two-column body, fax-back form (bottom 30%). Black and white print safe.",
  "intro_paragraph": "A 3-4 sentence summary paragraph combining the opening hook and key value proposition."
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

    # ══════════════════════════════════════════════════════════════════════════
    # MODULE 3: CONTENT — WORLD-CLASS SEO BLOG GENERATION
    # ══════════════════════════════════════════════════════════════════════════

    def generate_blog_post(self, company_data: dict, keyword: str, target_word_count: int = 1500) -> dict:
        """
        World-class SEO blog post generation implementing:
        - E-E-A-T (Experience, Expertise, Authoritativeness, Trustworthiness) signals
        - Semantic SEO with LSI keywords and topic clusters
        - Featured snippet optimization (question-answer format, tables, lists)
        - People Also Ask (PAA) integration
        - Healthcare YMYL (Your Money Your Life) compliance
        - Schema markup recommendations (Article, FAQ, HowTo, MedicalCondition)
        - Internal linking strategy
        - Core Web Vitals-friendly structure
        - Conversion optimization within content
        - NLP-optimized headings (H1, H2, H3 hierarchy)
        """
        system = (
            "You are a world-class healthcare SEO content strategist and medical writer. "
            "You write content that ranks #1 on Google for competitive healthcare keywords. "
            "You understand E-E-A-T deeply: Experience (first-person patient/provider perspectives), "
            "Expertise (clinical accuracy, credentials mentioned), Authoritativeness (citations, statistics), "
            "Trustworthiness (balanced information, no fear-mongering, clear disclaimers). "
            "You know that healthcare content is YMYL (Your Money Your Life) and Google holds it to the highest standard. "
            "You write for both humans and search engines: engaging narrative + semantic keyword coverage. "
            "You structure content to win featured snippets and People Also Ask boxes. "
            "Return ONLY valid JSON."
        )
        name = company_data.get('company_name', '')
        specialty = company_data.get('specialty_niche', '')
        services = company_data.get('services', [])
        providers = company_data.get('providers', [])
        tone = company_data.get('brand_guidelines', {}).get('tone', 'warm, empathetic, clinically credible')
        location_city = company_data.get('locations', [{}])[0].get('city', '') if company_data.get('locations') else ''
        location_state = company_data.get('locations', [{}])[0].get('state', '') if company_data.get('locations') else ''

        prompt = f"""Write a world-class {target_word_count}-word SEO-optimized blog post for {name}.

PRACTICE CONTEXT:
- Specialty: {specialty}
- Services: {json.dumps([s.get('name','') for s in services[:8]])}
- Providers: {json.dumps([f"{p.get('name','')} {p.get('credentials','')}" for p in providers[:3]])}
- Location: {location_city}, {location_state}
- Brand tone: {tone}
- Target keyword: {keyword}

SEO REQUIREMENTS:
1. TITLE TAG (≤60 chars): Include primary keyword near the front. Use a number or power word if possible.
   Examples: "Spravato for Depression: What to Expect at Your First Treatment"
             "7 Signs You May Need TMS Therapy (And How It Works)"
2. META DESCRIPTION (≤155 chars): Include primary keyword, a benefit, and a soft CTA. No clickbait.
3. URL SLUG: Lowercase, hyphens, primary keyword, ≤60 chars
4. H1: Match search intent exactly. Should be slightly different from title tag.
5. H2 STRUCTURE: 5-8 H2s covering the full topic. Each H2 should target a secondary keyword or PAA question.
6. H3 STRUCTURE: 2-3 H3s under each H2 for depth and featured snippet eligibility
7. KEYWORD DENSITY: Primary keyword appears naturally 1-2% of total word count. No stuffing.
8. LSI KEYWORDS: 10-15 semantically related terms woven naturally throughout
9. FEATURED SNIPPET OPTIMIZATION:
   - Include one "What is [X]?" section with a 40-60 word definition paragraph (paragraph snippet)
   - Include one numbered list section (list snippet)
   - Include one comparison table if applicable (table snippet)
10. PEOPLE ALSO ASK: Address 5-7 PAA questions as H2 or H3 subheadings with concise answers
11. E-E-A-T SIGNALS:
    - Mention provider credentials naturally in the text
    - Include 2-3 statistics with source attribution (e.g., "According to the FDA...")
    - Add a medical disclaimer at the end
    - Include an "About the Author" placeholder
12. INTERNAL LINKING: Suggest 4-6 internal links to other pages/posts
13. EXTERNAL LINKING: Suggest 2-3 authoritative external sources (NIH, FDA, APA, NAMI)
14. SCHEMA MARKUP: Recommend Article + FAQ schema. Provide the FAQ schema data.
15. CONTENT STRUCTURE:
    - Hook paragraph (first 100 words must answer the search query directly)
    - Problem/context section
    - Educational body (the main content)
    - How [practice name] helps (soft conversion section, not salesy)
    - FAQ section (5-7 questions)
    - Conclusion with CTA
    - Medical disclaimer
16. CONVERSION ELEMENTS:
    - 1-2 inline CTAs (not disruptive) — e.g., "If you're wondering whether Spravato is right for you, [our team can help]."
    - End-of-post CTA with phone number placeholder

CONTENT QUALITY STANDARDS:
- Write at 8th-grade reading level (Flesch-Kincaid)
- Use short paragraphs (3-4 sentences max)
- Use bullet points and numbered lists liberally
- Include a table if comparing options (e.g., TMS vs. ECT vs. Spravato)
- No fear-mongering or sensationalism
- Balanced: acknowledge that treatment doesn't work for everyone
- HIPAA-safe: no patient stories without explicit consent placeholder

Return JSON:
{{
  "title_tag": "≤60 chars, keyword-optimized",
  "h1": "Slightly different from title, matches search intent",
  "meta_description": "≤155 chars with keyword + benefit + soft CTA",
  "slug": "url-friendly-slug",
  "target_keyword": "{keyword}",
  "secondary_keywords": ["lsi keyword 1", "lsi keyword 2", ... 10-15 total],
  "estimated_word_count": {target_word_count},
  "reading_level": "8th grade",
  "body_markdown": "Full {target_word_count}-word article in Markdown format with proper H2/H3 hierarchy, tables, lists, inline CTAs, and medical disclaimer",
  "faq_schema": [
    {{"question": "...", "answer": "concise 40-60 word answer optimized for featured snippet"}}
    ... 5-7 questions
  ],
  "internal_link_suggestions": [
    {{"anchor_text": "...", "suggested_page": "/page-path", "context": "where in the article to place it"}}
  ],
  "external_link_suggestions": [
    {{"anchor_text": "...", "url": "https://authoritative-source.gov/...", "context": "..."}}
  ],
  "schema_markup": {{
    "article_schema": {{"@type": "Article", "headline": "...", "author": {{"@type": "Person", "name": "...", "jobTitle": "..."}}}},
    "faq_schema": {{"@type": "FAQPage", "mainEntity": [...]}}
  }},
  "featured_snippet_targets": [
    {{"query": "...", "snippet_type": "paragraph|list|table", "content_location": "H2 section name"}}
  ],
  "image_suggestions": [
    {{"alt_text": "...", "caption": "...", "placement": "after intro|after H2 X", "concept": "..."}}
  ],
  "content_brief_summary": "3-sentence summary of what this article covers and its SEO strategy",
  "estimated_ranking_timeline": "3-6 months for competitive keywords, 1-3 months for long-tail",
  "competitor_gap_analysis": "What this article does better than typical results for this keyword"
}}"""
        return self._chat_json(prompt, system=system, use_strategy=False, max_tokens=16000)

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

    # ══════════════════════════════════════════════════════════════════════════
    # MODULE 1C: QUORA ADS — WORLD-CLASS GENERATION
    # ══════════════════════════════════════════════════════════════════════════

    def generate_quora_ads(self, company_data: dict, target_topics: list = None) -> dict:
        """
        World-class Quora Ads generation implementing:
        - Question-answer native format (ads that look like Quora answers)
        - Topic and question targeting strategy
        - Promoted Answer format (most effective for healthcare)
        - Text Ad format with image
        - Audience targeting: Behavioral, Interest, Keyword, Lookalike
        - Retargeting pixel strategy
        - Healthcare-specific question targeting
        - Thought leadership positioning
        """
        system = (
            "You are a world-class Quora Ads strategist specializing in healthcare. "
            "You know that Quora users are in active research mode — they have a specific question and want a real answer. "
            "The most effective Quora ads for healthcare are Promoted Answers that provide genuine value "
            "and position the practice as a trusted expert, not a sales pitch. "
            "You know Quora's healthcare advertising policies and write within them. "
            "Return ONLY valid JSON."
        )
        name = company_data.get('company_name', '')
        specialty = company_data.get('specialty_niche', '')
        services = company_data.get('services', [])
        differentiators = company_data.get('differentiators', [])

        topics = target_topics or [specialty, "mental health", "depression treatment", "anxiety treatment"]

        prompt = f"""Generate world-class Quora advertising content for this healthcare practice.

PRACTICE: {name}
SPECIALTY: {specialty}
SERVICES: {json.dumps([s.get('name','') for s in services[:8]])}
DIFFERENTIATORS: {json.dumps(differentiators[:5])}
TARGET TOPICS: {json.dumps(topics)}

QUORA AD FORMATS TO GENERATE:

1. PROMOTED ANSWERS (most effective for healthcare):
   - Write 5 high-quality, genuinely helpful answers to real questions people ask on Quora
   - Each answer should be 150-300 words
   - Answer the question FIRST, then naturally mention the practice
   - Include a soft CTA at the end ("If you're in [city], [practice name] specializes in...")
   - Questions should target different funnel stages

2. TEXT ADS (sidebar/feed):
   - 3 variants with different angles
   - Headline ≤65 chars
   - Body ≤105 chars
   - CTA button text

3. IMAGE ADS:
   - 3 variants
   - Headline ≤65 chars
   - Body ≤105 chars
   - Image concept description

TARGETING STRATEGY:
- Question targeting: List 20 specific Quora questions to target
- Topic targeting: List 15 topics to target
- Keyword targeting: List 25 keywords
- Audience targeting: Behavioral and interest segments
- Lookalike audience seeds

Return JSON:
{{
  "promoted_answers": [
    {{
      "target_question": "Exact question as it appears on Quora",
      "question_url_example": "https://www.quora.com/...",
      "funnel_stage": "awareness|consideration|decision",
      "answer_text": "Full 150-300 word answer that genuinely helps the reader",
      "soft_cta": "Natural mention of the practice at the end",
      "upvote_potential": "high|medium",
      "estimated_monthly_views": "high|medium|low"
    }},
    ... 5 answers
  ],
  "text_ads": [
    {{
      "variant": "A",
      "angle": "problem-solution|social-proof|benefit",
      "headline": "≤65 chars",
      "body": "≤105 chars",
      "cta_button": "Learn More|Get Help|Book Now|Contact Us",
      "landing_page_recommendation": "/page-path"
    }},
    ... 3 variants
  ],
  "image_ads": [
    {{
      "variant": "A",
      "headline": "≤65 chars",
      "body": "≤105 chars",
      "image_concept": "Detailed description of the image",
      "cta_button": "..."
    }},
    ... 3 variants
  ],
  "targeting_strategy": {{
    "question_targeting": ["Specific question 1", ... 20 questions],
    "topic_targeting": ["Topic 1", ... 15 topics],
    "keyword_targeting": ["keyword 1", ... 25 keywords],
    "behavioral_targeting": ["Recently searched mental health treatment", ...],
    "interest_targeting": ["Mental Health", "Psychology", "Psychiatry", ...],
    "lookalike_seeds": ["Website visitors", "Patient list upload", "Video viewers"],
    "geographic_targeting": "City/state radius recommendation",
    "device_targeting": "All devices — Quora is 60% mobile"
  }},
  "campaign_structure": {{
    "campaign_1": {{"name": "Awareness — Condition Education", "objective": "Brand Awareness", "budget": "$20-50/day"}},
    "campaign_2": {{"name": "Consideration — Treatment Research", "objective": "Traffic", "budget": "$30-75/day"}},
    "campaign_3": {{"name": "Decision — Appointment Intent", "objective": "Conversions", "budget": "$50-100/day"}}
  }},
  "performance_benchmarks": {{
    "average_ctr_healthcare": "0.5-1.5%",
    "average_cpc_healthcare": "$2-8",
    "average_cpa_healthcare": "$30-150",
    "best_performing_format": "Promoted Answers"
  }}
}}"""
        return self._chat_json(prompt, system=system, max_tokens=8192)

    # ══════════════════════════════════════════════════════════════════════════
    # MODULE 1D: REDDIT ADS — WORLD-CLASS GENERATION
    # ══════════════════════════════════════════════════════════════════════════

    def generate_reddit_ads(self, company_data: dict, target_subreddits: list = None) -> dict:
        """
        World-class Reddit Ads generation implementing:
        - Native-feeling copy that doesn't feel like an ad
        - Subreddit-specific tone matching
        - Promoted Post format (most effective)
        - Community-first approach (provide value, not just sell)
        - Reddit's unique culture: authenticity, anti-corporate tone, humor
        - Healthcare subreddit targeting
        - Conversation starter format
        - AMA (Ask Me Anything) style content
        """
        system = (
            "You are a world-class Reddit Ads strategist specializing in healthcare. "
            "You understand Reddit's culture deeply: users are highly skeptical of ads, "
            "they downvote anything that feels corporate or inauthentic, "
            "and they respond to honesty, vulnerability, and genuine helpfulness. "
            "The best Reddit healthcare ads feel like a helpful community member sharing information, "
            "not a brand selling a product. "
            "You know Reddit's healthcare advertising policies and write within them. "
            "Return ONLY valid JSON."
        )
        name = company_data.get('company_name', '')
        specialty = company_data.get('specialty_niche', '')
        services = company_data.get('services', [])
        differentiators = company_data.get('differentiators', [])
        locations = company_data.get('locations', [])
        city = locations[0].get('city', '') if locations else ''

        default_subreddits = [
            "r/depression", "r/anxiety", "r/mentalhealth", "r/TreatmentResistantDepression",
            "r/TMS", "r/Psychiatry", "r/therapy", "r/ADHD", "r/bipolar", "r/ptsd"
        ]
        subreddits = target_subreddits or default_subreddits

        prompt = f"""Generate world-class Reddit advertising content for this healthcare practice.

PRACTICE: {name}
SPECIALTY: {specialty}
SERVICES: {json.dumps([s.get('name','') for s in services[:8]])}
DIFFERENTIATORS: {json.dumps(differentiators[:5])}
CITY: {city}
TARGET SUBREDDITS: {json.dumps(subreddits)}

REDDIT AD FORMATS TO GENERATE:

1. PROMOTED POSTS (most effective format):
   - 5 variants, each tailored to a different subreddit's tone and culture
   - Title: ≤300 chars (acts like a post title — must be compelling, not salesy)
   - Body: 100-300 words (feels like a genuine community post)
   - Must provide real value FIRST, then mention the practice
   - Tone: conversational, honest, slightly vulnerable, never corporate

2. CONVERSATION STARTER POSTS:
   - 3 posts designed to generate genuine discussion
   - These are educational/informational posts that build awareness
   - No hard sell — just positioning the practice as a knowledgeable resource

3. IMAGE/VIDEO AD COPY:
   - 3 variants with Reddit-native visual concepts
   - Title ≤300 chars
   - Body ≤100 chars

SUBREDDIT-SPECIFIC STRATEGY:
For each target subreddit, provide:
- Tone guide (how to sound like a native member)
- Content angle (what type of content performs well here)
- What to AVOID (what gets downvoted)
- Specific post idea tailored to that community

TARGETING STRATEGY:
- Subreddit targeting list (30 subreddits)
- Interest targeting
- Keyword targeting
- Audience expansion strategy

Return JSON:
{{
  "promoted_posts": [
    {{
      "target_subreddit": "r/depression",
      "post_title": "≤300 chars — compelling, not salesy, matches subreddit tone",
      "post_body": "100-300 words — genuinely helpful, community-native tone",
      "soft_mention": "How the practice is mentioned naturally at the end",
      "tone_notes": "Why this tone works for this subreddit",
      "expected_engagement": "high|medium|low",
      "cta": "link to landing page or comment CTA"
    }},
    ... 5 posts
  ],
  "conversation_starters": [
    {{
      "subreddit": "r/mentalhealth",
      "title": "Educational/discussion post title",
      "body": "Genuinely helpful content that positions practice as expert",
      "discussion_prompt": "Question at the end to encourage comments"
    }},
    ... 3 posts
  ],
  "image_ads": [
    {{
      "variant": "A",
      "title": "≤300 chars",
      "body": "≤100 chars",
      "image_concept": "Reddit-native visual — authentic, not stock-photo-corporate",
      "subreddit_targets": ["r/depression", "r/mentalhealth"]
    }},
    ... 3 variants
  ],
  "subreddit_strategy": [
    {{
      "subreddit": "r/depression",
      "tone_guide": "...",
      "content_angle": "...",
      "avoid": ["corporate language", "hard sell", "..."],
      "best_post_type": "personal story|educational|resource sharing|AMA"
    }},
    ... for each target subreddit
  ],
  "targeting_strategy": {{
    "subreddit_targeting": ["r/depression", "r/anxiety", ... 30 subreddits],
    "interest_targeting": ["Mental Health", "Psychology", ...],
    "keyword_targeting": ["treatment resistant depression", "TMS therapy", ... 25 keywords],
    "community_targeting": "Engage with mental health communities authentically",
    "geographic_targeting": "City/state targeting recommendation"
  }},
  "community_guidelines": [
    "Never claim to cure or guarantee outcomes",
    "Always acknowledge that treatment doesn't work for everyone",
    "Be transparent that this is a paid promotion",
    "Respond to comments genuinely if allowed"
  ],
  "performance_benchmarks": {{
    "average_ctr_healthcare": "0.3-0.8%",
    "average_cpc_healthcare": "$1.50-5",
    "best_performing_format": "Promoted Posts with genuine value",
    "upvote_ratio_target": ">70%"
  }}
}}"""
        return self._chat_json(prompt, system=system, max_tokens=8192)

    # ══════════════════════════════════════════════════════════════════════════
    # MODULE 1E: PINTEREST ADS — WORLD-CLASS GENERATION
    # ══════════════════════════════════════════════════════════════════════════

    def generate_pinterest_ads(self, company_data: dict) -> dict:
        """
        World-class Pinterest Ads generation implementing:
        - Visual-first copywriting (text supports the image, not the other way around)
        - Pinterest's unique discovery mindset (users are planning, not searching)
        - Vertical image format (2:3 ratio, 1000x1500px optimal)
        - Pin title optimization (100 chars)
        - Pin description SEO (500 chars with keywords)
        - Board strategy for organic + paid amplification
        - Shopping Pins for service packages
        - Idea Pins (multi-page video/image format)
        - Carousel Pins for multi-service showcases
        - Keyword-rich descriptions for Pinterest SEO
        - Healthcare wellness aesthetic
        """
        system = (
            "You are a world-class Pinterest Ads strategist specializing in health and wellness brands. "
            "You understand that Pinterest is a visual discovery platform where users are in 'planning mode' — "
            "they're saving ideas for their future self, not making immediate decisions. "
            "Pinterest users skew 70% female, are 35% more likely to have household income over $100k, "
            "and are actively seeking health and wellness improvements. "
            "The best healthcare Pinterest content is aspirational, educational, and visually calming — "
            "think soft colors, clean design, empowering messages, not clinical imagery. "
            "You know Pinterest's healthcare advertising policies and write within them. "
            "Return ONLY valid JSON."
        )
        name = company_data.get('company_name', '')
        specialty = company_data.get('specialty_niche', '')
        services = company_data.get('services', [])
        differentiators = company_data.get('differentiators', [])
        brand = company_data.get('brand_guidelines', {})
        primary_color = brand.get('primary_color', '#4A90D9')

        prompt = f"""Generate world-class Pinterest advertising content for this healthcare practice.

PRACTICE: {name}
SPECIALTY: {specialty}
SERVICES: {json.dumps([s.get('name','') for s in services[:8]])}
DIFFERENTIATORS: {json.dumps(differentiators[:5])}
BRAND COLOR: {primary_color}
BRAND TONE: {brand.get('tone', 'warm, empowering, clinically credible')}

PINTEREST AD FORMATS TO GENERATE:

1. STANDARD PINS (Static Image):
   - 5 pins with different angles
   - Title ≤100 chars (keyword-rich, benefit-led)
   - Description ≤500 chars (conversational, keyword-rich, includes CTA)
   - Detailed image concept (vertical 2:3 ratio, 1000x1500px)
   - Text overlay copy (short, powerful, readable at small size)

2. CAROUSEL PINS (Multi-image):
   - 2 carousel concepts with 3-5 cards each
   - Progressive story or educational sequence
   - Each card: image concept + text overlay

3. IDEA PINS (Multi-page video/image):
   - 2 Idea Pin concepts (6-8 pages each)
   - Educational content that provides real value
   - Each page: visual concept + text overlay + narration script

4. VIDEO PINS:
   - 2 video concepts (15s and 30s)
   - Hook frame (first 2 seconds)
   - Storyboard outline
   - Voiceover script

BOARD STRATEGY:
- 8 board recommendations with keyword-optimized names and descriptions
- Content mix for each board (organic + promoted)
- Seasonal content calendar

PINTEREST SEO:
- 30 Pinterest keywords to use in pin descriptions
- Board keyword optimization
- Profile bio optimization

Return JSON:
{{
  "standard_pins": [
    {{
      "pin_number": 1,
      "angle": "educational|inspirational|problem-solution|social-proof|seasonal",
      "title": "≤100 chars, keyword-rich, benefit-led",
      "description": "≤500 chars, conversational, 3-5 keywords naturally woven in, ends with soft CTA",
      "image_concept": {{
        "dimensions": "1000x1500px (2:3 ratio)",
        "background": "color/setting description",
        "subject": "what's in the image",
        "text_overlay": "Short powerful text on the image (≤8 words)",
        "text_overlay_position": "top|center|bottom",
        "color_palette": ["#hex1", "#hex2", "#hex3"],
        "font_style": "serif|sans-serif|script",
        "mood": "calm|empowering|hopeful|professional",
        "avoid": ["clinical imagery", "sad faces", "hospital settings"]
      }},
      "keywords_used": ["keyword 1", "keyword 2", "keyword 3"],
      "board_placement": "Board name",
      "seasonal_relevance": "year-round|spring|summer|fall|winter|month"
    }},
    ... 5 pins
  ],
  "carousel_pins": [
    {{
      "concept_name": "...",
      "theme": "...",
      "cards": [
        {{"card_number": 1, "image_concept": "...", "text_overlay": "...", "narration": "..."}}
      ]
    }},
    ... 2 carousels
  ],
  "idea_pins": [
    {{
      "concept_name": "...",
      "topic": "Educational topic that provides real value",
      "pages": [
        {{"page": 1, "visual_concept": "...", "text_overlay": "...", "narration_script": "..."}}
      ]
    }},
    ... 2 idea pins
  ],
  "video_pins": [
    {{
      "duration": "15s|30s",
      "hook_frame": "First 2 seconds — what the viewer sees and hears",
      "storyboard": [
        {{"second": "0-3", "visual": "...", "text_overlay": "...", "voiceover": "..."}}
      ],
      "full_voiceover_script": "...",
      "music_mood": "calm|uplifting|professional"
    }},
    ... 2 videos
  ],
  "board_strategy": [
    {{
      "board_name": "keyword-optimized board name",
      "description": "≤500 chars, keyword-rich board description",
      "content_themes": ["theme 1", "theme 2"],
      "pin_frequency": "X pins per week",
      "seasonal_focus": "..."
    }},
    ... 8 boards
  ],
  "pinterest_seo": {{
    "profile_bio": "≤160 chars, keyword-rich, benefit-led",
    "top_keywords": ["keyword 1", ... 30 keywords],
    "keyword_categories": {{
      "condition_keywords": ["depression treatment", ...],
      "treatment_keywords": ["TMS therapy", "Spravato", ...],
      "wellness_keywords": ["mental wellness", "self care", ...],
      "local_keywords": ["[city] therapist", "[city] psychiatrist", ...]
    }}
  }},
  "targeting_strategy": {{
    "interest_targeting": ["Mental Health", "Wellness", "Self Care", "Psychology", ...],
    "keyword_targeting": ["depression treatment", "anxiety help", ... 25 keywords],
    "audience_targeting": ["Actalike audiences", "Engagement retargeting", "Customer list"],
    "demographic_targeting": {{"age": "25-54", "gender": "All (skews female)", "income": "Middle to upper"}}
  }},
  "performance_benchmarks": {{
    "average_ctr_healthcare": "0.5-2%",
    "average_cpc_healthcare": "$0.50-2",
    "pin_lifespan": "Pinterest pins have a 3.5-month average lifespan vs 24 hours on other platforms",
    "best_performing_format": "Standard Pins with text overlay + Idea Pins for education"
  }}
}}"""
        return self._chat_json(prompt, system=system, max_tokens=8192)

    # ══════════════════════════════════════════════════════════════════════════
    # MODULE 4: SEO
    # ══════════════════════════════════════════════════════════════════════════

    def analyze_seo_data(self, company_data: dict, gsc_data: dict, crawl_results: dict) -> dict:
        system = "You are a technical SEO specialist for healthcare. Return ONLY valid JSON."
        prompt = f"""Analyze SEO data for {company_data['company_name']} ({company_data.get('website_url', '')}).

GSC data: {json.dumps(gsc_data)[:5000]}
Crawl results: {json.dumps(crawl_results)[:5000]}

Return: {{"summary": "...", "quick_wins": [{{"action": "...", "priority": "high", "expected_impact": "...", "effort": "low"}}], "technical_fixes": [{{"issue": "...", "affected_pages": [], "fix": "...", "priority": "high"}}], "content_opportunities": [{{"keyword": "...", "intent": "...", "recommended_format": "..."}}], "local_seo_actions": [{{"action": "...", "priority": "..."}}], "schema_recommendations": [{{"schema_type": "...", "page": "...", "impact": "..."}}], "30_day_action_plan": [{{"week": 1, "actions": ["..."]}}]}}"""
        return self._chat_json(prompt, system=system, use_strategy=True)

    # ══════════════════════════════════════════════════════════════════════════
    # MODULE 5: DIRECTORY PROFILES
    # ══════════════════════════════════════════════════════════════════════════

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
