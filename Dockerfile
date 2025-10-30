# builder stage
FROM python:3.12.11-slim AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y curl gnupg ca-certificates \
    libnss3 libatk1.0-0 libcups2 libdrm2 libgbm1 libgtk-3-0 libasound2 \
    libx11-xcb1 libxcomposite1 libxdamage1 libxrandr2 libxkbcommon0 \
    libxshmfence1 libdbus-1-3 libxss1 libxtst6 \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get update \
    # Use `docker build --network bridge` if npm fails to reach registry.npmjs.org
    && apt-get install -y nodejs \
    && npm config set fetch-retry-mintimeout 20000 \
    && npm config set registry https://registry.npmjs.org \
    && rm -rf /var/lib/apt/lists/*

# Bake Cloud SQL Auth Proxy into the image so we don't download at boot
RUN curl -sLo /usr/local/bin/cloud-sql-proxy \
      https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.10.0/cloud-sql-proxy.linux.amd64 \
    && chmod +x /usr/local/bin/cloud-sql-proxy

# install Python dependencies into a virtual environment
COPY backend/requirements.txt backend/
COPY requirements-dev.txt ./
RUN python -m venv backend/venv \
    && backend/venv/bin/pip install --no-cache-dir -r backend/requirements.txt -r requirements-dev.txt \
    && sha256sum backend/requirements.txt | awk '{print $1}' > backend/venv/.req_hash \
    && python --version | awk '{print $2}' > backend/venv/.meta

COPY frontend/package.json frontend/package-lock.json ./frontend/
WORKDIR /app/frontend
RUN npm ci --silent \
    && npx playwright install --with-deps \
    && npm run build --silent \
    && sha256sum package-lock.json | awk '{print $1}' > node_modules/.pkg_hash \
    && node --version | sed 's/^v//' > node_modules/.meta

# final stage
FROM python:3.12.11-slim
WORKDIR /app
COPY --from=builder /app /app
# Copy pre-baked Cloud SQL Auth Proxy
COPY --from=builder /usr/local/bin/cloud-sql-proxy /usr/local/bin/cloud-sql-proxy
COPY setup.sh scripts/test-all.sh ./
RUN chmod +x setup.sh scripts/test-all.sh
ENV CONTENT_SECURITY_POLICY="default-src 'self'" \
    STRICT_TRANSPORT_SECURITY="max-age=63072000; includeSubDomains" \
    X_FRAME_OPTIONS="DENY"
ENTRYPOINT ["bash","-lc","./setup.sh && ./scripts/test-all.sh"]
