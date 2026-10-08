# Product Specification — Campus Football

## Vision

Campus Football is a player-centered football development platform. Its defining characteristic is that the **Player** is the primary entity — not the academy, not the team, not the coach. A player's entire development history, identity, and data follow them across every academy and team they ever join.

## Core Principles

1. **Player-first identity** — Every player has a permanent, unique Football ID that never changes.
2. **Persistent history** — Academy memberships, team assignments, assessments, and training records are never deleted or overwritten.
3. **Coach assessments are separate from training** — Attending a training session does not automatically modify skill scores. Only explicit coach assessments update development data.
4. **Calculated, not stored aggregates** — Team averages and comparisons are computed at query time for the MVP, not stored as database fields.
5. **Modular and extensible** — Each domain (players, academies, teams, training, assessments) is a separate application that can evolve independently.

---

## User Roles (MVP)

| Role | Description |
|---|---|
| **Player** | The primary subject. Can view their own profile and development data. |
| **Parent** | Linked to a player. Can view the player's data on their behalf. |
| **Coach** | Assigned to a team. Can record attendance, write assessments, and set goals. |
| **Academy Admin** | Manages the academy's players, teams, and coaches. |

> Authentication and role-based access control will be implemented in the next phase after the foundation is stable.

---

## MVP Feature Set

### Player Profile
- Permanent Football ID (system-generated, immutable)
- Personal information (name, date of birth, position, preferred foot)
- Profile photo

### Academy & Team History
- A player can be a member of multiple academies over their lifetime
- Within each academy, a player can be assigned to multiple teams over time
- All historical memberships are preserved with start/end dates

### Development Tracking (four pillars)
- **Technical**: Ball control, passing, shooting, dribbling, heading, etc.
- **Tactical**: Positioning, decision-making, pressing, off-ball movement, etc.
- **Physical**: Speed, strength, endurance, agility, etc.
- **Mental**: Concentration, confidence, leadership, work ethic, etc.

### Assessments
- Coaches submit formal assessments with scores across all pillars
- Each assessment is timestamped and linked to the coach who submitted it
- Assessment history is cumulative and never overwritten

### Training & Attendance
- Training sessions are logged per team
- Attendance is tracked per player per session
- Training records are informational — they do not trigger skill score changes

### Development Goals
- Coaches can set development goals for individual players
- Goals have a status (active, achieved, dropped) and a target date
- Players can view their own goals

### Physical Measurements
- Height, weight, and other physical metrics tracked over time
- Full measurement history preserved

### Match Statistics
- Match logs per team
- Player statistics per match (goals, assists, minutes played, etc.)

### Monthly Progress Reports
- Summaries of assessments, attendance, and goals over a calendar month

### Player Comparisons (Team Averages)
- A player's assessment scores shown against their current team's average
- Averages computed dynamically — not stored

---

## Out of Scope for MVP

- Football ID portability across academies (cross-academy identity)
- Video analysis
- Scouting and recruitment tools
- AI coach assistant
- Mobile application
- Advanced analytics and dashboards
- Payment or subscription management
