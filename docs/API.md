# API Reference — Campus Football

> **Status:** Health check, Auth, Players, Academies, Teams, Membership, Development, Training, and Match endpoints are implemented. All others are design only.

## Conventions

- Base URL: `/api/`
- All responses are JSON.
- Timestamps are ISO 8601 (UTC).
- Pagination uses `?page=N&page_size=N` query params.
- Error responses follow the shape: `{ "error": "message" }` or `{ "field": ["error"] }` for validation.
- All endpoints require a valid JWT `Authorization: Bearer <token>` header unless noted as public.

---

## Authentication ✅ Implemented

### `POST /api/auth/token/`

Obtain access and refresh tokens. Public endpoint.

**Request:**
```json
{ "email": "user@example.com", "password": "yourpassword" }
```

**Response 200:**
```json
{ "access": "<jwt>", "refresh": "<jwt>" }
```

**Response 401:** Invalid credentials.

---

### `POST /api/auth/token/refresh/`

Exchange a refresh token for a new access token. Public endpoint.

**Request:**
```json
{ "refresh": "<refresh_jwt>" }
```

**Response 200:**
```json
{ "access": "<new_jwt>" }
```

---

### `GET /api/auth/me/`

Returns the currently authenticated user's profile. Requires auth.

**Response 200:**
```json
{
  "id": "550e8400-...",
  "email": "user@example.com",
  "first_name": "Marcus",
  "last_name": "Rashford",
  "role": "PLAYER",
  "is_active": true,
  "player_profile": {
    "player_id": "660e...",
    "football_id": "CF-A3B7XZ92",
    "first_name": "Marcus",
    "last_name": "Rashford"
  },
  "created_at": "2026-01-01T00:00:00Z"
}
```

`player_profile` is `null` if the user is not linked to a `Player` record.

**Role values:** `PLAYER` | `PARENT` | `COACH` | `ACADEMY_ADMIN`

---

## Health

### `GET /api/health/`

Returns service status. No authentication required.

**Response 200:**
```json
{
  "status": "ok",
  "service": "campus-football-api"
}
```

---

## Players ✅ Implemented

Base URL: `/api/players/`

Player `{id}` is the UUID primary key.

`football_id` is always read-only — it cannot be set or changed via the API.

---

### `GET /api/players/`

List all players ordered by creation date descending.

**Response 200:**
```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "football_id": "CF-A3B7XZ92",
    "first_name": "Marcus",
    "last_name": "Rashford",
    "date_of_birth": "2000-10-31",
    "gender": "M",
    "preferred_position": "LW",
    "jersey_number": 10,
    "profile_photo_url": "",
    "created_at": "2026-10-08T12:00:00Z",
    "updated_at": "2026-10-08T12:00:00Z"
  }
]
```

---

### `POST /api/players/`

Register a new player. `football_id` is generated automatically.

**Required fields:** `first_name`, `last_name`, `date_of_birth`, `gender`

**Optional fields:** `preferred_position`, `jersey_number` (1–99), `profile_photo_url`

**Request body:**
```json
{
  "first_name": "Phil",
  "last_name": "Foden",
  "date_of_birth": "2000-05-28",
  "gender": "M",
  "preferred_position": "CAM",
  "jersey_number": 47
}
```

**Response 201:** Full player object (same shape as list item above).

**Response 400:** Validation error, e.g.:
```json
{ "date_of_birth": ["Date of birth must be in the past."] }
```

---

### `GET /api/players/{id}/`

Retrieve a single player by UUID.

**Response 200:** Full player object.
**Response 404:** Player not found.

---

### `PATCH /api/players/{id}/`

Partially update a player. Only supplied fields are changed. `football_id`, `id`, `created_at`, and `updated_at` are always ignored even if sent.

**Request body (example — any subset of writable fields):**
```json
{ "jersey_number": 10 }
```

**Response 200:** Updated full player object.

---

### Gender choices

| Value | Label |
|---|---|
| `M` | Male |
| `F` | Female |
| `O` | Other |
| `P` | Prefer not to say |

---

### Position choices

