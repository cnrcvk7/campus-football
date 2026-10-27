# Tactics Board & Match Lineup — Design (v1)

Status: APPROVED by Caner (2026-10-24)
Implementer: Kan (frontend + backend), reviewed by Caner (security/backend)
Base: main @ 4dc90b0 (includes strict academy scoping, PR #12, and the announcements backend)

---

## 1. Goal

Give coaches a pitch where they can build a match lineup by dragging players onto positions, pick a formation, manage substitutes, and draw tactical instructions (arrows, lines, zones, text) on top. Players on the team can see the lineup once the coach publishes it.

SportEasy is visual inspiration only. Use our own design system (cf-* tokens, navy/emerald), no copied assets or branding.

## 2. Scope

### In v1 (MVP)
- One lineup per match (structure allows multiple later)
- Game format: 11v11, 9v9, 7v7, 5v5 (youth academies play smaller formats)
- Formation templates per format; applying a formation snaps starters to template positions
- Drag & drop players from the squad list onto the pitch; move tokens freely; bench (substitutes) with order
- Drawing layer: arrow, line, dashed line, freehand, zone (ellipse/rectangle), text label; fixed color palette; undo/redo; eraser/select-delete
- Save (explicit), Draft / Published state
- Read-only lineup view for published lineups (staff + players of the team)

### Out of v1 (later)
- Multiple lineups per match, free tactics boards not tied to a match (training), animations/step-by-step plays
- Match availability (the "Participants: available / awaiting / unavailable" panel) — no model exists today; separate feature
- PNG/PDF export (client-side export is possible later without media storage), social sharing
- Real-time collaborative editing

## 3. Verified facts this design relies on (architecture inventory, 2026-10-23)

- No lineup / squad / availability / tactics model exists.
- `Match` has a `team` FK; matches belong to an academy and are scoped by academy staff membership.
- Team rosters: `PlayerTeamMembership` with history; current roster = `status="active"`.
- Players belong to academies via `PlayerAcademyMembership` (ACTIVE / LEFT).
- `Player.preferred_position`: 15 choices, 3-character codes — reuse for slot position labels.
- All models use UUID primary keys.
- Scoping helpers: `get_user_academy_ids()`, `require_staff_of_academy()` (academies/permissions.py); `MatchViewSet` is the reference pattern. Out-of-scope objects return 404.
- No MEDIA storage configured (not needed for v1).
- Frontend: `CoachRoute` guard, services wrap `api.ts`, types in `types/index.ts`, i18n EN/TR/RU parity required.
- Verified on 2026-10-24 (announcements backend, Step 0): `Player.user` is a nullable OneToOneField (a PLAYER user → `Player.objects.get(user=user)`); parents are linked through `ParentPlayerLink` (apps/users/models.py; FK parent → User, FK player → Player, unique (parent, player), a parent may have several children); `PlayerAcademyMembership` and `PlayerTeamMembership` both have `status` "active" / "left" plus `joined_at` / `left_at`.

Items marked UNVERIFIED below must be checked in code before implementation.

## 4. Data model (new Django app: `tactics`)

### Lineup
| Field | Type | Notes |
|---|---|---|
| id | UUID PK | |
| match | FK Match, CASCADE | UniqueConstraint(match) in v1 (drop later for multiple lineups) |
| game_format | choices: 11, 9, 7, 5 | Max starters |
| formation | CharField | Must be valid for game_format (validated against a backend constant list) |
| status | DRAFT / PUBLISHED | |
| published_at | DateTime, null | |
| drawing | JSONField, default list | Validated (see 4.3) |
| version | PositiveInteger | Optimistic concurrency, incremented on each save |
| created_by / updated_by | FK User, SET_NULL | Audit |
| created_at / updated_at | DateTime | |

### LineupSlot
| Field | Type | Notes |
|---|---|---|
| id | UUID PK | |
| lineup | FK Lineup, CASCADE | |
| player | FK Player, CASCADE | |
| role | STARTER / SUBSTITUTE | |
| x, y | Decimal(5,4), null | Normalized 0..1; required for STARTER, null for SUBSTITUTE |
| position_code | CharField, blank | Same choices as Player.preferred_position |
| order | PositiveSmallInteger | Bench order |

Constraints: UniqueConstraint(lineup, player); CheckConstraint 0 ≤ x, y ≤ 1; starters with x/y not null.

### 4.3 Drawing JSON (validated server-side)
```json
[
  {"id": "uuid-or-short-id", "type": "arrow", "points": [[0.42, 0.61], [0.55, 0.40]],
   "color": "white", "width": "md", "dashed": false},
  {"id": "...", "type": "text", "at": [0.5, 0.5], "text": "Press here", "color": "yellow"}
]
```
- type ∈ {arrow, line, freehand, ellipse, rect, text}
- coordinates normalized 0..1; freehand ≤ 500 points
- color ∈ fixed palette keys (e.g. white, yellow, red, blue, black) — never raw CSS
- width ∈ {sm, md, lg}; text ≤ 120 chars, plain text only (rendered as SVG text, never HTML)
- max 300 elements and ~100 KB serialized; reject unknown keys

## 5. Business rules (enforced in the backend)

1. Every slot player must have an ACTIVE `PlayerTeamMembership` in `match.team` (and therefore belong to the match's academy).
2. Starters ≤ game_format; a player appears at most once.
3. Formation must exist for the chosen game_format.
4. Save is all-or-nothing: lineup + slots + drawing replaced in one `transaction.atomic()`.
5. Optimistic concurrency: client sends `version`; mismatch → 409 Conflict ("lineup changed by someone else, reload").

## 6. Permissions

| Action | Superuser | Staff of match.academy (COACH / ACADEMY_ADMIN) | PLAYER | PARENT | Others |
|---|---|---|---|---|---|
| Read DRAFT | ✅ | ✅ | 404 | 404 | 404 |
| Read PUBLISHED | ✅ | ✅ | ✅ if ACTIVE member of match.team | ✅ if a child (via `ParentPlayerLink`) is an ACTIVE member — v1.1 | 404 |
| Create / update / delete / publish | ✅ | ✅ (`require_staff_of_academy`) | 403/404 | 403/404 | 404 |

- Never trust ids from the client: resolve match via the scoped Match queryset first.
- PLAYER read access uses `Player.user` + ACTIVE `PlayerTeamMembership` in `match.team`. PARENT read access (via `ParentPlayerLink`) is planned for v1.1; the relation exists, so the backend may implement it in v1 if it stays small and is fully tested.
- Follow the visibility pattern already used in the announcements app for players/parents (ACTIVE memberships only).

## 7. API

All under the match, which is resolved through the academy-scoped Match queryset:

| Method | URL | Purpose |
|---|---|---|
| GET | /api/matches/{id}/lineup/ | Lineup (404 if none or not visible) |
| PUT | /api/matches/{id}/lineup/ | Create or replace lineup (game_format, formation, slots, drawing, version) |
| DELETE | /api/matches/{id}/lineup/ | Delete lineup (staff) |
| POST | /api/matches/{id}/lineup/publish/ | DRAFT → PUBLISHED |
| POST | /api/matches/{id}/lineup/unpublish/ | PUBLISHED → DRAFT |

Squad list for the editor: reuse the existing team players endpoint (`teamService.listPlayers()`) if it returns only ACTIVE members with preferred_position — UNVERIFIED; otherwise add GET /api/matches/{id}/lineup/squad/.

Errors use stable codes for i18n (e.g. `player_not_in_team`, `too_many_starters`, `invalid_formation`, `version_conflict`, `invalid_drawing`).

## 8. Frontend

### Routes
- `/coach/matches/:matchId/lineup` — editor (CoachRoute)
- Match detail page gets a "Lineup" panel: summary + "Edit lineup" button (+ Draft/Published badge)
- Player-facing read-only view: in the player's match view if such a page exists (UNVERIFIED), otherwise v1.1

### Components (`frontend/src/components/tactics/`)
- `Pitch` — SVG, vertical pitch, viewBox in normalized units; markings for 11v11/9v9/7v7/5v5
- `PlayerToken` — avatar initials + shirt/short name; draggable; keyboard-movable
- `SquadList` — available players (filter by position), drag source
- `Bench` — substitutes with order
- `FormationPicker` — game_format + formation; applying snaps starters to templates
- `DrawingLayer` + `DrawingToolbar` — tools, palette, width, dashed, undo/redo, delete selected
- `LineupView` — read-only rendering (shared by staff summary and player view)

### Technical choices
- Pointer Events on SVG for mouse + touch; no new dependency in v1 (if a library becomes necessary, propose it in the PR description first)
- State: a reducer (`useReducer`) with an undo/redo history for tokens and drawing; save sends the whole state
- Formation templates: `frontend/src/constants/formations.ts` (normalized coordinates); backend keeps the list of valid formation keys
- Unsaved-changes guard when leaving the editor
- Editing on desktop and tablet; on phones the editor shows the read-only view with a hint

### Accessibility
- Tokens are focusable buttons with aria-label (name + position); arrow keys move the selected token; an alternative "assign player to position" list for keyboard/screen-reader users
- Drawing tools are buttons with aria-pressed; no color-only meaning in the UI chrome

### Design system
- Use PageHeader, Panel, Button, Badge, EmptyState, LoadingSpinner; cf-* tokens; pitch uses a restrained emerald palette that works in dark mode
- All strings under `tactics.*` in EN/TR/RU (Russian plurals where counts are shown)

## 9. Testing

Backend (required before merge):
- Permission matrix: coach A vs coach B (404), staff draft/published, player published vs draft, superuser
- Validation: player not in team, LEFT/inactive member, duplicate player, too many starters, invalid formation, coordinates out of range, invalid/oversized drawing, unknown drawing keys, raw CSS color rejected
- Atomic replace and version conflict (409)

Frontend:
- Unit tests: formation templates (count per format, coordinates in 0..1), coordinate normalization, lineup reducer incl. undo/redo
- Manual: drag & drop with mouse and touch (tablet emulation), keyboard movement, dark mode, TR/RU, save/reload, publish

## 10. Delivery plan (small PRs)

1. `feat/tactics-backend` — app, models, migration, serializers, views, permissions, tests
2. `feat/tactics-editor` — pitch, formations, squad list, drag & drop, bench, save/version handling
3. `feat/tactics-drawing` — drawing layer, toolbar, undo/redo, validation errors
4. `feat/tactics-publish-view` — publish/unpublish UI, match detail panel, read-only view (player view if supported)

Each PR: lint, tests, build, backend suite, browser check; AI assistants do not commit/push without explicit permission.

## 11. Open questions (defaults used in this draft)

1. Visibility: coach chooses Draft / Published (default). Parents in v1.1.
2. Free tactics boards for training: later (default).
3. Device priority: desktop + tablet editing, phone read-only (default).
4. Should the lineup show players' shirt numbers? Is there a shirt number field? UNVERIFIED.
