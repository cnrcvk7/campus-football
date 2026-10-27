import { useReducer, useCallback } from 'react'
import type {
  GameFormat,
  StarterSlot,
  BenchSlot,
  DrawingElement,
  LineupStatus,
} from '../types/tactics'
import { FORMATION_TEMPLATES, getDefaultFormation } from '../constants/formations'
import { clampCoord } from '../utils/pitchCoords'

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface LineupState {
  gameFormat: GameFormat
  formation: string
  starters: StarterSlot[]
  bench: BenchSlot[]
  drawing: DrawingElement[]
  version: number
  status: LineupStatus
  isDirty: boolean
}

export interface UndoableLineupState {
  past: LineupState[]
  present: LineupState
  future: LineupState[]
}

const MAX_HISTORY = 50

export function createEmptyState(format: GameFormat = 11): LineupState {
  return {
    gameFormat: format,
    formation: getDefaultFormation(format),
    starters: [],
    bench: [],
    drawing: [],
    version: 0,
    status: 'DRAFT',
    isDirty: false,
  }
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type LineupAction =
  | { type: 'SET_FORMAT'; format: GameFormat }
  | { type: 'APPLY_FORMATION'; formation: string }
  | { type: 'PLACE_PLAYER'; playerId: string; x: number; y: number; positionCode: string }
  | { type: 'MOVE_PLAYER'; playerId: string; x: number; y: number }
  | { type: 'SWAP_PLAYERS'; playerA: string; playerB: string }
  | { type: 'SEND_TO_BENCH'; playerId: string }
  | { type: 'REMOVE_FROM_LINEUP'; playerId: string }
  | { type: 'REORDER_BENCH'; playerId: string; direction: 'up' | 'down' }
  | { type: 'SET_POSITION_CODE'; playerId: string; positionCode: string }
  | { type: 'PLACE_ON_BENCH'; playerId: string }
  | { type: 'LOAD_SERVER_STATE'; state: LineupState }
  | { type: 'RESET'; serverState: LineupState }
  | { type: 'MARK_SAVED'; version: number }
  | { type: 'UNDO' }
  | { type: 'REDO' }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export { clampCoord }

function renumberBench(bench: BenchSlot[]): BenchSlot[] {
  return bench.map((b, i) => ({ ...b, order: i }))
}

// ---------------------------------------------------------------------------
// Core reducer (no undo/redo wrapping)
// ---------------------------------------------------------------------------

export function lineupReducer(state: LineupState, action: LineupAction): LineupState {
  switch (action.type) {
    case 'SET_FORMAT': {
      const newFormation = getDefaultFormation(action.format)
      const template = FORMATION_TEMPLATES[newFormation]
      // Move all current starters that overflow the new format to the bench
      const maxStarters = action.format
      const keptStarters = state.starters.slice(0, maxStarters)
      const overflow = state.starters.slice(maxStarters)
      // Snap kept starters to template positions
      const snapped = keptStarters.map((s, i) => ({
        ...s,
        x: template[i]?.x ?? s.x,
        y: template[i]?.y ?? s.y,
        positionCode: template[i]?.positionCode ?? s.positionCode,
      }))
      const newBench = renumberBench([
        ...overflow.map((s) => ({ playerId: s.playerId, order: 0 })),
        ...state.bench,
      ])
      return {
        ...state,
        gameFormat: action.format,
        formation: newFormation,
        starters: snapped,
        bench: newBench,
        isDirty: true,
      }
    }

    case 'APPLY_FORMATION': {
      const template = FORMATION_TEMPLATES[action.formation]
      if (!template) return state

      // Snap existing starters to new template positions.
      // Starters that fit stay on the pitch; overflow goes to bench.
      const maxSlots = template.length
      const keptStarters = state.starters.slice(0, maxSlots)
      const overflow = state.starters.slice(maxSlots)

      const snapped = keptStarters.map((s, i) => ({
        ...s,
        x: template[i].x,
        y: template[i].y,
        positionCode: template[i].positionCode,
      }))

      const newBench = renumberBench([
        ...overflow.map((s) => ({ playerId: s.playerId, order: 0 })),
        ...state.bench,
      ])

      return {
        ...state,
        formation: action.formation,
        starters: snapped,
        bench: newBench,
        isDirty: true,
      }
    }

    case 'PLACE_PLAYER': {
      // Remove from bench if present
      const bench = state.bench.filter((b) => b.playerId !== action.playerId)
      // Remove from starters if already there (repositioning)
      const starters = state.starters.filter((s) => s.playerId !== action.playerId)
      return {
        ...state,
        starters: [
          ...starters,
          {
            playerId: action.playerId,
            x: clampCoord(action.x),
            y: clampCoord(action.y),
            positionCode: action.positionCode,
          },
        ],
        bench: renumberBench(bench),
        isDirty: true,
      }
    }

    case 'MOVE_PLAYER': {
      return {
        ...state,
        starters: state.starters.map((s) =>
          s.playerId === action.playerId
            ? { ...s, x: clampCoord(action.x), y: clampCoord(action.y) }
            : s,
        ),
        isDirty: true,
      }
    }

    case 'SWAP_PLAYERS': {
      const a = state.starters.find((s) => s.playerId === action.playerA)
      const b = state.starters.find((s) => s.playerId === action.playerB)
      if (!a || !b) return state
      return {
        ...state,
        starters: state.starters.map((s) => {
          if (s.playerId === action.playerA) return { ...s, x: b.x, y: b.y, positionCode: b.positionCode }
          if (s.playerId === action.playerB) return { ...s, x: a.x, y: a.y, positionCode: a.positionCode }
          return s
        }),
        isDirty: true,
      }
    }

    case 'SEND_TO_BENCH': {
      const starter = state.starters.find((s) => s.playerId === action.playerId)
      if (!starter) return state
      return {
        ...state,
        starters: state.starters.filter((s) => s.playerId !== action.playerId),
        bench: renumberBench([...state.bench, { playerId: action.playerId, order: 0 }]),
        isDirty: true,
      }
    }

    case 'REMOVE_FROM_LINEUP': {
      return {
        ...state,
        starters: state.starters.filter((s) => s.playerId !== action.playerId),
        bench: renumberBench(state.bench.filter((b) => b.playerId !== action.playerId)),
        isDirty: true,
      }
    }

    case 'REORDER_BENCH': {
      const idx = state.bench.findIndex((b) => b.playerId === action.playerId)
      if (idx < 0) return state
      const newIdx = action.direction === 'up' ? idx - 1 : idx + 1
      if (newIdx < 0 || newIdx >= state.bench.length) return state
      const newBench = [...state.bench]
      ;[newBench[idx], newBench[newIdx]] = [newBench[newIdx], newBench[idx]]
      return { ...state, bench: renumberBench(newBench), isDirty: true }
    }

    case 'SET_POSITION_CODE': {
      return {
        ...state,
        starters: state.starters.map((s) =>
          s.playerId === action.playerId ? { ...s, positionCode: action.positionCode } : s,
        ),
        isDirty: true,
      }
    }

    case 'PLACE_ON_BENCH': {
      // Remove from starters if present
      const starters = state.starters.filter((s) => s.playerId !== action.playerId)
      // Don't duplicate on bench
      if (state.bench.some((b) => b.playerId === action.playerId)) {
        return { ...state, starters, isDirty: true }
      }
      return {
        ...state,
        starters,
        bench: renumberBench([...state.bench, { playerId: action.playerId, order: 0 }]),
        isDirty: true,
      }
    }

    case 'LOAD_SERVER_STATE':
      return { ...action.state, isDirty: false }

    case 'RESET':
      return { ...action.serverState, isDirty: false }

    case 'MARK_SAVED':
      return { ...state, version: action.version, isDirty: false }

    default:
      return state
  }
}

// ---------------------------------------------------------------------------
// Undo/redo wrapper
// ---------------------------------------------------------------------------

const NON_UNDOABLE: LineupAction['type'][] = [
  'LOAD_SERVER_STATE', 'RESET', 'MARK_SAVED', 'UNDO', 'REDO',
]

export function undoableReducer(
  state: UndoableLineupState,
  action: LineupAction,
): UndoableLineupState {
  if (action.type === 'UNDO') {
    if (state.past.length === 0) return state
    const previous = state.past[state.past.length - 1]
    return {
      past: state.past.slice(0, -1),
      present: previous,
      future: [state.present, ...state.future],
    }
  }

  if (action.type === 'REDO') {
    if (state.future.length === 0) return state
    const next = state.future[0]
    return {
      past: [...state.past, state.present],
      present: next,
      future: state.future.slice(1),
    }
  }

  const newPresent = lineupReducer(state.present, action)
  if (newPresent === state.present) return state

  if (NON_UNDOABLE.includes(action.type)) {
    return { past: [], present: newPresent, future: [] }
  }

  const newPast = [...state.past, state.present].slice(-MAX_HISTORY)
  return { past: newPast, present: newPresent, future: [] }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useLineupReducer(initialFormat: GameFormat = 11) {
  const [state, dispatch] = useReducer(undoableReducer, {
    past: [],
    present: createEmptyState(initialFormat),
    future: [],
  })

  const canUndo = state.past.length > 0
  const canRedo = state.future.length > 0

  const undo = useCallback(() => dispatch({ type: 'UNDO' }), [])
  const redo = useCallback(() => dispatch({ type: 'REDO' }), [])

  return { state: state.present, dispatch, canUndo, canRedo, undo, redo }
}
