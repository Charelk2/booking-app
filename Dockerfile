FROM python:3.11-slim

# Install Node.js 20
RUN apt-get update && apt-get install -y curl gnupg && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Disable Next.js telemetry and Playwright downloads for offline CI
ENV NEXT_TELEMETRY_DISABLED=1 \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

WORKDIR /app

# Copy package manifests separately for caching
COPY backend/requirements.txt requirements-dev.txt ./
COPY frontend/package.json frontend/package-lock.json ./frontend/

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt && \
    pip install --no-cache-dir -r requirements-dev.txt

# Install Node dependencies
RUN cd frontend && npm ci --no-progress && npm cache clean --force

# Copy source code
COPY . .

# Install Playwright browsers once at build time. PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD
# is normally set to skip downloads in CI, so override it here.
RUN PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=0 npx playwright install --with-deps

EXPOSE 8000 3000

CMD ["bash"]