| Value | Label |
|---|---|
| `GK` | Goalkeeper |
| `CB` | Centre Back |
| `LB` | Left Back |
| `RB` | Right Back |
| `LWB` | Left Wing Back |
| `RWB` | Right Wing Back |
| `CDM` | Defensive Midfielder |
| `CM` | Central Midfielder |
| `CAM` | Attacking Midfielder |
| `LM` | Left Midfielder |
| `RM` | Right Midfielder |
| `LW` | Left Winger |
| `RW` | Right Winger |
| `ST` | Striker |
| `CF` | Centre Forward |

---

### `GET /api/players/{id}/history/` ✅ Implemented

Returns the player's full academy and team membership history.

**Response 200:**
```json
{
  "academy_history": [
    {
      "id": "...",
      "academy": { "id": "...", "name": "Manchester United Academy", "city": "Manchester", "country": "England" },
      "joined_at": "2024-01-15",
      "left_at": null,
      "status": "active"
    }
  ],
  "team_history": [
    {
      "id": "...",
      "team": {
        "id": "...",
        "name": "U15 Boys",
        "age_group": "U15",
        "gender": "M",
        "season": "2024/25",
        "academy": "...",
        "academy_name": "Manchester United Academy"
      },
      "joined_at": "2024-01-15",
      "left_at": null,
      "status": "active"
    }
  ]
}
```

Both lists are ordered by `joined_at` descending (most recent first).

### Planned (not yet implemented)

- Player history filtering by date range

---

## Player Academy Memberships ✅ Implemented

All endpoints are scoped to a specific player via the URL. `player` is never accepted in the request body.

### `POST /api/players/{player_id}/academy-memberships/`

Enroll a player in an academy. Creates a `PlayerAcademyMembership`.

**Required:** `academy` (UUID), `joined_at` (date)
**Optional:** `left_at` (date), `status` (`active` | `left`, defaults to `active`)

**Request:**
```json
{
  "academy": "550e8400-e29b-41d4-a716-446655440000",
  "joined_at": "2026-01-01"
}
```

**Response 201:**
```json
{
  "id": "...",
  "academy": "550e8400-e29b-41d4-a716-446655440000",
  "joined_at": "2026-01-01",
  "left_at": null,
  "status": "active",
  "created_at": "2026-01-01T10:00:00Z"
}
```

**Validation errors (400):**
- `academy` — does not exist
- `left_at` — before `joined_at`
- Non-field — player already has an active membership at this academy

**404** — player UUID does not exist

---

### `PATCH /api/players/{player_id}/academy-memberships/{membership_id}/`

Update a membership when a player leaves an academy (set `left_at` and `status`).

**Writable:** `left_at`, `status` only.
`academy` and `joined_at` are immutable after creation — any values sent are silently ignored.
`player` is not a field and is always ignored.

**Request:**
```json
{
  "left_at": "2026-06-30",
  "status": "left"
}
```

**Response 200:** Updated membership object (same shape as create response).

---

## Player Team Memberships ✅ Implemented

### `POST /api/players/{player_id}/team-memberships/`

Assign a player to a team. Creates a `PlayerTeamMembership`.

**Required:** `team` (UUID), `joined_at` (date)
**Optional:** `left_at` (date), `status` (`active` | `left`, defaults to `active`)

**Request:**
```json
{
  "team": "660e8400-e29b-41d4-a716-446655440001",
  "joined_at": "2026-01-15"
}
```

**Response 201:**
```json
{
  "id": "...",
  "team": "660e8400-e29b-41d4-a716-446655440001",
  "joined_at": "2026-01-15",
  "left_at": null,
  "status": "active",
  "created_at": "2026-01-15T10:00:00Z"
}
```

**Validation errors (400):**
- `team` — does not exist
- `left_at` — before `joined_at`
- Non-field — player already has an active membership on this team

**404** — player UUID does not exist

---

### `PATCH /api/players/{player_id}/team-memberships/{membership_id}/`

Update a membership when a player leaves a team.

**Writable:** `left_at`, `status` only.
`team` and `joined_at` are immutable after creation.

**Request:**
```json
{
  "left_at": "2026-06-30",
  "status": "left"
}
```

**Response 200:** Updated membership object.
- `GET /api/players/{id}/assessments/` — development assessments
- `GET /api/players/{id}/goals/` — development goals
- `GET /api/players/{id}/attendance/` — training attendance
- `GET /api/players/{id}/matches/` — match statistics
- `GET /api/players/{id}/measurements/` — physical measurements
- `GET /api/players/{id}/compare/` — comparison against team averages

