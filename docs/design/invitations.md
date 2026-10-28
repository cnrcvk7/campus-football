# Invitations, Closed Access & Parental Control — Design (v1)

Status: APPROVED by Caner (2026-10-28)
Implementer: Caner (backend + frontend); Kan reviews the frontend
Base: latest main (includes strict academy scoping and the development read-access fix)

---

## 1. Goal

Campus Football is a closed web application. There is no public sign-up: every account is created through an invitation. Coaches invite players and their parent with personal, one-time links they can share on WhatsApp. Players below an academy-defined age can only get an account with their parent's approval; older players (e.g. amateur adult clubs) can join on their own.

The marketing website (e.g. WordPress on `campusfootball.com`) is separate; the app lives on its own subdomain (e.g. `app.campusfootball.com`) and shows only a login page to visitors.

## 2. Decisions (approved)

| Topic | Decision |
|---|---|
| Invitation type | **Personal, one-time links** bound to a specific player (option B). No open team links in v1. |
| Minors | Each academy sets a **parental consent age**. Players younger than that age need their parent's approval; older players can join without a parent. |
| Parents | **Exactly one parent per player.** A parent may be linked to several players (siblings). |
| Login | **Email + password.** Password reset by email. |

## 3. Invitation chain

```
Platform owner (superuser)  → creates academy + first ACADEMY_ADMIN invitation
ACADEMY_ADMIN               → invites coaches (and other admins)
COACH / ACADEMY_ADMIN       → invites a player's parent, and the player (if old enough)
PARENT                      → activates the account of a child below the consent age
```

Nobody can create an account without a valid invitation. Existing public user-creation endpoints, if any, are removed or restricted to superusers (verify in code).

## 4. Age rule

- New academy field `parental_consent_age` (integer, allowed 13–18, **default 18**), editable by the academy's ACADEMY_ADMIN.
- A player is a **minor for this academy** when their age (from `Player.date_of_birth`, verify field name) is below that value. Age is calculated on the day the invitation is created and again when it is redeemed.
- Missing date of birth → treated as a minor (safe default).

| Player | Who can create the player's invitation | Parent required? |
|---|---|---|
| Below consent age | **Only the linked parent**, from their own account ("Activate my child's account") | Yes — the parent must join first |
| At / above consent age | Coach / admin (or the parent, if one is linked) | No (optional) |

- When a minor turns the consent age, nothing changes automatically: the parent link stays; the parent or academy admin can remove it later.
- Legal note: the default (18) is deliberately conservative. Whether a lower age is acceptable is a legal question per country (e.g. KVKK in Türkiye, 152-ФЗ in Russia) and must be checked with a lawyer before production.

## 5. Data model

### Invitation (new, `users` app or a new `invitations` app)
| Field | Notes |
|---|---|
| id | UUID PK |
| token_hash | SHA-256 of a random 32-byte URL-safe token; the plain token is shown only once (in the link) and never stored |
| role | COACH, ACADEMY_ADMIN, PARENT, PLAYER |
| academy | FK, required |
| player | FK Player, required for PARENT and PLAYER, null otherwise |
| email_hint | optional; if set, the account email must match (case-insensitive) |
| created_by | FK User |
| expires_at | default 7 days |
| used_at / used_by | set on redemption |
| revoked_at | set when cancelled |
| created_at | |

Constraints / rules:
- At most one **open** (not used, not revoked, not expired) invitation per (player, role); creating a new one revokes the previous.
- PARENT invitation is refused if the player already has a parent.
- PLAYER invitation is refused if the player already has a user account.

### ParentPlayerLink (existing)
- New `UniqueConstraint(player)` → exactly one parent per player.
- Data migration: list players with more than one parent; the migration must stop with a clear message instead of deleting anything (resolve manually first). Dev DB only today.

### Consent (new fields or a small model)
- `consent_version`, `consent_accepted_at` on the user (for adults and parents) and, for minors, `parent_approved_at` + `approved_by` on the player account link.
- The privacy notice / consent text lives in the frontend i18n with a version string; changing the text bumps the version.

### Academy (existing)
- `parental_consent_age` as above.

## 6. Flows

### 6.1 Coach invites a parent
1. Player profile → "Parent invitation" → link created (shown once) + "Share on WhatsApp" (`https://wa.me/?text=…`) + "Copy link".
2. Parent opens `/invite/<token>`: sees academy name, team, player's first name only.
3. Parent enters email, name, password, accepts the privacy notice → account (role PARENT) + `ParentPlayerLink` created atomically → logged in.

