# Snappy

Smart document scanning and OCR with AI-assisted form filling.

Capture or upload images and PDFs, clean them up on device (perspective correction, deskew, contrast), extract text with OCR, and auto-fill forms from your saved profile — all from a modern, installable PWA.

## Features

- **Scan from camera or upload** — capture documents directly from your camera or upload images/PDFs
- **On-device scan clean-up** — OpenCV.js perspective correction, deskew, illumination flattening, contrast, and upscaling before OCR runs
- **OCR text extraction** — server-side OCR via [RapidOCR](https://github.com/RapidAI/RapidOCR) (ONNX runtime) for images and PDFs (up to 15 pages, 25 MB); on-device Tesseract.js fallback
- **AI form filling** — optional LLM integration (OpenAI-compatible endpoints) for semantic field matching; deterministic keyword matching + date/format normalization otherwise
- **Editable field review** — drag, resize, relabel, or draw the detected field boxes before filling
- **User profiles** — store contact, employment, ID, and custom fields to reuse across forms
- **Scan history** — browse, search, filter, rename, and delete past scans with side-by-side original/filled comparison
- **Image tools** — cropping, zooming, and a fullscreen before/after viewer
- **PWA support** — installable, light/dark theme, offline-friendly shell

## Tech Stack

| Layer    | Technology |
| -------- | ---------- |
| Frontend | React 19, TypeScript, Vite 8, Tailwind CSS 4, Radix UI, self-hosted fonts, PDF.js, Tesseract.js, OpenCV.js |
| Backend  | Django 6, Django REST Framework, Token Auth |
| OCR      | RapidOCR (ONNX Runtime), PyMuPDF |
| Database | PostgreSQL (Render), SQLite for local dev |
| Deploy   | Vercel (frontend), Render (backend + DB) |

## Repository Layout

```
.
├── Frontend/          # React + Vite + TypeScript SPA
│   └── src/
│       ├── components/  # UI components (shadcn/ui-style)
│       ├── lib/         # API, OCR, LLM, form-fill, image utilities
│       └── pages/       # Home, Login, Signup, Profile
├── backend/           # Django REST API
│   ├── api/           # auth, OCR, profile, and scan endpoints
│   ├── config/        # Django project settings
│   └── manage.py
├── scripts/           # Utility scripts
├── render.yaml        # Render deployment config (backend + Postgres)
└── vercel.json        # Vercel deployment config (frontend)
```

## Getting Started

### Prerequisites

- Node.js 20+ and npm
- Python 3.12+ (pinned to 3.12.11 via `.python-version`)

### 1. Backend (Django API)

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate        # Windows (POSIX: source .venv/bin/activate)
pip install -r requirements.txt
cp .env.example .env          # then edit .env with your values
python manage.py migrate
python manage.py runserver
```

The API runs at `http://localhost:8000` with a health check at `/api/health/`.

### 2. Frontend (React SPA)

```bash
cd Frontend
npm install
npm run dev
```

The app runs at `http://localhost:5173` and expects the backend at `http://localhost:8000`. You can point it elsewhere from the OCR settings dialog inside the app.

### 3. Optional: LLM form filling

In the app's settings, configure an OpenAI-compatible LLM endpoint (base URL + API key) to enable AI form analysis and auto-fill. Without it, forms can still be filled manually.

## API Overview

| Method | Endpoint              | Description                      |
| ------ | --------------------- | -------------------------------- |
| GET    | `/api/health/`        | Health + database check          |
| POST   | `/api/auth/register/` | Create account (email + password)|
| POST   | `/api/auth/login/`    | Authenticate, returns token      |
| GET    | `/api/auth/me/`       | Current user                     |
| GET/PUT| `/api/profile/`       | View / update user profile       |
| GET/POST| `/api/scans/`        | List (with filters) / create scan|
| GET/PATCH/DELETE | `/api/scans/<id>/` | Scan detail / update / delete |
| POST   | `/api/ocr/`           | OCR an uploaded image or PDF      |

## Deployment

- **Frontend** — `vercel.json` builds `Frontend/` and deploys it to Vercel.
- **Backend + DB** — `render.yaml` deploys the Django API with a managed PostgreSQL database (free tier friendly).

## License

Private project.
