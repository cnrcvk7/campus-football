/**
 * State management for a TacticBoard: tokens, drawing, undo/redo.
 *
 * All coordinates are CANONICAL (cx, cy) — the display mapping lives
 * in pitchCoords.ts and is applied only at render time.
 */

import { useReducer, useCallback } from 'react'
import type {
  GameFormat,
  BoardToken,
  DrawingElement,
} from '../types/tactics'
import { clampCoord } from '../utils/pitchCoords'

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface BoardState {
  title: string
  gameFormat: GameFormat
  tokens: BoardToken[]
  drawing: DrawingElement[]
  version: number
  isDirty: boolean
}

export interface UndoableBoardState {
  past: BoardState[]
  present: BoardState
  future: BoardState[]
}

const MAX_HISTORY = 50

export function createEmptyBoardState(format: GameFormat = 11): BoardState {
  return {
    title: '',
    gameFormat: format,
    tokens: [],
    drawing: [],
    version: 0,
    isDirty: false,
  }
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type BoardAction =
  // Tokens
  | { type: 'ADD_TOKEN'; token: BoardToken }
  | { type: 'MOVE_TOKEN'; id: string; x: number; y: number }
  | { type: 'DELETE_TOKEN'; id: string }
  | { type: 'UPDATE_TOKEN_LABEL'; id: string; label: string }
  // Drawing
  | { type: 'ADD_STROKE'; element: DrawingElement }
  | { type: 'ADD_TEXT'; element: DrawingElement }
  | { type: 'MOVE_TEXT'; id: string; at: [number, number] }
  | { type: 'EDIT_TEXT'; id: string; text: string }
  | { type: 'DELETE_DRAWING'; id: string }
  // Board-level
  | { type: 'SET_TITLE'; title: string }
  | { type: 'SET_FORMAT'; format: GameFormat }
  | { type: 'LOAD_SERVER_STATE'; state: BoardState }
  | { type: 'MARK_SAVED'; version: number }
  | { type: 'UNDO' }
  | { type: 'REDO' }

// ---------------------------------------------------------------------------
// Core reducer
// ---------------------------------------------------------------------------

export function boardReducer(state: BoardState, action: BoardAction): BoardState {
  switch (action.type) {
    case 'ADD_TOKEN':
      return {
        ...state,
        tokens: [...state.tokens, {
          ...action.token,
          x: clampCoord(action.token.x),
          y: clampCoord(action.token.y),
        }],
        isDirty: true,
      }

    case 'MOVE_TOKEN':
      return {
        ...state,
        tokens: state.tokens.map((t) =>
          t.id === action.id ? { ...t, x: clampCoord(action.x), y: clampCoord(action.y) } : t,
        ),
        isDirty: true,
      }

    case 'DELETE_TOKEN':
      return {
        ...state,
        tokens: state.tokens.filter((t) => t.id !== action.id),
        isDirty: true,
      }

    case 'UPDATE_TOKEN_LABEL':
      return {
        ...state,
        tokens: state.tokens.map((t) =>
          t.id === action.id ? { ...t, label: action.label } : t,
        ),
        isDirty: true,
      }

    case 'ADD_STROKE':
      return {
        ...state,
        drawing: [...state.drawing, action.element],
        isDirty: true,
      }

    case 'ADD_TEXT':
      return {
        ...state,
        drawing: [...state.drawing, action.element],
        isDirty: true,
      }

    case 'MOVE_TEXT':
      return {
        ...state,
        drawing: state.drawing.map((d) =>
          d.id === action.id ? { ...d, at: action.at } : d,
        ),
        isDirty: true,
      }

    case 'EDIT_TEXT':
      return {
        ...state,
        drawing: state.drawing.map((d) =>
          d.id === action.id ? { ...d, text: action.text } : d,
        ),
        isDirty: true,
      }

    case 'DELETE_DRAWING':
      return {
        ...state,
        drawing: state.drawing.filter((d) => d.id !== action.id),
        isDirty: true,
      }

    case 'SET_TITLE':
      return { ...state, title: action.title, isDirty: true }

    case 'SET_FORMAT':
      return { ...state, gameFormat: action.format, isDirty: true }

    case 'LOAD_SERVER_STATE':
      return { ...action.state, isDirty: false }

    case 'MARK_SAVED':
      return { ...state, version: action.version, isDirty: false }

    default:
      return state
  }
}

// ---------------------------------------------------------------------------
// Undo/redo wrapper
// ---------------------------------------------------------------------------

const NON_UNDOABLE: BoardAction['type'][] = ['LOAD_SERVER_STATE', 'MARK_SAVED', 'UNDO', 'REDO']

export function undoableBoardReducer(
  state: UndoableBoardState,
  action: BoardAction,
): UndoableBoardState {
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

  const newPresent = boardReducer(state.present, action)
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

export function useBoardReducer(initialFormat: GameFormat = 11) {
  const [state, dispatch] = useReducer(undoableBoardReducer, {
    past: [],
    present: createEmptyBoardState(initialFormat),
    future: [],
  })

  const canUndo = state.past.length > 0
  const canRedo = state.future.length > 0
  const undo = useCallback(() => dispatch({ type: 'UNDO' }), [])
  const redo = useCallback(() => dispatch({ type: 'REDO' }), [])

  return { state: state.present, dispatch, canUndo, canRedo, undo, redo }
}