### 6.2 Player at / above consent age
Same as 6.1 with role PLAYER: account linked through `Player.user`.

### 6.3 Minor player
1. Coach can only invite the parent (the player-invite button is disabled with an explanation).
2. After joining, the parent sees "Activate <child>'s account" → creates the child's PLAYER invitation (parent approval recorded) → shares it with the child.
3. The parent can later disable the child's login (account deactivated, data kept).

### 6.4 Admin invites a coach
Academies → Staff → "Invite coach" → role COACH/ACADEMY_ADMIN link → redeemed account gets an `AcademyStaffMembership`. Removing a staff member deletes the membership (access ends immediately).

### 6.5 Platform owner creates an academy
Superuser screen or management command: create academy + ACADEMY_ADMIN invitation link.

### 6.6 Password reset
"Forgot password" → email with a one-time, time-limited link (Django's token generator) → new password. Response is identical whether or not the email exists (no account enumeration).

## 7. API (sketch)

| Method | URL | Who |
|---|---|---|
| POST | /api/invitations/ | Coach/admin (player, parent), admin (staff), parent (own minor child) — all academy-scoped |
| GET | /api/invitations/?player=&status= | Staff of the academy (parents: their own) |
| POST | /api/invitations/{id}/revoke/ | Creator, academy admin |
| GET | /api/invitations/preview/{token}/ | Public, throttled: academy name, team, player first name, role, expired/used state only |
| POST | /api/invitations/redeem/{token}/ | Public, throttled: email, first/last name, password, consent_version → creates the account, returns JWT |
| POST | /api/auth/password-reset/ and /confirm/ | Public, throttled |
| PATCH | /api/academies/{id}/ (parental_consent_age) | Academy admin |

Error codes: `invitation_invalid` (unknown, expired, used, revoked — one code, no detail leak), `player_has_parent`, `player_has_account`, `parent_required` (minor), `email_mismatch`, `email_taken`.

## 8. Security

- Tokens: 32 random bytes (`secrets.token_urlsafe`), stored as SHA-256 hash, compared in constant time, single-use, 7-day expiry, revocable.
- Preview and redeem endpoints throttled per IP (like login); invalid tokens all return the same response.
- Redemption runs in one transaction with `select_for_update` on the invitation (double-click / race → one account).
- Passwords: Django validators; email normalized and unique (case-insensitive).
- The invite page reveals only first name, team and academy — never date of birth, surname or other data.
- Invitation links are never logged in full (log the invitation id).
- Access ends automatically when memberships end (existing rules); deactivated users cannot log in or refresh tokens.

## 9. Email

- Needed only for password reset in v1 (no welcome email). Invitations themselves are shared via WhatsApp, so the feature works before email is configured.
- Development: console email backend. Production: a transactional email provider via SMTP settings from environment variables (provider to be chosen at deployment).

## 10. Frontend

- Public routes (no AppShell): `/invite/:token`, `/forgot-password`, `/reset-password/:uid/:token`. The login page gets "Forgot password?".
- Player profile: "Invitations" panel showing parent/player status (Not invited · Invited (expires …) · Joined), create / copy / share on WhatsApp / revoke.
- Team page: invitation status column so the coach sees who hasn't joined.
- Parent home: "My children" with "Activate account" for minors and "Disable login".
- Academy settings (admin): parental consent age; staff list with "Invite coach" and "Remove".
- All strings in EN/TR/RU.

## 11. Testing

- Token: preview/redeem valid, expired, used, revoked, unknown (identical responses), throttling, race (two redeems → one account).
- Age rule: minor vs adult at creation and redemption, missing birth date, academy setting changes.
- Single parent: second parent invitation refused; DB constraint.
- Scoping: coach of academy B cannot invite for academy A's player (404); parent can only invite their own child.
- Password reset: no enumeration, token expiry.
- Existing suites keep passing.

## 12. Delivery plan

1. `feat/invitations-backend` — models, migrations (incl. single-parent constraint), endpoints, password reset, throttles, tests.
2. `feat/invitations-frontend` — public invite/reset pages, player/team invitation panels, WhatsApp share.
3. `feat/parent-child-activation` — parent "My children", minor activation, academy consent-age setting, staff invitations.

## 13. Resolved questions

1. Default consent age: 18 (configurable 13–18 by the academy admin).
2. Email in v1: password reset only (no welcome email).
3. Delivery plan: the three PRs in section 12.
