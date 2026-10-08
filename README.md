# Campus Football

A player-centered football development platform. The **Player** is the central entity — not the academy. Players carry a permanent Football ID and accumulate their full development history across academies, teams, coaches, and seasons.

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python, Django, Django REST Framework |
| Database | PostgreSQL |
| Frontend | React, TypeScript, Vite, Tailwind CSS |
| Infrastructure | Docker, Docker Compose |

## Quick Start

### Prerequisites

- Docker and Docker Compose
- (For local dev without Docker) Python 3.11+, Node.js 20+

### With Docker

```bash
cp .env.example .env
docker compose up --build
```

| Service | URL |
|---|---|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:8000/api/ |
| Health Check | http://localhost:8000/api/health/ |

### Without Docker (local development)

**Backend:**
```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp ../.env.example ../.env       # adjust DB settings for local Postgres
python manage.py migrate
python manage.py runserver
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

## Project Structure

```
campus-football/
├── backend/                  # Django application
│   ├── config/               # Django project settings & URL routing
│   ├── apps/                 # Domain applications (one app per domain)
│   │   └── core/             # Health-check and shared utilities
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/                 # React application
│   ├── src/
│   │   ├── components/       # Reusable UI components
│   │   ├── pages/            # Page-level components
│   │   ├── hooks/            # Custom React hooks
│   │   ├── services/         # API client layer
│   │   └── types/            # TypeScript interfaces
│   └── Dockerfile
├── docs/                     # Product & technical documentation
├── .env.example              # Environment variable template
└── docker-compose.yml
```

## Documentation

- [Product Spec](docs/PRODUCT_SPEC.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Database Design](docs/DATABASE.md)
- [API Reference](docs/API.md)
- [User Flows](docs/USER_FLOWS.md)
