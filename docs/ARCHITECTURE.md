# Architecture — Campus Football

## System Overview

```
┌─────────────────────────────────────────────────────────┐
│                        Browser                          │
│               React + TypeScript + Vite                 │
│                    (port 5173)                          │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTP / JSON (REST)
                       ▼
┌─────────────────────────────────────────────────────────┐
│                   Django Backend                        │
│           Django REST Framework (port 8000)             │
│                                                         │
│  config/          ← Django project (settings, urls)     │
│  apps/core/       ← Health-check, shared utilities      │
│  apps/users/      ← Authentication & role foundation ✅  │
│  apps/players/    ← Player identity & profiles ✅        │
│  apps/academies/  ← Academy management ✅                │
│  apps/teams/      ← Team management ✅                   │
│  apps/development/← Assessments, goals, physical data ✅ │
│  apps/training/   ← Training sessions & attendance ✅    │
│  apps/matches/    ← Match logs & player statistics ✅    │
└──────────────────────┬──────────────────────────────────┘
                       │ psycopg2
                       ▼
┌─────────────────────────────────────────────────────────┐
│                    PostgreSQL                           │
│                    (port 5432)                          │
└─────────────────────────────────────────────────────────┘
```

---

## Backend Structure

```
backend/
├── config/
│   ├── settings/
│   │   ├── base.py          # Shared settings
│   │   ├── development.py   # Dev overrides (DEBUG, CORS, etc.)
│   │   └── test.py          # SQLite in-memory (no Postgres needed for tests)
│   ├── urls.py              # Root URL configuration
│   ├── wsgi.py
│   └── asgi.py
├── apps/
│   ├── core/                # Health-check and shared code
│   │   ├── views.py
│   │   └── urls.py
│   ├── users/               # ✅ Auth & roles domain
│   │   ├── models.py        # Custom User (UUID PK, email auth, Role choices)
│   │   ├── managers.py      # UserManager (create_user / create_superuser)
│   │   ├── serializers.py   # MeSerializer (includes player_profile)
│   │   ├── permissions.py   # IsPlayer, IsCoach, IsParent, IsAcademyAdmin
│   │   ├── views.py         # MeView (GET /api/auth/me/)
│   │   ├── urls.py          # token, token/refresh, me
│   │   ├── admin.py         # UserAdmin
│   │   ├── tests.py         # 18 tests
│   │   └── migrations/
│   │       └── 0001_initial.py
│   ├── players/             # ✅ Player identity domain
│   │   ├── models.py        # Player model + Football ID generation + user FK
│   │   ├── serializers.py   # PlayerSerializer
│   │   ├── views.py         # PlayerViewSet (list/create/retrieve/patch/history)
│   │   ├── urls.py          # DefaultRouter → /api/players/
│   │   ├── admin.py         # PlayerAdmin
│   │   ├── tests.py         # 29 model + API tests (incl. history, memberships)
│   │   └── migrations/
│   │       ├── 0001_initial.py
│   │       └── 0002_player_user.py
│   ├── academies/           # ✅ Academy domain
│   │   ├── models.py        # Academy + PlayerAcademyMembership
│   │   ├── serializers.py   # AcademySerializer + membership serializers
│   │   ├── views.py         # AcademyViewSet
│   │   ├── urls.py          # DefaultRouter → /api/academies/
│   │   ├── admin.py         # AcademyAdmin + MembershipAdmin
│   │   ├── tests.py         # 9 tests
│   │   └── migrations/
│   │       └── 0001_initial.py
│   ├── teams/               # ✅ Team domain
│   │   ├── models.py        # Team + PlayerTeamMembership
│   │   ├── serializers.py   # TeamSerializer + membership serializers
│   │   ├── views.py         # TeamViewSet
│   │   ├── urls.py          # DefaultRouter → /api/teams/
│   │   ├── admin.py         # TeamAdmin + MembershipAdmin
│   │   ├── tests.py         # 10 tests
│   │   └── migrations/
│   │       └── 0001_initial.py
│   ├── development/         # ✅ Player Development System
│   │   ├── models.py        # Skill, Assessment, AssessmentItem, DevelopmentGoal, PhysicalMeasurement
│   │   ├── serializers.py   # Serializers for all 5 models (nested assessment creation)
│   │   ├── permissions.py   # get_player_and_check_access() — player-scoped access control
│   │   ├── views.py         # SkillViewSet, AssessmentViewSet, GoalViewSet, MeasurementViewSet, DevelopmentTimelineView
│   │   ├── urls.py          # /api/development/skills/ + player-nested endpoints
│   │   ├── admin.py         # Admin for all development models
│   │   ├── tests.py         # 46 tests
│   │   ├── migrations/
│   │   │   └── 0001_initial.py
│   │   └── management/commands/seed_skills.py  # seeds 24 skills, idempotent
│   └── training/            # ✅ Training System
│       ├── models.py        # Exercise, TrainingSession (M2M→Skill), TrainingSessionExercise, TrainingAttendance
│       ├── serializers.py   # Read/write serializer pairs; explicit M2M handling for focus_skills
│       ├── permissions.py   # require_coach_or_admin(), get_player_and_check_training_access()
│       ├── views.py         # ExerciseViewSet, TrainingSessionViewSet, SessionExerciseViewSet, AttendanceViewSet, PlayerTrainingHistoryView
│       ├── urls.py          # /api/training/sessions/, /api/training/exercises/, player-nested history
│       ├── admin.py         # Admin registrations with inlines
│       ├── tests.py         # 27 tests
│       └── migrations/
│           └── 0001_initial.py
│   └── matches/             # ✅ Match System
│       ├── models.py        # Match (result derived from scores), MatchPlayerStats
│       ├── serializers.py   # Read/write pairs; PlayerMatchHistorySerializer; PlayerMatchSummarySerializer
│       ├── permissions.py   # require_coach_or_admin(), get_player_and_check_match_access()
│       ├── views.py         # MatchViewSet, MatchPlayerStatsViewSet, PlayerMatchHistoryView, PlayerMatchSummaryView
│       ├── urls.py          # /api/matches/, nested player-stats, player-scoped history + summary
│       ├── admin.py         # MatchAdmin with MatchPlayerStatsInline
│       ├── tests.py         # 27 tests
│       └── migrations/
│           └── 0001_initial.py
├── manage.py
└── requirements.txt
```

