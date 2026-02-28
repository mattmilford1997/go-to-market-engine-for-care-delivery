# Arche GTM Marketing Engine

**Healthcare Go-to-Market Engine** — Arche Studios
Pilot: [novamindmentalhealth.com](https://novamindmentalhealth.com)

---

## Overview

A unified web application that automates patient acquisition across **5 integrated marketing channels**. Given only a company website URL, the engine scrapes and understands the practice, then generates campaigns across paid ads, referral outreach, organic content, SEO, and directory profiles.

**Stack:** Next.js 16 + FastAPI + PostgreSQL + Redis/Celery + Claude API

---

## Quick Start

```bash
# 1. Configure env
cp backend/.env.example backend/.env
cp frontend/.env.local.example frontend/.env.local

# 2. Start DB + Redis
docker compose up db redis -d

# 3. Backend
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload   # → :8000

# 4. Frontend
cd frontend && npm install && npm run dev  # → :3000
```

- **App**: http://localhost:3000
- **API Docs**: http://localhost:8000/api/docs
- **Admin**: http://localhost:3000/admin

---

## Five Modules

| # | Module | Channels | Status |
|---|--------|----------|--------|
| 1 | Paid Ads | Google Ads, Meta Ads | Build-first |
| 2 | Referral Engine | Fax, Email, Voicemail, Mail | Build-first |
| 3 | Organic Content | Blog, Facebook, Instagram, LinkedIn | Build-first |
| 4 | SEO Optimizer | Technical, Keywords, Local | Build-first |
| 5 | Profile Builder | 9 healthcare directories | Build-first |

---

## Dashboard

- **Portfolio Overview** — cross-company aggregate stats (Arche admin)
- **Approval Queue** — every AI asset requires human approval before deploy
- **Budget Tracker** — per-channel monthly caps + burn rate alerts
- **Leads** — NPPES auto-generated + CSV upload referral leads
- **Materials Library** — all generated assets, searchable + filterable
- **Settings & Credentials** — one-page hub for all API keys

---

## Build-First Philosophy

All modules generate content immediately without API keys. Deployment to live platforms activates when keys are added in Settings. Nothing goes live without human approval.

---

## Adding API Keys

Upload in **Settings & Credentials** per company dashboard. Key integrations:
- `ANTHROPIC_API_KEY` — LLM generation (all modules)
- Google Ads, Meta Ads — Module 1
- Instantly, OpenFax, Lob, Slybroadcast — Module 2
- Google Search Console — Module 4
- Google Business Profile — Module 5

See `backend/.env.example` for full list.

---

## Compliance Built-In

Email (CAN-SPAM), Voicemail (TCPA), Fax (Junk Fax Prevention Act), unified cross-channel suppression list.

---

*Arche Studios Portfolio — v2.0*
