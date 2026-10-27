import { describe, it, expect } from 'vitest'
import {
  boardReducer,
  undoableBoardReducer,
  createEmptyBoardState,
  type BoardState,
  type UndoableBoardState,
  type BoardAction,
} from './useBoardReducer'

function makeState(overrides?: Partial<BoardState>): BoardState {
  return { ...createEmptyBoardState(11), ...overrides }
}

function makeUndoable(state: BoardState): UndoableBoardState {
  return { past: [], present: state, future: [] }
}

// ---------------------------------------------------------------------------
// Token actions
// ---------------------------------------------------------------------------

describe('boardReducer — tokens', () => {
  it('ADD_TOKEN appends and clamps', () => {
    const state = makeState()
    const result = boardReducer(state, {
      type: 'ADD_TOKEN',
      token: { id: 'h1', kind: 'home', x: 1.5, y: -0.2 },
    })
    expect(result.tokens).toHaveLength(1)
    expect(result.tokens[0].x).toBe(1)
    expect(result.tokens[0].y).toBe(0)
    expect(result.isDirty).toBe(true)
  })

  it('MOVE_TOKEN updates and clamps', () => {
    const state = makeState({
      tokens: [{ id: 'h1', kind: 'home', x: 0.5, y: 0.5 }],
    })
    const result = boardReducer(state, { type: 'MOVE_TOKEN', id: 'h1', x: 0.8, y: 0.3 })
    expect(result.tokens[0].x).toBe(0.8)
    expect(result.tokens[0].y).toBe(0.3)
  })

  it('DELETE_TOKEN removes', () => {
    const state = makeState({
      tokens: [
        { id: 'h1', kind: 'home', x: 0.5, y: 0.5 },
        { id: 'a1', kind: 'away', x: 0.3, y: 0.3 },
      ],
    })
    const result = boardReducer(state, { type: 'DELETE_TOKEN', id: 'h1' })
    expect(result.tokens).toHaveLength(1)
    expect(result.tokens[0].id).toBe('a1')
  })

  it('UPDATE_TOKEN_LABEL changes label', () => {
    const state = makeState({
      tokens: [{ id: 'h1', kind: 'home', x: 0.5, y: 0.5, label: '1' }],
    })
    const result = boardReducer(state, { type: 'UPDATE_TOKEN_LABEL', id: 'h1', label: '10' })
    expect(result.tokens[0].label).toBe('10')
  })
})

// ---------------------------------------------------------------------------
// Drawing actions
// ---------------------------------------------------------------------------

describe('boardReducer — drawing', () => {
  it('ADD_STROKE appends', () => {
    const state = makeState()
    const stroke = {
      id: 's1', type: 'freehand',
      points: [[0.1, 0.2], [0.3, 0.4]],
      color: 'white', width: 'md', dashed: false,
    }
    const result = boardReducer(state, { type: 'ADD_STROKE', element: stroke })
    expect(result.drawing).toHaveLength(1)
    expect(result.drawing[0].id).toBe('s1')
  })

  it('ADD_TEXT appends', () => {
    const state = makeState()
    const text = { id: 't1', type: 'text', at: [0.5, 0.5], text: 'Press', color: 'yellow' }
    const result = boardReducer(state, { type: 'ADD_TEXT', element: text })
    expect(result.drawing).toHaveLength(1)
  })

  it('MOVE_TEXT updates position', () => {
    const state = makeState({
      drawing: [{ id: 't1', type: 'text', at: [0.5, 0.5], text: 'Hi', color: 'white' }],
    })
    const result = boardReducer(state, { type: 'MOVE_TEXT', id: 't1', at: [0.7, 0.3] })
    expect(result.drawing[0].at).toEqual([0.7, 0.3])
  })

  it('EDIT_TEXT updates text content', () => {
    const state = makeState({
      drawing: [{ id: 't1', type: 'text', at: [0.5, 0.5], text: 'Old', color: 'white' }],
    })
    const result = boardReducer(state, { type: 'EDIT_TEXT', id: 't1', text: 'New' })
    expect(result.drawing[0].text).toBe('New')
  })

  it('DELETE_DRAWING removes', () => {
    const state = makeState({
      drawing: [
        { id: 's1', type: 'freehand', points: [[0, 0], [1, 1]], color: 'white', width: 'md', dashed: false },
        { id: 't1', type: 'text', at: [0.5, 0.5], text: 'Hi', color: 'white' },
      ],
    })
    const result = boardReducer(state, { type: 'DELETE_DRAWING', id: 's1' })
    expect(result.drawing).toHaveLength(1)
    expect(result.drawing[0].id).toBe('t1')
  })
})

// ---------------------------------------------------------------------------
// Board-level actions
// ---------------------------------------------------------------------------

