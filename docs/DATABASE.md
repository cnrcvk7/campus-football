# Database Design — Campus Football

> **Status:** `users`, `players`, `academies`, `teams`, `player_academy_memberships`, `player_team_memberships`, `skills`, `assessments`, `assessment_items`, `development_goals`, `physical_measurements`, `exercises`, `training_sessions`, `training_session_exercises`, `training_attendance`, `matches`, `match_player_stats` are implemented. All other tables are conceptual design.

## Design Principles

- The `Player` table is the root entity — all domain tables reference it.
- History is never deleted. Membership tables use `left_at` nullable timestamps.
- Assessment records are immutable append-only rows.
- Aggregates (team averages) are computed at query time, not stored.
- UUIDs are used as primary keys for all public-facing entities to allow future cross-system identity.
- Role is stored server-side in `users`. It is never accepted from the client.

---

## Entity Overview

```
User (optional) ──── Player ─── PlayerAcademyMembership ─── Academy
   │                                                  │
   │                                               Team
   │                                                  │
   └─────────────── PlayerTeamMembership ────────────┘
   │
   ├─── Assessment (many, append-only)
   ├─── DevelopmentGoal (many)
   ├─── TrainingAttendance (many, via TrainingSession)
   ├─── MatchStatistic (many, via Match)
   └─── PhysicalMeasurement (many)
```

---

## Core Tables (Planned)

### `users` ✅ Implemented — `apps/users/migrations/0001_initial.py`

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | `uuid4`, immutable |
| email | VARCHAR UNIQUE | Login identifier (USERNAME_FIELD) |
| password | VARCHAR | Hashed by Django |
| first_name | VARCHAR(100) | Required |
| last_name | VARCHAR(100) | Required |
| role | VARCHAR(20) | `PLAYER` / `PARENT` / `COACH` / `ACADEMY_ADMIN` |
| is_active | BOOLEAN | Default true |
| is_staff | BOOLEAN | Django admin access |
| is_superuser | BOOLEAN | Django superuser |
| created_at | TIMESTAMPTZ | Auto-set on insert |
| updated_at | TIMESTAMPTZ | Auto-updated on every save |
| last_login | TIMESTAMPTZ | Django-managed |

### `players` ✅ Implemented — `apps/players/migrations/0001_initial.py`

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | `uuid4`, system-generated, immutable |
| football_id | VARCHAR(12) UNIQUE | Format `CF-XXXXXXXX`; auto-generated on first save, immutable |
| first_name | VARCHAR(100) | Required |
| last_name | VARCHAR(100) | Required |
| date_of_birth | DATE | Required; must be in the past, ≤ 100 years ago |
| gender | VARCHAR(1) | Choices: M / F / O / P |
| preferred_position | VARCHAR(3) | Choices: GK / CB / LB / RB / LWB / RWB / CDM / CM / CAM / LM / RM / LW / RW / ST / CF; optional |
| jersey_number | SMALLINT | Optional; 1–99 |
| profile_photo_url | VARCHAR | URL string; optional |
| user_id | UUID FK → users | Nullable; `ON DELETE SET NULL`; `related_name="player_profile"` |
| created_at | TIMESTAMPTZ | Auto-set on insert |
| updated_at | TIMESTAMPTZ | Auto-updated on every save |

**Indexes:** `players_football_id` (unique), `players_pkey` (UUID PK)

### `academies` ✅ Implemented — `apps/academies/migrations/0001_initial.py`

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | `uuid4`, immutable |
| name | VARCHAR(200) UNIQUE | Required |
| description | TEXT | Optional |
| city | VARCHAR(100) | Optional |
| country | VARCHAR(100) | Optional |
| logo_url | VARCHAR | URL string, optional |
| created_at | TIMESTAMPTZ | Auto |
| updated_at | TIMESTAMPTZ | Auto |

### `teams` ✅ Implemented — `apps/teams/migrations/0001_initial.py`

> **Important:** `Player` does NOT have a `team_id` column. The relationship is held entirely in `player_team_memberships`.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | `uuid4`, immutable |
| academy_id | UUID FK → academies | `ON DELETE PROTECT` |
| name | VARCHAR(200) | Required |
| age_group | VARCHAR(20) | Optional, e.g. "U12", "U15" |
| gender | VARCHAR(1) | M / F / X (mixed); optional |
| season | VARCHAR(20) | Optional, e.g. "2024/25" |
| created_at | TIMESTAMPTZ | Auto |
| updated_at | TIMESTAMPTZ | Auto |

### `player_academy_memberships` ✅ Implemented — `apps/academies/migrations/0001_initial.py`

