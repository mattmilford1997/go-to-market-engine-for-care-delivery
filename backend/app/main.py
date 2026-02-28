from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api.companies import router as companies_router
from app.api.approval import router as approval_router
from app.api.modules.referral import router as referral_router
from app.api.modules.content import router as content_router
from app.api.modules.paid_ads import router as paid_ads_router
from app.api.modules.seo import router as seo_router
from app.api.modules.profiles import router as profiles_router

app = FastAPI(
    title=settings.APP_NAME,
    description="Arche Studios Healthcare GTM Marketing Engine",
    version="2.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

PREFIX = settings.API_V1_PREFIX
app.include_router(companies_router, prefix=PREFIX)
app.include_router(approval_router, prefix=PREFIX)
app.include_router(referral_router, prefix=PREFIX)
app.include_router(content_router, prefix=PREFIX)
app.include_router(paid_ads_router, prefix=PREFIX)
app.include_router(seo_router, prefix=PREFIX)
app.include_router(profiles_router, prefix=PREFIX)


@app.get("/health")
async def health():
    return {"status": "ok", "version": "2.0.0"}


@app.get("/")
async def root():
    return {
        "app": settings.APP_NAME,
        "docs": "/api/docs",
        "version": "2.0.0",
    }
