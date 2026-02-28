from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    # App
    APP_NAME: str = "Arche GTM Engine"
    DEBUG: bool = False
    API_V1_PREFIX: str = "/api/v1"

    # Database
    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/arche_gtm"
    SUPABASE_URL: Optional[str] = None
    SUPABASE_ANON_KEY: Optional[str] = None
    SUPABASE_SERVICE_KEY: Optional[str] = None

    # Redis / Celery
    REDIS_URL: str = "redis://localhost:6379/0"
    CELERY_BROKER_URL: str = "redis://localhost:6379/0"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/1"

    # Auth
    SECRET_KEY: str = "change-me-in-production-secret-key-32chars"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours

    # AI / LLM
    ANTHROPIC_API_KEY: Optional[str] = None
    OPENAI_API_KEY: Optional[str] = None
    GOOGLE_AI_API_KEY: Optional[str] = None
    LLM_PROVIDER: str = "anthropic"          # anthropic | openai | gemini
    LLM_MODEL_BULK: str = "claude-sonnet-4-6"      # bulk generation
    LLM_MODEL_STRATEGY: str = "claude-opus-4-6"     # strategy tasks

    # Storage
    STORAGE_BUCKET: str = "arche-gtm-assets"

    # Integrations (all optional — plug in later)
    GOOGLE_ADS_DEVELOPER_TOKEN: Optional[str] = None
    META_APP_ID: Optional[str] = None
    META_APP_SECRET: Optional[str] = None
    OPENFAX_API_KEY: Optional[str] = None
    SLYBROADCAST_USERNAME: Optional[str] = None
    SLYBROADCAST_PASSWORD: Optional[str] = None
    LOB_API_KEY: Optional[str] = None
    INSTANTLY_API_KEY: Optional[str] = None
    ELEVENLABS_API_KEY: Optional[str] = None
    GOOGLE_PAGESPEED_API_KEY: Optional[str] = None

    # CORS
    ALLOWED_ORIGINS: list[str] = ["http://localhost:3000", "https://*.vercel.app"]

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


settings = Settings()