---

## Academies ✅ Implemented

### `GET /api/academies/`
### `POST /api/academies/`

**Required:** `name`. Optional: `description`, `city`, `country`, `logo_url`.

### `GET /api/academies/{id}/`
### `PATCH /api/academies/{id}/`

**Response shape:**
```json
{
  "id": "...",
  "name": "Manchester United Academy",
  "description": "",
  "city": "Manchester",
  "country": "England",
  "logo_url": "",
  "created_at": "...",
  "updated_at": "..."
}
```

**Planned (not yet implemented):**
- `GET /api/academies/{id}/teams/`
- `GET /api/academies/{id}/players/`

---

## Teams ✅ Implemented

### `GET /api/teams/`
### `POST /api/teams/`

**Required:** `academy` (UUID), `name`. Optional: `age_group`, `gender` (M/F/X), `season`.

### `GET /api/teams/{id}/`
### `PATCH /api/teams/{id}/`

**Response shape:**
```json
{
  "id": "...",
  "academy": "550e8400-...",
  "name": "U15 Boys",
  "age_group": "U15",
  "gender": "M",
  "season": "2024/25",
  "created_at": "...",
  "updated_at": "..."
}
```

**Planned (not yet implemented):**
- `GET /api/teams/{id}/players/`
- `GET /api/teams/{id}/sessions/`
- `GET /api/teams/{id}/matches/`

---

## Development — Skills ✅ Implemented

### `GET /api/development/skills/`

List all active skills ordered by category then name. Requires auth.

**Response 200:**
```json
[
  {
    "id": "...",
    "name": "Passing",
    "category": "TECHNICAL",
    "description": "Accuracy and range of passing.",
    "is_active": true,
    "created_at": "...",
    "updated_at": "..."
  }
]
```

### `GET /api/development/skills/{id}/`

Retrieve a single skill by UUID.

---

## Development — Assessments ✅ Implemented

All assessment endpoints are scoped to a player. Assessments are immutable — once created they cannot be updated.

### `POST /api/players/{player_id}/assessments/`

Create a new assessment for a player. Coach and Academy Admin only.

**Request:**
```json
{
  "assessment_date": "2026-10-08",
  "overall_comment": "Good progress this month.",
  "items": [
    { "skill": "<skill_uuid>", "score": 84, "comment": "Very good passing accuracy." },
    { "skill": "<skill_uuid>", "score": 78 }
  ]
}
```

**Validation (400):**
- `items` must not be empty
- `score` must be 0–100
- Duplicate `skill` in same assessment is rejected

**Response 201:** Full assessment object with items.

**403:** PLAYER role cannot create assessments.

---

### `GET /api/players/{player_id}/assessments/`

List all assessments for the player, newest first.

**Permissions:** Player can read own only. Coach/AcademyAdmin can read any.

### `GET /api/players/{player_id}/assessments/{assessment_id}/`

Retrieve a specific assessment with all items.

---

## Development — Goals ✅ Implemented

### `POST /api/players/{player_id}/goals/`

Create a development goal. Coach and Academy Admin only.

**Request:**
```json
{
  "title": "Improve weak foot passing",
  "skill": "<skill_uuid>",
  "current_value": "62.00",
  "target_value": "75.00",
  "start_date": "2026-01-01",
  "target_date": "2027-01-01"
}
```

`skill` is optional. `target_date` must not be before `start_date`.

**Response 201:** Goal object. Default `status` is `ACTIVE`.

---

### `GET /api/players/{player_id}/goals/`
### `GET /api/players/{player_id}/goals/{goal_id}/`
### `PATCH /api/players/{player_id}/goals/{goal_id}/`

PATCH can update `status` (`ACTIVE` | `COMPLETED` | `CANCELLED`), `current_value`, `target_date`, `description`.

---

## Development — Physical Measurements ✅ Implemented

### `POST /api/players/{player_id}/measurements/`

**Request:**
```json
{
  "measurement_date": "2026-10-08",
  "height_cm": "175.50",
  "weight_kg": "70.00",
  "body_fat_percentage": "12.50",
  "sprint_time_seconds": "4.85",
  "notes": "Pre-season measurement."
}
```

