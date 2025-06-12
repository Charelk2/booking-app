# builder stage
FROM python:3.11-slim AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y curl gnupg ca-certificates \
    libnss3 libatk1.0-0 libcups2 libdrm2 libgbm1 libgtk-3-0 libasound2 \
    libx11-xcb1 libxcomposite1 libxdamage1 libxrandr2 libxkbcommon0 \
    libxshmfence1 libdbus-1-3 libxss1 libxtst6 \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get update \
    && apt-get install -y nodejs \
    && npm config set fetch-retry-mintimeout 20000 \
    && npm config set registry https://registry.npmjs.org \
    && rm -rf /var/lib/apt/lists/*

# install Python dependencies into a virtual environment
COPY backend/requirements.txt backend/
COPY requirements-dev.txt ./
RUN python -m venv backend/venv \
    && backend/venv/bin/pip install --no-cache-dir -r backend/requirements.txt -r requirements-dev.txt \
    && sha256sum backend/requirements.txt | awk '{print $1}' > backend/venv/.req_hash \
    && touch backend/venv/.install_complete

COPY frontend/package.json frontend/package-lock.json ./frontend/
WORKDIR /app/frontend
RUN npm ci --silent \
    && npm run build --silent \
    && sha256sum package-lock.json | awk '{print $1}' > node_modules/.pkg_hash \
    && touch node_modules/.install_complete

# final stage
FROM python:3.11-slim
WORKDIR /app
COPY --from=builder /app /app
COPY setup.sh scripts/test-all.sh ./
RUN chmod +x setup.sh scripts/test-all.sh
ENTRYPOINT ["bash","-lc","./setup.sh && ./scripts/test-all.sh"]
