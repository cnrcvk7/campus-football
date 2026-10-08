# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Campus Football — a player-centered football development platform. The **Player** is the root domain entity (not the academy). Every player carries a permanent, immutable Football ID. All history (memberships, assessments, training, matches) is append-only and never deleted.

## Commands

### Backend (Django)

```bash
cd backend
source .venv/bin/activate          # Windows: .venv\Scripts\activate
python manage.py runserver          # dev server on :8000
python manage.py migrate            # apply migrations
python manage.py makemigrations     # generate migrations
python manage.py test --settings=config.settings.test               # run all tests (SQLite, no Postgres needed)
python manage.py test apps.players --settings=config.settings.test  # run tests for a single app
python manage.py check              # Django system check
```

`DJANGO_SETTINGS_MODULE` defaults to `config.settings.development`. Set it explicitly to override.

### Frontend (React)

```bash
cd frontend
npm run dev     # Vite dev server on :5173
npm run build   # TypeScript check + production build
npm run lint    # TypeScript type-check (tsc --noEmit)
```

### Docker (full stack)

```bash
cp .env.example .env        # first time only
docker compose up --build   # starts db + backend + frontend
docker compose down         # stop
docker compose logs backend # view logs for a specific service
```

## Architecture

### Backend layout

```
backend/
├── config/
│   ├── settings/base.py        # shared settings (DB, DRF, installed apps)
│   ├── settings/development.py # DEBUG, CORS for local dev
│   ├── urls.py                 # root URL router — one include per app
│   ├── wsgi.py
│   └── asgi.py
├── apps/
│   ├── core/                   # health-check; shared base classes go here
│   │   ├── views.py
│   │   └── urls.py
│   ├── users/                  # auth domain — User model, JWT endpoints, roles
│   │   ├── models.py            # User (AbstractBaseUser + PermissionsMixin), UserManager
│   │   ├── permissions.py       # IsPlayer, IsCoach, IsParent, IsAcademyAdmin
│   │   ├── serializers.py       # MeSerializer
│   │   ├── views.py             # MeView (GET /api/auth/me/)
│   │   └── urls.py              # /api/auth/token/, /api/auth/token/refresh/, /api/auth/me/
│   ├── players/                # root domain entity
│   │   ├── models.py            # Player (UUID PK, permanent football_id CF-XXXXXXXX, nullable user FK)
│   │   ├── serializers.py       # PlayerSerializer, PlayerHistorySerializer
│   │   ├── views.py             # PlayerViewSet + PlayerHistoryView
│   │   └── urls.py              # /api/players/ + /api/players/<id>/history/
│   ├── academies/              # Academy model — players/teams belong to an academy
│   │   ├── models.py            # Academy, AcademyMembership (player↔academy with joined_at/left_at)
│   │   └── urls.py              # /api/academies/
│   ├── teams/                  # Team model — teams belong to an academy
│   │   ├── models.py            # Team, TeamMembership (player↔team with joined_at/left_at)
│   │   └── urls.py              # /api/teams/
│   ├── development/            # player development — skills, assessments, goals, measurements
│   │   ├── models.py            # Skill, Assessment, AssessmentItem, DevelopmentGoal, PhysicalMeasurement
│   │   ├── permissions.py       # get_player_and_check_access() — player-scoped access guard
│   │   ├── serializers.py       # AssessmentCreateSerializer (nested items), others
│   │   ├── views.py             # SkillViewSet, AssessmentViewSet, GoalViewSet, MeasurementViewSet, DevelopmentTimelineView
│   │   ├── urls.py              # /api/development/skills/ + player-nested endpoints
│   │   └── management/commands/seed_skills.py  # python manage.py seed_skills
│   ├── training/               # training sessions, exercises, attendance
│   │   ├── models.py            # Exercise, TrainingSession, TrainingSessionExercise, TrainingAttendance
│   │   ├── permissions.py       # get_player_and_check_training_access()
│   │   ├── views.py             # ExerciseViewSet, TrainingSessionViewSet, AttendanceViewSet, PlayerTrainingHistoryView
│   │   └── urls.py              # /api/training/ + /api/players/<id>/training/history/
│   └── matches/                # match records and per-player stats
│       ├── models.py            # Match (result/@property from scores), MatchPlayerStats (rating 0-10 DecimalField)
│       ├── permissions.py       # require_coach_or_admin(), get_player_and_check_match_access()
│       ├── serializers.py       # read/write pairs; PlayerMatchHistorySerializer, PlayerMatchSummarySerializer
│       ├── views.py             # MatchViewSet, MatchPlayerStatsViewSet, PlayerMatchHistoryView, PlayerMatchSummaryView
│       └── urls.py              # /api/matches/ + nested /players/ + /api/players/<id>/matches/
└── manage.py                   # loads .env from project root automatically
```