All measurement fields are optional (nullable). Negative values are rejected.

**Response 201:** Measurement object.

---

### `GET /api/players/{player_id}/measurements/`
### `GET /api/players/{player_id}/measurements/{measurement_id}/`

---

## Development — Timeline ✅ Implemented

### `GET /api/players/{player_id}/development/timeline/`

Returns the player's full development history in chronological order.

**Response 200:**
```json
{
  "assessments": [ ... ],
  "goals": [ ... ],
  "measurements": [ ... ]
}
```

All three lists are ordered chronologically (earliest first).

**Permissions:** Player can read own only. Coach/AcademyAdmin can read any.

---

## Training ✅ Implemented

Base URLs: `/api/training/sessions/`, `/api/training/exercises/`

**Important:** Training focus skills are metadata only — they never automatically modify a player's assessment scores.

---

### Exercises

#### `GET /api/training/exercises/`

List all active exercises. Coach/AcademyAdmin only.

#### `POST /api/training/exercises/`

Create an exercise. Coach/AcademyAdmin only. `created_by` is set from the authenticated user.

**Required:** `name`, `category`. **Optional:** `description`, `duration_minutes`.

**Response shape:**
```json
{
  "id": "...",
  "name": "Rondo 5v2",
  "description": "Possession drill in a circle.",
  "category": "TECHNICAL",
  "duration_minutes": 15,
  "created_by": "...",
  "is_active": true,
  "created_at": "..."
}
```

#### `GET /api/training/exercises/{id}/`
#### `PATCH /api/training/exercises/{id}/`

---

### Training Sessions

#### `POST /api/training/sessions/`

Create a training session. Coach/AcademyAdmin only. `coach` is set from the authenticated user.

**Required:** `academy` (UUID), `title`, `training_date`.
**Optional:** `team` (UUID — must belong to `academy`), `description`, `start_time`, `duration_minutes`, `location`, `focus_skills` (list of Skill UUIDs).

**Request:**
```json
{
  "academy": "<academy_uuid>",
  "team": "<team_uuid>",
  "title": "Tuesday Passing Drill",
  "training_date": "2026-10-14",
  "start_time": "09:00:00",
  "duration_minutes": 90,
  "location": "Pitch A",
  "focus_skills": ["<skill_uuid>", "<skill_uuid>"]
}
```

**Validation (400):**
- `team` must belong to `academy`

**Response 201:** Full session object.

#### `GET /api/training/sessions/`
#### `GET /api/training/sessions/{id}/`
#### `PATCH /api/training/sessions/{id}/`

**Response shape:**
```json
{
  "id": "...",
  "academy": "...",
  "team": "...",
  "title": "Tuesday Passing Drill",
  "training_date": "2026-10-14",
  "start_time": "09:00:00",
  "duration_minutes": 90,
  "location": "Pitch A",
  "coach": "...",
  "focus_skills": [{ "id": "...", "name": "Passing", "category": "TECHNICAL" }],
  "session_exercises": [...],
  "created_at": "...",
  "updated_at": "..."
}
```

---

### Session Exercises

#### `GET /api/training/sessions/{session_id}/exercises/`
#### `POST /api/training/sessions/{session_id}/exercises/`

Add an exercise to a session. Coach/AcademyAdmin only.

**Required:** `exercise` (UUID), `order` (≥ 1). **Optional:** `duration_minutes`, `notes`.

---

### Attendance

#### `GET /api/training/sessions/{session_id}/attendance/`
#### `POST /api/training/sessions/{session_id}/attendance/`

Record a player's attendance for a session. Coach/AcademyAdmin only.

**Required:** `player` (UUID), `status` (`PRESENT` | `ABSENT` | `LATE` | `EXCUSED`).

**Validation (400):** Duplicate player for same session rejected.

#### `PATCH /api/training/sessions/{session_id}/attendance/{attendance_id}/`

Update an existing attendance record. `status` and `notes` are writable.

---

### Player Training History

#### `GET /api/players/{player_id}/training/history/`

Returns all training sessions a player has attended, with their attendance status for each.

**Permissions:** Player can read own only. Coach/AcademyAdmin can read any.

