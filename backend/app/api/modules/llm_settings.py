"""
LLM Provider Settings API.

GET  /llm-settings/providers      — list available providers with status
GET  /llm-settings/current        — get active provider + models
PUT  /llm-settings/provider       — switch provider at runtime
POST /llm-settings/test           — send a test prompt through the active provider
"""
from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/llm-settings", tags=["llm-settings"])


def _get_state():
    """Import lazily to avoid circular imports."""
    from app.services.llm import _provider_state, PROVIDER_MODELS, llm_service
    return _provider_state, PROVIDER_MODELS, llm_service


@router.get("/providers")
async def list_providers():
    """Return all supported providers with connection status."""
    from app.core.config import settings

    _provider_state, PROVIDER_MODELS, _ = _get_state()

    providers = []
    for key, info in PROVIDER_MODELS.items():
        # Check if an API key is configured for this provider
        key_configured = False
        if key == "anthropic":
            key_configured = bool(
                _provider_state["api_keys"].get("anthropic") or settings.ANTHROPIC_API_KEY
            )
        elif key == "openai":
            key_configured = bool(
                _provider_state["api_keys"].get("openai") or settings.OPENAI_API_KEY
            )
        elif key == "gemini":
            key_configured = bool(
                _provider_state["api_keys"].get("gemini") or settings.GOOGLE_AI_API_KEY
            )

        providers.append({
            "id":           key,
            "label":        info["label"],
            "description":  info["description"],
            "bulk_model":   info["bulk"],
            "strategy_model": info["strategy"],
            "is_default":   key == "anthropic",
            "is_active":    _provider_state["provider"] == key,
            "key_configured": key_configured,
        })

    return {
        "providers":        providers,
        "active_provider":  _provider_state["provider"],
    }


@router.get("/current")
async def get_current():
    """Return the active provider and current model names."""
    _provider_state, PROVIDER_MODELS, llm_service = _get_state()
    p = _provider_state["provider"]
    return {
        "provider":       p,
        "label":          PROVIDER_MODELS[p]["label"],
        "model_bulk":     llm_service.model_bulk,
        "model_strategy": llm_service.model_strategy,
    }


@router.put("/provider")
async def set_provider(data: dict):
    """
    Switch the active LLM provider.

    Body:
      { "provider": "anthropic" | "openai" | "gemini",
        "api_key":  "<optional — stored in memory, not persisted>" }
    """
    _provider_state, PROVIDER_MODELS, _ = _get_state()

    provider = data.get("provider", "").strip().lower()
    if provider not in PROVIDER_MODELS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown provider '{provider}'. Valid: {list(PROVIDER_MODELS)}",
        )

    _provider_state["provider"] = provider

    # If an API key was included, store it as a runtime override
    api_key = data.get("api_key", "").strip()
    if api_key:
        _provider_state["api_keys"][provider] = api_key

    info = PROVIDER_MODELS[provider]
    return {
        "status":   "switched",
        "provider": provider,
        "label":    info["label"],
        "models": {
            "bulk":     info["bulk"],
            "strategy": info["strategy"],
        },
    }


@router.post("/test")
async def test_provider():
    """Send a short test prompt through the active provider to verify connectivity."""
    _provider_state, PROVIDER_MODELS, llm_service = _get_state()
    provider = _provider_state["provider"]

    try:
        resp = llm_service.client.messages.create(
            model=llm_service.model_bulk,
            max_tokens=50,
            messages=[{"role": "user", "content": "Reply with exactly: OK"}],
        )
        text = resp.content[0].text.strip()
        return {
            "status":   "ok",
            "provider": provider,
            "response": text,
        }
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"{PROVIDER_MODELS[provider]['label']} test failed: {exc}",
        )