**Adding a new domain app:**
1. `python manage.py startapp <name> apps/<name>`
2. Add `"apps.<name>"` to `LOCAL_APPS` in `config/settings/base.py`
3. Add `path("api/<name>/", include("apps.<name>.urls"))` in `config/urls.py`

### Frontend layout

```
frontend/src/
├── components/ui/   # stateless, reusable primitives (AppNav, StatCard, LoadingSpinner, EmptyState)
├── constants/       # football.ts — POSITIONS record mapping code→label
├── context/         # AuthContext.tsx — isAuthenticated, login(), logout()
├── hooks/           # usePlayerProfile.ts — parallel-fetches all 6 player endpoints via Promise.all
├── pages/           # one component per route
├── services/        # api.ts (native fetch wrapper), playerService.ts
└── types/           # index.ts — all shared TypeScript interfaces
```

**Frontend API client** (`src/services/api.ts`): native `fetch` wrapper, no axios. JWT access token stored in `localStorage` under key `cf_access_token` (refresh: `cf_refresh_token`). `ApiError` carries `.status` for 401 detection. All requests proxy through Vite to `http://localhost:8000` in dev.

**Auth flow**: `AuthContext` initialises `isAuthenticated` from `!!getToken()`. `ProtectedRoute` redirects to `/login` with `state.from` so the login page can navigate back after success. `AppNav` branches on `isAuthenticated` to show "Sign in" vs "Players + Sign out".

### Key architectural rules

- **Player is the root entity.** All other models FK back to `Player`.
- **Membership tables** (player↔academy, player↔team) use `joined_at` / `left_at` to preserve history. Never delete memberships.
- **Assessments are immutable.** Always INSERT a new row — no UPDATE on existing assessments.
- **Training attendance does not change skill scores.** These are separate systems.
- **Team averages are computed at query time**, not stored as DB fields.
- **All API endpoints require JWT auth** (`IsAuthenticated` is the global DRF default). The health check uses `@permission_classes([AllowAny])` to opt out. JWT is obtained via `POST /api/auth/token/`.
- **Role is server-side only.** `User.role` is set on creation and never accepted from a client request body. Use the role-based permission classes in `apps/users/permissions.py` (`IsPlayer`, `IsCoach`, `IsParent`, `IsAcademyAdmin`) to guard views.
- **Player↔User link is optional.** `Player.user` is a nullable `OneToOneField`. A player may exist without a login account.
- **Cross-domain imports:** Use Django string FKs (`"players.Player"`, `"academies.Academy"`, `"teams.Team"`, `"development.Skill"`) in model definitions to avoid circular Python imports. Direct Python imports are only used in serializers/views where the dependency direction is clear. When a view in `apps/players` needs cross-domain models, use a local import inside the function.
- **Training and assessment are independent.** `TrainingSession.focus_skills` (M2M) is informational only — it never auto-creates or modifies `Assessment`/`AssessmentItem` rows.
- **Match statistics and assessment are independent.** `MatchPlayerStats` records in-game performance only — it never auto-creates or modifies `Assessment`/`AssessmentItem` rows.
- **Match result is derived, not stored.** `Match.result` is a `@property` computed from `team_score` and `opponent_score`. Never add a `result` column to the `matches` table.

### Environment variables

The backend reads env vars from the `.env` file in the project root (loaded by `manage.py` via `python-dotenv`) and from Docker Compose injection. See `.env.example` for all required variables.

## Docs

- `docs/PRODUCT_SPEC.md` — full feature list and out-of-scope items
- `docs/ARCHITECTURE.md` — system diagram, backend/frontend structure, key decisions
- `docs/DATABASE.md` — planned table schemas and indexes
- `docs/API.md` — endpoint design (planned + implemented)
- `docs/USER_FLOWS.md` — business rules and user journeys
