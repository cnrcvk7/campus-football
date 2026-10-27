// ---------------------------------------------------------------------------
// Backend GET response shapes
// ---------------------------------------------------------------------------

export type LineupStatus = 'DRAFT' | 'PUBLISHED'
export type SlotRole = 'STARTER' | 'SUBSTITUTE'
export type GameFormat = 11 | 9 | 7 | 5

export interface LineupSlotRead {
  id: string
  player_id: string
  first_name: string
  last_name: string
  preferred_position: string
  jersey_number: number | null
  role: SlotRole
  x: string | null   // decimal string from DRF e.g. "0.5000"
  y: string | null
  position_code: string
  order: number
}

export interface LineupRead {
  id: string
  match: string
  game_format: GameFormat
  formation: string
  status: LineupStatus
  published_at: string | null
  drawing: DrawingElement[]
  version: number
  slots: LineupSlotRead[]
  created_at: string
  updated_at: string
}

// ---------------------------------------------------------------------------
// Backend PUT request shapes
// ---------------------------------------------------------------------------

export interface SlotWrite {
  player: string
  role: SlotRole
  x?: string | null
  y?: string | null
  position_code?: string
  order?: number
}

export interface LineupWrite {
  game_format: GameFormat
  formation: string
  slots: SlotWrite[]
  drawing: DrawingElement[]
  version: number
}

// ---------------------------------------------------------------------------
// Drawing (pass-through for PR 3)
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DrawingElement = Record<string, any>

// ---------------------------------------------------------------------------
// Version conflict response
// ---------------------------------------------------------------------------

export interface VersionConflictResponse {
  detail: string
  code: 'version_conflict'
  current_version: number
}

// ---------------------------------------------------------------------------
// Editor state types
// ---------------------------------------------------------------------------

export interface StarterSlot {
  playerId: string
  x: number
  y: number
  positionCode: string
}

export interface BenchSlot {
  playerId: string
  order: number
}

export interface SquadPlayer {
  id: string
  first_name: string
  last_name: string
  preferred_position: string
  jersey_number: number | null
}

// ---------------------------------------------------------------------------
// Summary endpoint (GET /api/lineups/summary/)
// ---------------------------------------------------------------------------

export interface LineupSummary {
  match_id: string
  status: LineupStatus
  version: number
  updated_at: string
}