> **Design rule:** Records are never deleted. A player leaving an academy sets `left_at` and `status = "left"`. The full history is always preserved.
>
> **Important:** `Player` does NOT have an `academy_id` column. Academy affiliation is held entirely in this table.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| player_id | UUID FK → players | `ON DELETE PROTECT` |
| academy_id | UUID FK → academies | `ON DELETE PROTECT` |
| joined_at | DATE | Required |
| left_at | DATE | Nullable — null means currently active |
| status | VARCHAR(10) | `active` / `left` |
| created_at | TIMESTAMPTZ | Auto |

### `player_team_memberships` ✅ Implemented — `apps/teams/migrations/0001_initial.py`

> **Design rule:** Same as academy memberships — records are never deleted.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| player_id | UUID FK → players | `ON DELETE PROTECT` |
| team_id | UUID FK → teams | `ON DELETE PROTECT` |
| joined_at | DATE | Required |
| left_at | DATE | Nullable — null means currently active |
| status | VARCHAR(10) | `active` / `left` |
| created_at | TIMESTAMPTZ | Auto |

### `skills` ✅ Implemented — `apps/development/migrations/0001_initial.py`

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | `uuid4`, immutable |
| name | VARCHAR(100) UNIQUE | Required |
| category | VARCHAR(20) | `TECHNICAL` / `TACTICAL` / `PHYSICAL` / `MENTAL` |
| description | TEXT | Optional |
| is_active | BOOLEAN | Default true |
| created_at | TIMESTAMPTZ | Auto |
| updated_at | TIMESTAMPTZ | Auto |

Seeded via `python manage.py seed_skills` (24 initial skills, idempotent).

### `assessments` ✅ Implemented — `apps/development/migrations/0001_initial.py`

> **Design rule:** Assessments are immutable append-only records. No UPDATE is ever issued on this table.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| player_id | UUID FK → players | `ON DELETE PROTECT` |
| coach_id | UUID FK → users | `ON DELETE PROTECT` |
| assessment_date | DATE | Required |
| overall_comment | TEXT | Optional |
| created_at | TIMESTAMPTZ | Auto |

### `assessment_items` ✅ Implemented — `apps/development/migrations/0001_initial.py`

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| assessment_id | UUID FK → assessments | `ON DELETE CASCADE` |
| skill_id | UUID FK → skills | `ON DELETE PROTECT` |
| score | SMALLINT | 0–100 |
| comment | TEXT | Optional |

**Constraint:** `UNIQUE(assessment_id, skill_id)` — a skill cannot appear twice in one assessment.

### `development_goals` ✅ Implemented — `apps/development/migrations/0001_initial.py`

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| player_id | UUID FK → players | `ON DELETE PROTECT` |
| skill_id | UUID FK → skills | Nullable; `ON DELETE SET NULL` |
| title | VARCHAR(200) | Required |
| description | TEXT | Optional |
| target_value | DECIMAL(6,2) | Nullable; ≥ 0 |
| current_value | DECIMAL(6,2) | Nullable; ≥ 0 |
| status | VARCHAR(20) | `ACTIVE` / `COMPLETED` / `CANCELLED` |
| start_date | DATE | Required |
| target_date | DATE | Nullable; must be ≥ start_date |
| completed_at | TIMESTAMPTZ | Nullable |
| created_by_id | UUID FK → users | `ON DELETE PROTECT` |
| created_at | TIMESTAMPTZ | Auto |
| updated_at | TIMESTAMPTZ | Auto |

### `exercises` ✅ Implemented — `apps/training/migrations/0001_initial.py`

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | `uuid4`, immutable |
| name | VARCHAR(200) | Required |
| description | TEXT | Optional |
| category | VARCHAR(20) | `TECHNICAL` / `TACTICAL` / `PHYSICAL` / `MENTAL` |
| duration_minutes | SMALLINT | Nullable |
| created_by_id | UUID FK → users | `ON DELETE PROTECT` |
| is_active | BOOLEAN | Default true |
| created_at | TIMESTAMPTZ | Auto |
| updated_at | TIMESTAMPTZ | Auto |

### `training_sessions` ✅ Implemented — `apps/training/migrations/0001_initial.py`

> **Design rule:** Training sessions record focus skills via M2M — this never automatically modifies assessment scores. Training and assessment are independent systems.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | `uuid4`, immutable |
| academy_id | UUID FK → academies | `ON DELETE PROTECT` |
| team_id | UUID FK → teams | Nullable; `ON DELETE PROTECT` |
| title | VARCHAR(200) | Required |
| description | TEXT | Optional |
| training_date | DATE | Required |
| start_time | TIME | Nullable |
| duration_minutes | SMALLINT | Nullable |
| location | VARCHAR(200) | Optional |
| coach_id | UUID FK → users | `ON DELETE PROTECT` |
| created_at | TIMESTAMPTZ | Auto |
| updated_at | TIMESTAMPTZ | Auto |

