Deployment guide for booka.co.za (Vercel + Render)

Overview
- Frontend (Next.js) on Vercel at https://booka.co.za
- Backend (FastAPI) on Render at https://api.booka.co.za
- GoDaddy provides DNS for both.

1) Backend on Render
- Repo: connect this GitHub repo in Render > New > Web Service.
- Root directory: repo root (Render will run commands from the root).
- Build command:
  pip install --upgrade pip && pip install -r backend/requirements.txt
- Start command:
  uvicorn app.main:app --host 0.0.0.0 --port $PORT --app-dir backend
- Health check path: /healthz (added to FastAPI in backend/app/main.py)
- Environment variables (Settings > Environment):
  - SQLALCHEMY_DATABASE_URL=postgresql+psycopg://USER:PASSWORD@HOST:5432/DB
  - REDIS_URL=redis://:PASSWORD@HOST:6379/0 (optional but recommended)
  - SECRET_KEY=generate a long random string
  - FRONTEND_URL=https://booka.co.za
  - CORS_ORIGINS=["https://booka.co.za","https://www.booka.co.za"]
  - Any OAuth/SMTP keys as needed
- After deploy, copy the Render service URL (e.g., https://booka-backend.onrender.com).

Custom domain for API
- In Render: Settings > Custom Domains > add api.booka.co.za.
- Render will show a target hostname. In GoDaddy DNS add:
  - CNAME  api  -> render-provided-target.example.com
- Wait for SSL to be ready; final API base: https://api.booka.co.za
 - For cross‑subdomain sessions, set COOKIE_DOMAIN=.booka.co.za in backend env (see below).

2) Frontend on Vercel
- In Vercel, create a new project and set the Root Directory to frontend/.
- Framework preset: Next.js. Default build is fine (next build / next start).
- Environment variables (Project Settings > Env Vars):
  - NEXT_PUBLIC_API_URL=https://api.booka.co.za
  - NEXT_PUBLIC_WS_URL=wss://api.booka.co.za (optional; otherwise derived)
  - NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your key
  - NEXT_PUBLIC_VIRTUALIZE_CHAT=1 (enable virtualized chat rendering with react-virtuoso)
  - Any other NEXT_PUBLIC_* as needed

Auth cookies across subdomains
- In the backend environment (Render), set COOKIE_DOMAIN=.booka.co.za so HttpOnly access/refresh cookies work on both booka.co.za and api.booka.co.za. This prevents 401 “Authentication required” errors when some requests go direct to the API origin while others proxy through the Next.js site.

Custom domain for frontend
- In Vercel: Settings > Domains > Add booka.co.za
- In GoDaddy DNS add:
  - A     @     76.76.21.21
  - CNAME www   cname.vercel-dns.com
- Vercel will validate and issue certificates.

3) GoDaddy DNS recap
- A @      -> 76.76.21.21 (Vercel)
- CNAME www -> cname.vercel-dns.com (Vercel)
- CNAME api -> <render target> (Render)

4) Local configuration parity
- See frontend/.env.production.example and backend/.env.production.example for the variables to set in each host.
- For local testing against Render, you can set NEXT_PUBLIC_API_URL to your Render URL.

5) Post-deploy checks
- Open https://api.booka.co.za/healthz (should return {"status":"ok", ...}).
- Open the Vercel site https://booka.co.za and perform a booking flow.
- Verify WebSocket notifications in the browser console (should connect to wss://api.booka.co.za/api/v1/ws/notifications?...).

Notes
- The repo ships with a CI-focused Dockerfile. For runtime containers on your own VPS, prefer a compose stack with a reverse proxy (e.g., Caddy) and separate services for frontend, backend, Postgres, and Redis.
