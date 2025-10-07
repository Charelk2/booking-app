# Push, Backup, and Deploy — Quick Reference

This is a practical, copy/paste checklist for day‑to‑day work (Git), history cleanup (backup/trim), and deploys (Fly & Vercel). Keep it in root for easy access.

-------------------------------------------------------------------------------
Git — Daily Flow
-------------------------------------------------------------------------------

- Stage + Commit + Push
  - git add . && git commit -m "Commit message describing the changes" && git push origin main

- Quick backup branch (remote snapshot of current HEAD)
  - git push origin HEAD:safe-001-message-inbox-sorted
  - Next backup, bump number: git push origin HEAD:safe-002-message-inbox-sorted

- Restore from backup (choose one)
  - New working branch from backup (safe, non-destructive):
    - git fetch origin && git checkout -b restore-from-safe origin/safe-001-message-inbox-sorted
  - Make local main match backup (no push yet):
    - git fetch origin && git checkout main && git reset --hard origin/safe-001-message-inbox-sorted
  - Replace remote main with backup (destructive on remote history):
    - git push --force --prune --no-tags -u origin origin/safe-001-message-inbox-sorted:main
  - Merge backup into main via PR (non-destructive):
    - Create a branch from backup (first bullet), push, then open PR to main

- Hard pull (reset local to remote main)
  - git fetch origin
  - git reset --hard origin/main

- Force push (use sparingly; requires branch permissions)
  - git push --force origin main

- Ignore heavy/cached paths going forward
  - printf "\nfrontend/.next/\nadmin/.next/\nbackend/app/static/attachments/\nbackend/app/static/cover_photos/\n*.har\n" >> .gitignore \
    && git add .gitignore && git commit -m "chore: ignore caches and large uploads" && git push origin main

Tips
- If main is protected, temporarily allow force push in GitHub Branch settings.
- Prefer SSH for faster pushes: git remote set-url origin git@github.com:<org>/<repo>.git

-------------------------------------------------------------------------------
Git — Diagnose Size & Rewrite History (Cleanup)
-------------------------------------------------------------------------------

Diagnose repository size
- Top-level sizes: du -sh .[!.]* * 2>/dev/null | sort -h | tail -n 20
- Largest blobs in history:
  git rev-list --objects --all \
  | git cat-file --batch-check='%(objecttype) %(objectname) %(objectsize) %(rest)' \
  | awk '$1=="blob"{printf "%.2f MiB\t%s\n", $3/1024/1024, substr($0, index($0,$4))}' \
  | sort -nr | head -n 20
- Repo pack size: git count-objects -vH

