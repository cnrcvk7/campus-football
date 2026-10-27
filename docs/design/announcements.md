# Announcements Channel — Design (v1)

Status: DRAFT for approval by Caner
Implementer: Caner (backend + frontend); Kan reviews the frontend
Base: main (includes strict academy scoping, PR #12)

---

## 1. Goal

A one-way announcement channel: academy staff publish announcements to a team or to the whole academy; players and parents read them and can confirm with "Seen". It replaces scattered SMS/WhatsApp messages for things like schedule changes, kit reminders and match-day logistics.

Safeguarding by design: there is **no private messaging and no replies**. Adults never have a one-to-one conversation channel with a minor. Every announcement is visible to the whole audience (team or academy), including parents.

## 2. Decisions (approved)

| Topic | Decision |
|---|---|
| Who writes | COACH (to teams of academies they are staff of) and ACADEMY_ADMIN (to teams and the whole academy) |
| Who reads | Staff of the academy, players of the audience, **parents of those players** |
| Player interaction | Read-only + **"Seen" acknowledgement** (no replies, no comments) |
| Real-time | REST + polling (no WebSockets in v1) |

Defaults used in this draft (change if needed):
- Parents can also tap "Seen"; staff see player and parent acknowledgements separately.
- Coaches cannot post academy-wide; only academy admins can.
- No one-to-one announcements to a single player (safeguarding); this may be revisited only with parent visibility built in.

## 3. Scope

### In v1
- Team announcements and academy-wide announcements
- Title + plain-text body, optional link to a related match or training session, pin to top
- Feed for every role, unread indicator in the sidebar, "Seen" button for players and parents
- Staff view of acknowledgements: "12 / 18 players seen", with names of who has / hasn't seen
- Edit (author) and delete (author or academy admin) with soft delete

### Out of v1 (later)
- Attachments (images, PDFs) — needs media storage and upload security
- Email / push notifications
- Scheduled announcements, polls, RSVP
- WebSocket real-time delivery

## 4. Data model (new Django app: `announcements`)

### Announcement
| Field | Type | Notes |
|---|---|---|
| id | UUID PK | |
| academy | FK Academy, CASCADE | Always set |
| team | FK Team, null | null = academy-wide; if set, team.academy must equal academy |
| related_match | FK Match, null, SET_NULL | Must belong to the same academy (and team, if set) |
| related_session | FK TrainingSession, null, SET_NULL | Same rule |
| author | FK User, SET_NULL, null | |
| title | CharField(120) | |
| body | TextField | Max 2000 chars, plain text |
| is_pinned | Boolean | |
| edited_at | DateTime, null | Set when the title/body changes |
| deleted_at | DateTime, null | Soft delete; hidden from everyone except the audit trail |
| created_at / updated_at | DateTime | |

Indexes: (academy, team, -created_at); (academy, deleted_at).
Check: not both related_match and related_session.

### AnnouncementReceipt
| Field | Type | Notes |
|---|---|---|
| id | UUID PK | |
| announcement | FK Announcement, CASCADE | |
| user | FK User, CASCADE | |
| read_at | DateTime, null | Drives unread badge |
| acknowledged_at | DateTime, null | "Seen" button (players and parents only) |

UniqueConstraint(announcement, user).

Audience is resolved at query time (no fan-out rows per recipient).

## 5. Audience and visibility rules

A user can see a (non-deleted) announcement when:

| Role | Academy-wide announcement | Team announcement |
|---|---|---|
| Superuser | ✅ | ✅ |
| Staff (COACH / ACADEMY_ADMIN) of the academy | ✅ | ✅ (all teams of the academy) |
| PLAYER | ACTIVE PlayerAcademyMembership in the academy | ACTIVE PlayerTeamMembership in the team |
| PARENT | One of their children meets the PLAYER rule | Same |
| Anyone else | 404 | 404 |

- A player who leaves the team/academy loses access to its announcements.
- The Parent ↔ Player relation is UNVERIFIED (also being checked in the tactics backend task). If it doesn't exist in a usable form, parent access is blocked until it is clarified — do not invent a relation.

## 6. Write permissions

| Action | Rule |
|---|---|
| Create team announcement | Staff of team.academy (COACH or ACADEMY_ADMIN) |
| Create academy-wide | ACADEMY_ADMIN who is staff of that academy (or superuser) |
| Edit | Author only (while still staff of the academy) |
| Delete (soft) | Author, or ACADEMY_ADMIN of the academy |
| Pin / unpin | Author or ACADEMY_ADMIN |
| Read / acknowledge | Anyone who can see it; acknowledge allowed for PLAYER and PARENT only |
| PLAYER / PARENT create/edit/delete | 403 |

- Never trust academy/team ids from the client: validate with get_user_academy_ids / require_staff_of_academy; out-of-scope ids → 404 (consistent with PR #12).
- Throttle creation (DRF scoped throttle, e.g. 30 per hour per user).

## 7. API

| Method | URL | Purpose |
|---|---|---|
| GET | /api/announcements/?team=&page= | Feed for the current user (pinned first, then newest) |
| POST | /api/announcements/ | Create (staff) |
| GET / PATCH / DELETE | /api/announcements/{id}/ | Detail / edit / soft delete |
| POST | /api/announcements/{id}/read/ | Mark as read (idempotent) |
| POST / DELETE | /api/announcements/{id}/acknowledge/ | "Seen" / undo (players and parents, idempotent) |
| GET | /api/announcements/{id}/receipts/ | Staff only: audience counts and who has / hasn't acknowledged (players and parents separately) |
| GET | /api/announcements/unread-count/ | Number for the sidebar badge |

Error codes for i18n: `team_not_in_academy`, `academy_wide_requires_admin`, `related_event_mismatch`, `body_too_long`, `acknowledge_not_allowed`.

## 8. Content safety

- Plain text only. Render with React text nodes — never `dangerouslySetInnerHTML`, no Markdown in v1. URLs can be auto-linked later with `rel="noopener noreferrer"`.
- Length limits enforced in the serializer and the database.
- Receipts (who saw what) are visible only to staff of the academy.
- Soft-deleted announcements are excluded from every non-admin query.

## 9. Frontend

### Routes and navigation
- `/announcements` for all authenticated roles (ProtectedRoute); the UI adapts to the role
- Sidebar item "Announcements" with unread badge (poll `unread-count` every 60 s; pause while the tab is hidden; refresh on focus)
- Dashboard widget: latest 3 announcements

### Staff
- Composer: audience (team select; "Whole academy" for admins only), title, body with character counter, optional related match/session, pin
- Feed cards with acknowledgement progress ("12 / 18 players · 9 / 15 parents")
- Receipts panel: seen / not seen lists

### Players and parents
- Feed with unread markers; opening a card marks it read
- "Seen" button (toggle), relative timestamps, related event link
- Parents with several children see announcements of all their children's teams, labeled by team

### Design system and i18n
- PageHeader, Panel, Button, Badge, EmptyState, LoadingSpinner; cf-* tokens; dark mode
- Strings under `announcements.*` in EN/TR/RU (Russian plurals for counts)

## 10. Testing

Backend:
- Visibility matrix: staff of A vs B, player of team vs other team in same academy, player who LEFT, parent of member vs parent of non-member, superuser, unauthenticated
- Write matrix: coach team post OK, coach academy-wide 403, admin academy-wide OK, cross-academy team id → 404, player/parent create → 403, edit by non-author → 403, delete by admin OK
- Validation: lengths, team/academy mismatch, related event mismatch, soft delete hiding, acknowledge only for player/parent, idempotency, unread count, throttle

Frontend:
- Unit tests for relative time / count formatting and polling hook (pause when hidden)
- Manual: three roles (coach, player, parent) in separate browser sessions, TR/RU, dark mode, mobile

## 11. Delivery plan

1. `feat/announcements-backend` — app, models, migration, permissions, API, tests
2. `feat/announcements-frontend` — feed, composer, "Seen", receipts, sidebar badge
3. `feat/announcements-dashboard` — dashboard widget + polish

Coordination with Kan's tactics work: backend PRs don't conflict. Frontend PRs touch App.tsx, Sidebar, types and locale files — keep them small and rebase on main before opening.
