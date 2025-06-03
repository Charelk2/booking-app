# Booking App

This repository contains a FastAPI backend and a Next.js frontend.

## Backend

Run the API from the `backend` directory so Python can find the `app` package:

```bash
cd backend
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Install dependencies using `pip install -r requirements.txt` first if needed.

## Frontend

The frontend is in `frontend/`. After installing dependencies with `npm install`, start it with:

```bash
npm run dev
```

The frontend expects the backend to be running on `http://localhost:8000`.
