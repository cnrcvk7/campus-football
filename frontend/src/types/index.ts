// ---------------------------------------------------------------------------
// User / Auth
// ---------------------------------------------------------------------------

export interface AuthTokens {
  access: string
  refresh: string
}

// ---------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------

export interface Player {
  id: string
  football_id: string
  first_name: string
  last_name: string
  date_of_birth: string
  gender: string
  preferred_position: string | null
  jersey_number: number | null
  profile_photo_url: string
  created_at: string
  updated_at: string
}

export interface PlayerCreate {
  first_name: string
  last_name: string
  date_of_birth: string
  gender: string
  preferred_position?: string
  jersey_number?: number | null
  profile_photo_url?: string
}

export interface PlayerUpdate {
  first_name?: string
  last_name?: string
  date_of_birth?: string
  gender?: string
  preferred_position?: string
  jersey_number?: number | null
  profile_photo_url?: string
}

// ---------------------------------------------------------------------------
// Memberships / History
// ---------------------------------------------------------------------------

export interface AcademySummary {
  id: string
  name: string
  city: string
  country: string
}

export interface TeamSummary {
  id: string
  name: string
  age_group: string | null
  gender: string | null
  season: string | null
  academy: string
  academy_name: string
}

export interface AcademyMembership {
  id: string
  academy: AcademySummary
  joined_at: string
  left_at: string | null
  status: 'active' | 'left'
}

export interface TeamMembership {
  id: string
  team: TeamSummary
  joined_at: string
  left_at: string | null
  status: 'active' | 'left'
}

export interface PlayerHistory {
  academy_history: AcademyMembership[]
  team_history: TeamMembership[]
}

// ---------------------------------------------------------------------------
// Development — Assessments
// ---------------------------------------------------------------------------

export type SkillCategory = 'TECHNICAL' | 'TACTICAL' | 'PHYSICAL' | 'MENTAL'

export interface AssessmentItem {
  id: string
  skill: string        // UUID FK
  skill_name: string
  skill_category: SkillCategory
  score: number
  comment: string
}

export interface Assessment {
  id: string
  player: string
  coach: string
  coach_name: string
  assessment_date: string
  overall_comment: string
  items: AssessmentItem[]
  created_at: string
}

// ---------------------------------------------------------------------------
// Development — Goals
// ---------------------------------------------------------------------------

export interface DevelopmentGoal {
  id: string
  player: string
  skill: string | null
  skill_name: string | null
  title: string
  description: string
  target_value: string | null
  current_value: string | null
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED'
  start_date: string
  target_date: string | null
  completed_at: string | null
  created_by: string
  created_at: string
  updated_at: string
}

// ---------------------------------------------------------------------------
// Development — Physical Measurements
// ---------------------------------------------------------------------------

export interface PhysicalMeasurement {
  id: string
  player: string
  measurement_date: string
  height_cm: string | null
  weight_kg: string | null
  body_fat_percentage: string | null
  sprint_time_seconds: string | null
  notes: string
  created_at: string
}

// ---------------------------------------------------------------------------
// Development Timeline
// ---------------------------------------------------------------------------

export interface DevelopmentTimeline {
  assessments: Assessment[]
  goals: DevelopmentGoal[]
  measurements: PhysicalMeasurement[]
}

// ---------------------------------------------------------------------------
// Matches
// ---------------------------------------------------------------------------

export type MatchResult = 'WIN' | 'DRAW' | 'LOSS'

export interface PlayerMatchStats {
  id: string
  match: string
  match_date: string
  opponent: string
  home_away: 'HOME' | 'AWAY'
  team_score: number | null
  opponent_score: number | null
  result: MatchResult | null
  score_display: string | null
  competition: string
  venue: string
  started: boolean
  minutes_played: number
  goals: number
  assists: number
  shots: number
  shots_on_target: number
  passes_attempted: number
  passes_completed: number
  key_passes: number
  dribbles: number
  tackles: number
  interceptions: number
  yellow_cards: number
  red_cards: number
  rating: string | null
  coach_comment: string
}

export interface MatchHistory {
  matches: PlayerMatchStats[]
}

export interface MatchSummary {
  matches_played: number
  starts: number
  total_minutes: number
  goals: number
  assists: number
  average_rating: string | null
  total_shots: number
  total_passes_completed: number
  total_dribbles: number
  total_tackles: number
  yellow_cards: number
  red_cards: number
}

// ---------------------------------------------------------------------------
// Training
// ---------------------------------------------------------------------------

export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED'

export interface FocusSkill {
  id: string
  name: string
  category: SkillCategory
}

export interface TrainingSessionSummary {
  id: string
  title: string
  training_date: string
  location: string
  academy: string
  academy_name: string
  team: string | null
  team_name: string | null
  focus_skills: FocusSkill[]
  attendance_status: AttendanceStatus | null
  attendance_notes: string
}

export interface TrainingHistory {
  sessions: TrainingSessionSummary[]
}