describe('boardReducer — board-level', () => {
  it('SET_TITLE', () => {
    const result = boardReducer(makeState(), { type: 'SET_TITLE', title: 'Attack Plan' })
    expect(result.title).toBe('Attack Plan')
    expect(result.isDirty).toBe(true)
  })

  it('SET_FORMAT', () => {
    const result = boardReducer(makeState(), { type: 'SET_FORMAT', format: 7 })
    expect(result.gameFormat).toBe(7)
  })

  it('MARK_SAVED updates version and clears dirty', () => {
    const state = makeState({ isDirty: true, version: 1 })
    const result = boardReducer(state, { type: 'MARK_SAVED', version: 2 })
    expect(result.version).toBe(2)
    expect(result.isDirty).toBe(false)
  })

  it('LOAD_SERVER_STATE replaces everything', () => {
    const server: BoardState = {
      title: 'Server', gameFormat: 5, tokens: [], drawing: [],
      version: 3, isDirty: false,
    }
    const result = boardReducer(makeState({ isDirty: true }), { type: 'LOAD_SERVER_STATE', state: server })
    expect(result.title).toBe('Server')
    expect(result.version).toBe(3)
    expect(result.isDirty).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Undo/redo
// ---------------------------------------------------------------------------

describe('undoableBoardReducer', () => {
  it('UNDO restores previous state', () => {
    let us = makeUndoable(makeState())
    us = undoableBoardReducer(us, {
      type: 'ADD_TOKEN', token: { id: 'h1', kind: 'home', x: 0.5, y: 0.5 },
    })
    expect(us.present.tokens).toHaveLength(1)
    us = undoableBoardReducer(us, { type: 'UNDO' })
    expect(us.present.tokens).toHaveLength(0)
  })

  it('REDO re-applies', () => {
    let us = makeUndoable(makeState())
    us = undoableBoardReducer(us, {
      type: 'ADD_TOKEN', token: { id: 'h1', kind: 'home', x: 0.5, y: 0.5 },
    })
    us = undoableBoardReducer(us, { type: 'UNDO' })
    us = undoableBoardReducer(us, { type: 'REDO' })
    expect(us.present.tokens).toHaveLength(1)
  })

  it('UNDO is no-op when past is empty', () => {
    const us = makeUndoable(makeState())
    expect(undoableBoardReducer(us, { type: 'UNDO' })).toBe(us)
  })

  it('REDO is no-op when future is empty', () => {
    const us = makeUndoable(makeState())
    expect(undoableBoardReducer(us, { type: 'REDO' })).toBe(us)
  })

  it('new action clears future', () => {
    let us = makeUndoable(makeState())
    us = undoableBoardReducer(us, {
      type: 'ADD_TOKEN', token: { id: 'h1', kind: 'home', x: 0.5, y: 0.5 },
    })
    us = undoableBoardReducer(us, { type: 'UNDO' })
    expect(us.future).toHaveLength(1)
    us = undoableBoardReducer(us, {
      type: 'ADD_TOKEN', token: { id: 'h2', kind: 'away', x: 0.3, y: 0.3 },
    })
    expect(us.future).toHaveLength(0)
  })

  it('LOAD_SERVER_STATE clears history', () => {
    let us = makeUndoable(makeState())
    us = undoableBoardReducer(us, {
      type: 'ADD_TOKEN', token: { id: 'h1', kind: 'home', x: 0.5, y: 0.5 },
    })
    const server = createEmptyBoardState(5)
    us = undoableBoardReducer(us, { type: 'LOAD_SERVER_STATE', state: server })
    expect(us.past).toHaveLength(0)
    expect(us.future).toHaveLength(0)
  })

  it('caps history at 50', () => {
    let us = makeUndoable(makeState())
    for (let i = 0; i < 60; i++) {
      us = undoableBoardReducer(us, {
        type: 'ADD_TOKEN',
        token: { id: `t${i}`, kind: 'home', x: 0.5, y: 0.5 },
      } satisfies BoardAction)
    }
    expect(us.past.length).toBeLessThanOrEqual(50)
  })

  it('erase token is undoable', () => {
    let us = makeUndoable(makeState({
      tokens: [{ id: 'h1', kind: 'home', x: 0.5, y: 0.5 }],
    }))
    us = undoableBoardReducer(us, { type: 'DELETE_TOKEN', id: 'h1' })
    expect(us.present.tokens).toHaveLength(0)
    us = undoableBoardReducer(us, { type: 'UNDO' })
    expect(us.present.tokens).toHaveLength(1)
  })

  it('erase drawing is undoable', () => {
    let us = makeUndoable(makeState({
      drawing: [{ id: 's1', type: 'freehand', points: [[0, 0], [1, 1]], color: 'white', width: 'md', dashed: false }],
    }))
    us = undoableBoardReducer(us, { type: 'DELETE_DRAWING', id: 's1' })
    expect(us.present.drawing).toHaveLength(0)
    us = undoableBoardReducer(us, { type: 'UNDO' })
    expect(us.present.drawing).toHaveLength(1)
  })
})
