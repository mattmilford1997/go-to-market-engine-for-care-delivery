# ── Stage 1: Build Next.js frontend ──────────────────────────────────
FROM node:20-alpine AS frontend-builder
WORKDIR /app

COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .

# Do NOT pass NEXT_PUBLIC_API_URL so it defaults to the relative /api/v1 path,
# which the Next.js API route proxies to http://localhost:8000 (the co-located backend).
RUN npm run build

# ── Production image: Python 3.11 + Node 20 ──────────────────────────
FROM python:3.11-slim

WORKDIR /app

# Install Node.js 20.x
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl ca-certificates && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y --no-install-recommends nodejs && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Install Python backend dependencies
COPY backend/requirements.txt /backend/requirements.txt
RUN pip install --no-cache-dir -r /backend/requirements.txt

# Copy backend source
COPY backend/ /backend/

# Copy Next.js standalone build artifacts
ENV NODE_ENV=production
COPY --from=frontend-builder /app/public ./public
COPY --from=frontend-builder /app/.next/standalone ./
COPY --from=frontend-builder /app/.next/static ./.next/static

# Startup: run DB migrations → start FastAPI on :8000 → start Next.js on $PORT
RUN printf '#!/bin/sh\nset -e\ncd /backend && python -m alembic upgrade head\ncd /backend && uvicorn app.main:app --host 0.0.0.0 --port 8000 &\ncd /app && exec node server.js\n' > /start.sh \
    && chmod +x /start.sh

EXPOSE 3000
ENV PORT=3000

CMD ["/start.sh"]
