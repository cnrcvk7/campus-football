# User Flows — Campus Football

> **Status:** Design document for MVP. Authentication flows will be defined when auth is implemented.

---

## Academy Admin Flows

### Register a New Player
1. Admin opens "Add Player" form.
2. Fills in: first name, last name, date of birth, position, preferred foot.
3. System generates a unique Football ID on save.
4. Player profile is created.
5. Admin assigns the player to an academy and optionally a team.

### Assign Player to a Team
1. Admin views the player's profile.
2. Selects "Assign to Team".
3. Chooses academy → team.
4. System creates a `PlayerTeamMembership` record with `joined_at = today`.
5. Previous team assignment (if any) is closed with `left_at = today - 1`.

### Move Player Between Academies
1. Admin closes the current academy membership (`left_at = today`).
2. A new `PlayerAcademyMembership` is created for the new academy.
3. All historical records remain unchanged.

---

## Coach Flows

### Submit a Player Assessment
1. Coach opens a player's development page.
2. Selects "New Assessment".
3. Rates attributes across all four pillars (Technical, Tactical, Physical, Mental) on a 0–10 scale.
4. Adds optional narrative notes.
5. Submits — a new immutable `Assessment` record is created.
6. The player's development timeline updates immediately.

### Record Training Attendance
1. Coach opens a training session.
2. Views the team's player list.
3. Marks each player: present / absent / late / excused.
4. Saves — `TrainingAttendance` records are created/updated for the session.
5. Player skill scores are **not** affected.

### Set a Development Goal
1. Coach opens a player's profile.
2. Selects "Add Goal".
3. Fills in: title, description, target date.
4. Saves — goal is created with status `active`.
5. Later: Coach marks the goal as `achieved` or `dropped`.

### Log Match Statistics
1. Coach creates a match record (opponent, date, result, score).
2. For each player who participated, enters: minutes played, goals, assists, cards.
3. Saves — `MatchStatistic` rows created per player.

---

## Player / Parent Flows

### View Player Profile
1. Player (or parent) opens their profile.
2. Sees: personal info, Football ID, current team, latest assessment summary.

### View Development Timeline
1. Player navigates to "Development" section.
2. Sees a chronological list of assessments with scores per pillar.
3. Can filter by pillar or date range.

### View Team Comparison
1. Player navigates to "Compare".
2. System fetches their latest assessment scores.
3. System calculates current team average scores at query time.
4. Radar/bar chart shows the player's scores vs. team average.

### View Progress Report
1. Player selects a month.
2. System generates a summary: sessions attended, assessments received, goals status, match appearances.

---

## Key Business Rules

| Rule | Behaviour |
|---|---|
| Football ID | Generated once at registration, never changed, never reused |
| Assessment write | Always creates a new record — no in-place editing |
| Training → Skills | Training attendance has zero effect on skill scores |
| Membership history | Closing a membership sets `left_at`; old record is preserved |
| Team averages | Computed dynamically from the latest assessment per player on the team |
| Goal lifecycle | `active` → `achieved` or `dropped`; no deletion |