### `training_session_focus_skills` (M2M join table) ✅ Implemented

Auto-created Django M2M join table between `training_sessions` and `skills`.

### `training_session_exercises` ✅ Implemented — `apps/training/migrations/0001_initial.py`

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| session_id | UUID FK → training_sessions | `ON DELETE CASCADE` |
| exercise_id | UUID FK → exercises | `ON DELETE PROTECT` |
| order | SMALLINT | ≥ 1; display order within session |
| duration_minutes | SMALLINT | Nullable; overrides exercise default |
| notes | TEXT | Optional |

### `training_attendance` ✅ Implemented — `apps/training/migrations/0001_initial.py`

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| session_id | UUID FK → training_sessions | `ON DELETE CASCADE` |
| player_id | UUID FK → players | `ON DELETE PROTECT` |
| status | VARCHAR(10) | `PRESENT` / `ABSENT` / `LATE` / `EXCUSED` |
| notes | TEXT | Optional |
| recorded_at | TIMESTAMPTZ | Auto |

**Constraint:** `UNIQUE(session_id, player_id)` — one attendance record per player per session.

### `matches` ✅ Implemented — `apps/matches/migrations/0001_initial.py`

> **Design rule:** `result` is never stored. It is derived at read time from `team_score` and `opponent_score` via the `Match.result` property (WIN / DRAW / LOSS / None).

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | `uuid4`, immutable |
| academy_id | UUID FK → academies | `ON DELETE PROTECT` |
| team_id | UUID FK → teams | `ON DELETE PROTECT` |
| opponent_name | VARCHAR(200) | Required |
| match_date | DATE | Required |
| venue | VARCHAR(200) | Optional |
| competition | VARCHAR(200) | Optional |
| home_away | VARCHAR(4) | `HOME` / `AWAY` |
| team_score | SMALLINT | Nullable — not set until after the match |
| opponent_score | SMALLINT | Nullable — not set until after the match |
| notes | TEXT | Optional |
| created_by_id | UUID FK → users | `ON DELETE PROTECT` |
| created_at | TIMESTAMPTZ | Auto |
| updated_at | TIMESTAMPTZ | Auto |

### `match_player_stats` ✅ Implemented — `apps/matches/migrations/0001_initial.py`

> **Design rule:** Match statistics never automatically create or modify `Assessment`/`AssessmentItem` rows. Match performance and development assessments are independent systems.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| match_id | UUID FK → matches | `ON DELETE CASCADE` |
| player_id | UUID FK → players | `ON DELETE PROTECT` |
| started | BOOLEAN | Default false |
| minutes_played | SMALLINT | Default 0; ≥ 0 |
| goals | SMALLINT | Default 0 |
| assists | SMALLINT | Default 0 |
| shots | SMALLINT | Default 0 |
| shots_on_target | SMALLINT | Default 0 |
| passes_attempted | SMALLINT | Default 0 |
| passes_completed | SMALLINT | Default 0 |
| key_passes | SMALLINT | Default 0 |
| dribbles | SMALLINT | Default 0 |
| tackles | SMALLINT | Default 0 |
| interceptions | SMALLINT | Default 0 |
| yellow_cards | SMALLINT | Default 0 |
| red_cards | SMALLINT | Default 0 |
| rating | DECIMAL(4,2) | Nullable; 0–10 |
| coach_comment | TEXT | Optional |
| created_at | TIMESTAMPTZ | Auto |
| updated_at | TIMESTAMPTZ | Auto |

**Constraint:** `UNIQUE(match_id, player_id)` — one stats record per player per match.

### `physical_measurements` ✅ Implemented — `apps/development/migrations/0001_initial.py`

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| player_id | UUID FK → players | `ON DELETE PROTECT` |
| measurement_date | DATE | Required |
| height_cm | DECIMAL(5,2) | Nullable; ≥ 0 |
| weight_kg | DECIMAL(5,2) | Nullable; ≥ 0 |
| body_fat_percentage | DECIMAL(5,2) | Nullable; ≥ 0 |
| sprint_time_seconds | DECIMAL(5,2) | Nullable; ≥ 0 |
| notes | TEXT | Optional |
| created_at | TIMESTAMPTZ | Auto |

---

## Indexes (Planned)

- `players.football_id` — unique index
- `player_academy_memberships(player_id, left_at)` — active membership lookup
- `player_team_memberships(player_id, left_at)` — active team lookup
- `assessments(player_id, assessed_at)` — development timeline queries
- `training_attendance(session_id, player_id)` — attendance lookup