### Adding a New Domain

Each new domain (players, academies, etc.) becomes its own Django app under `apps/`:

```bash
cd backend
python manage.py startapp <name> apps/<name>
```

Register the app in `config/settings/base.py` under `LOCAL_APPS`. Add its URL prefix in `config/urls.py`.

---

## Frontend Structure

```
frontend/
├── src/
│   ├── components/          # Reusable UI components (buttons, cards, etc.)
│   │   └── ui/              # Low-level primitives
│   ├── pages/               # Page-level route components
│   ├── hooks/               # Custom React hooks
│   ├── services/            # API client (axios/fetch wrappers per domain)
│   ├── types/               # Shared TypeScript interfaces
│   ├── App.tsx              # Router root
│   ├── main.tsx             # Entry point
│   └── index.css            # Tailwind directives + global styles
├── index.html
├── vite.config.ts
├── tailwind.config.js
└── tsconfig.json
```

### API Communication

- All API calls go through `src/services/`
- A base `apiClient` instance (using `fetch` or `axios`) is configured with `VITE_API_URL`
- Each domain gets its own service module (e.g., `playerService.ts`)

---

## Key Architectural Decisions

### Authentication
JWT-based auth via `djangorestframework-simplejwt`. All endpoints require authentication by default (`IsAuthenticated` in `DEFAULT_PERMISSION_CLASSES`). The health check overrides this with `@permission_classes([AllowAny])`. Role is stored server-side only — the API never accepts a role from the client.

### Development System
Assessments are **immutable append-only records** — no UPDATE on existing assessments. Each coach evaluation creates a new row. `AssessmentItem` is nested inside the assessment POST request (single atomic creation). A player's skill scores are derived from their most recent assessment — they are never stored as a denormalized field on the Player.

`get_player_and_check_access()` in `apps/development/permissions.py` is the single enforcement point for player-scoped development data. PLAYER role may only access their own linked player record; COACH and ACADEMY_ADMIN have full read/write access.

### Player-Centric Identity
The `Player` model is the root entity. All other models reference a player. `Player` has **no** `academy_id` or `team_id` columns — those relationships live entirely in the membership tables. `Player.user` is an optional `OneToOneField` to `User` (nullable) — a player account may or may not have a login.

### Membership Tables Over Direct FK ✅ Implemented
`PlayerAcademyMembership` (in `apps/academies`) and `PlayerTeamMembership` (in `apps/teams`) are the sole holders of player↔academy and player↔team relationships. Both use `joined_at` / `left_at` / `status` fields. Records are never deleted — leaving an academy/team sets `left_at` and `status = "left"`.

Example history:
```
Player → Academy A: 2023-09-01 to 2024-06-30 (status: left)
Player → Academy B: 2024-07-01 to present    (status: active)
```

### Cross-Domain Import Strategy
Membership models use Django string FKs (`"players.Player"`) so `apps/academies` and `apps/teams` have no Python-level import dependency on `apps/players`. The `players` app accesses membership data in the `history` view action via local imports inside the function, making the cross-domain boundary explicit.

### No Denormalized Aggregates
Team averages, progress summaries, and comparison metrics are computed by the API at query time. This avoids stale data and keeps the schema clean for the MVP. If performance requires it, caching can be added later.

### Assessments Are Immutable Records
A coach assessment creates a new record every time. There is no "update" of an existing assessment. The development timeline is built from the ordered history of assessment records.

### Training and Assessment Are Independent Systems
`TrainingSession.focus_skills` (M2M → `development.Skill`) records which skills a session targets for informational purposes only. Attending a training session **never** automatically creates or modifies an `Assessment` or `AssessmentItem` row. Skill score progression is tracked exclusively through explicit coach assessments.

### Match Statistics Are Independent of Assessments
`MatchPlayerStats` records in-game performance data only. Creating or updating match statistics **never** automatically creates or modifies `Assessment`/`AssessmentItem` rows. The three systems — training attendance, match statistics, and development assessments — are fully independent.

### Match Result Is Derived, Not Stored
`Match.result` (WIN / DRAW / LOSS) is a Python `@property` computed from `team_score` and `opponent_score`. It is never written to the database. This keeps the schema normalized and eliminates any risk of stale calculated fields.

### Settings Split (base / development)
Django settings are split so that environment-specific configuration (DEBUG, CORS, email backend, logging) does not pollute shared config. The `DJANGO_SETTINGS_MODULE` environment variable selects the active settings module.

---

## Infrastructure

Docker Compose orchestrates three services for local development:

| Service | Image | Purpose |
|---|---|---|
| `db` | postgres:16-alpine | PostgreSQL database |
| `backend` | custom (Python 3.11) | Django development server |
| `frontend` | custom (Node 20) | Vite dev server with HMR |

Environment variables are injected via `.env` (not committed — copy from `.env.example`).