Rewrite history (remove big paths)
- Requires git filter-repo (https://github.com/newren/git-filter-repo)
- One-liner for common heavy paths:
  git filter-repo --force --invert-paths \
    --path-glob 'frontend/.next/**' \
    --path-glob 'admin/.next/**' \
    --path 'booka.co.za.har' \
    --path-glob 'backend/app/static/attachments/**' \
    --path-glob 'backend/app/static/cover_photos/**'

- HAR variants (if needed):
  git filter-repo --force --invert-paths \
    --path-glob 'inbox.har' \
    --path-glob '**/inbox.har' \
    --path-glob '*.har'

Clean local objects
- git reflog expire --expire=now --all && git gc --prune=now --aggressive

Restore remote (git-filter-repo removes your origin on purpose)
- HTTPS: git remote add origin https://github.com/Charelk2/booking-app.git
- SSH:   git remote add origin git@github.com:Charelk2/booking-app.git
- Verify: git remote -v

Force push (lean, safe flags)
- git push --force --prune --no-tags -u origin main

-------------------------------------------------------------------------------
Local Run — Backend & Frontend
-------------------------------------------------------------------------------

Backend (bind to all interfaces for phone testing)
- python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

Frontend (bind to all interfaces)
- npm run dev -- -H 0.0.0.0

Local setup
- Backend deps: pip install -r requirements.txt
  - Optional (only if used): pip install -r flinkdink2/requirements.txt
- Ensure frontend env points at API: NEXT_PUBLIC_API_URL=http://localhost:8000
- Ensure WS uses dev scheme: NEXT_PUBLIC_WS_URL=ws://localhost:8000
- CORS in backend .env should include your LAN IP if testing on phone.

-------------------------------------------------------------------------------
Fly.io — Backend Deploy
-------------------------------------------------------------------------------

From repo root (booking-app)
- flyctl deploy -c fly.toml
- (alias) fly deploy

Secrets
- List: fly secrets list
- Set (examples):
  fly secrets set SECRET_KEY=... COOKIE_DOMAIN=.booka.co.za FRONTEND_URL=https://booka.co.za \
    REDIS_URL='redis://default:...@...:6379/0' WEBSOCKET_REDIS_URL='redis://default:...@...:6379/0'

Notes
- Keep DB/volumes configured in fly.toml and use mounts for persistence.
- Ensure health checks pass after deploy (fly status / logs).

-------------------------------------------------------------------------------
Fly.io — Admin Console Deploy
-------------------------------------------------------------------------------

From the admin console folder
- cd admin
- npm ci  # or npm i
- npm run build
- fly deploy  # or: flyctl deploy -c fly.toml

Environment
- Set VITE_API_URL to your API base, e.g., https://api.booka.co.za (Fly or platform env vars)
- Admin tokens are set in the browser; ensure API allows CORS/headers for admin endpoints

-------------------------------------------------------------------------------
Vercel — Admin Console Deploy (Vite + React-Admin)
-------------------------------------------------------------------------------

Option A — Deploy from GitHub (recommended)
- Create a separate repo for the admin folder or configure Vercel to use the `admin/` subdirectory
- Vercel project settings → Framework Preset: Vite
- Root Directory: admin
- Build & Output Settings:
  - Install Command: npm ci
  - Build Command: npm run build
  - Output Directory: dist
- Environment Variables:
  - VITE_API_URL=https://api.booka.co.za
- Push to main; Vercel builds and deploys automatically. Preview env inherits settings for PRs.

Option B — Vercel CLI
- cd admin
- vercel link  # link to your Vercel project
- vercel env add VITE_API_URL production  # set API base for prod
- vercel --prod

Notes
- Ensure CORS on API allows admin origin and Authorization header for admin JWTs
- If you need to embed a path base (e.g., /admin), configure router rules accordingly on Vercel

-------------------------------------------------------------------------------
Vercel — Frontend Deploy (Next.js)
-------------------------------------------------------------------------------

Connect repo
- Import project from GitHub. Framework: Next.js (auto-detected).

Environment Variables
- NEXT_PUBLIC_API_URL=https://api.booka.co.za
- NEXT_PUBLIC_WS_URL=wss://api.booka.co.za
- NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=<your-browser-key>
- (Optional) NEXT_PUBLIC_MEDIA_HOSTS=media.booka.co.za

Build
- Default is fine: Install: npm i; Build: npm run build; Output: .next
- Trigger a production build via Git push to main (or ‘Redeploy’ in dashboard).

CLI (optional)
- vercel env add
- vercel --prod

Notes
- For preview branches, set the same NEXT_PUBLIC_* vars in the Preview environment scope.
- Realtime must use wss:// in production; do not use https:// in NEXT_PUBLIC_WS_URL.

-------------------------------------------------------------------------------
Appendix — Quick Commands
-------------------------------------------------------------------------------

- Standard push: git add . && git commit -m "Message" && git push origin main
- Hard pull: git fetch origin && git reset --hard origin/main
- Force push: git push --force --prune --no-tags -u origin main
- Backend run: python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
- Frontend run: npm run dev -- -H 0.0.0.0
- Fly secrets: fly secrets list