**Response 200:**
```json
[
  {
    "id": "...",
    "title": "Tuesday Passing Drill",
    "training_date": "2026-10-14",
    "academy": "...",
    "team": "...",
    "coach": "...",
    "attendance_status": "PRESENT",
    "attendance_notes": ""
  }
]
```

---

## Matches ✅ Implemented

Base URL: `/api/matches/`

**Important:** Match statistics never automatically modify development assessment scores. Match performance and development are independent systems.

**Permissions:** Coach and Academy Admin can manage all match data. Player role can only read their own match history and summary.

---

### `GET /api/matches/`
### `POST /api/matches/`

Create a match. `created_by` is set from the authenticated user.

**Required:** `academy` (UUID), `team` (UUID), `opponent_name`, `match_date`, `home_away` (`HOME` | `AWAY`).
**Optional:** `venue`, `competition`, `team_score`, `opponent_score`, `notes`.

**Validation (400):** `team` must belong to `academy`.

**Response shape:**
```json
{
  "id": "...",
  "academy": "...",
  "academy_name": "Manchester United Academy",
  "team": "...",
  "team_name": "U15 Boys",
  "opponent_name": "Spartak Academy",
  "match_date": "2026-10-14",
  "venue": "Pitch A",
  "competition": "U15 League",
  "home_away": "HOME",
  "team_score": 3,
  "opponent_score": 1,
  "result": "WIN",
  "score_display": "3-1",
  "notes": "",
  "created_by": "...",
  "created_by_name": "John Smith",
  "created_at": "...",
  "updated_at": "..."
}
```

`result` is derived from `team_score` and `opponent_score` — `WIN` / `DRAW` / `LOSS` / `null` (if scores not yet recorded). It is never stored in the database.

### `GET /api/matches/{id}/`
### `PATCH /api/matches/{id}/`

---

### Match Player Statistics

#### `GET /api/matches/{id}/players/`
#### `POST /api/matches/{id}/players/`

Add a player's stats to a match. Coach/AcademyAdmin only.

**Required:** `player` (UUID).
**Optional:** `started` (bool, default false), `minutes_played` (default 0), `goals`, `assists`, `shots`, `shots_on_target`, `passes_attempted`, `passes_completed`, `key_passes`, `dribbles`, `tackles`, `interceptions`, `yellow_cards`, `red_cards`, `rating` (0–10), `coach_comment`.

**Validation (400):**
- Duplicate player for same match is rejected
- `rating` must be 0–10

**Response 201:**
```json
{
  "id": "...",
  "match": "...",
  "player": "...",
  "player_name": "Marcus Rashford",
  "football_id": "CF-A3B7XZ92",
  "started": true,
  "minutes_played": 90,
  "goals": 1,
  "assists": 1,
  "rating": "8.50",
  "coach_comment": "Excellent pressing and link-up play."
}
```

#### `GET /api/matches/{id}/players/{stats_id}/`
#### `PATCH /api/matches/{id}/players/{stats_id}/`

---

### Player Match History

#### `GET /api/players/{id}/matches/`

Returns all matches a player has stats for, with per-match context embedded inline.

**Permissions:** Player can read own only. Coach/AcademyAdmin can read any.

**Response 200:**
```json
{
  "matches": [
    {
      "id": "...",
      "match": "...",
      "match_date": "2026-10-14",
      "opponent": "Spartak Academy",
      "home_away": "HOME",
      "team_score": 3,
      "opponent_score": 1,
      "result": "WIN",
      "score_display": "3-1",
      "competition": "U15 League",
      "venue": "Pitch A",
      "started": true,
      "minutes_played": 80,
      "goals": 1,
      "assists": 1,
      "rating": "8.40",
      "coach_comment": ""
    }
  ]
}
```

---

### Player Match Summary

#### `GET /api/players/{id}/matches/summary/`

Returns aggregated match statistics for the player. Computed from `MatchPlayerStats` on the fly — never stored as duplicated totals.

**Permissions:** Same as match history.

**Response 200:**
```json
{
  "matches_played": 10,
  "starts": 8,
  "total_minutes": 720,
  "goals": 5,
  "assists": 3,
  "average_rating": "7.85",
  "total_shots": 22,
  "total_passes_completed": 480,
  "total_dribbles": 15,
  "total_tackles": 30,
  "yellow_cards": 1,
  "red_cards": 0
}
```
