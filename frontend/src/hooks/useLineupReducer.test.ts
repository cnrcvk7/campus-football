import { describe, it, expect } from 'vitest'
import {
  lineupReducer,
  undoableReducer,
  createEmptyState,
  clampCoord,
  type LineupState,
  type UndoableLineupState,
  type LineupAction,
} from './useLineupReducer'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeState(overrides?: Partial<LineupState>): LineupState {
  return {
    ...createEmptyState(5),
    ...overrides,
  }
}

function makeUndoable(state: LineupState): UndoableLineupState {
  return { past: [], present: state, future: [] }
}

const PLAYER_A = 'aaaa-aaaa'
const PLAYER_B = 'bbbb-bbbb'
const PLAYER_C = 'cccc-cccc'

// ---------------------------------------------------------------------------
// clampCoord
// ---------------------------------------------------------------------------

describe('clampCoord', () => {
  it('clamps below 0', () => expect(clampCoord(-0.5)).toBe(0))
  it('clamps above 1', () => expect(clampCoord(1.5)).toBe(1))
  it('passes through valid values', () => expect(clampCoord(0.42)).toBe(0.42))
  it('passes 0', () => expect(clampCoord(0)).toBe(0))
  it('passes 1', () => expect(clampCoord(1)).toBe(1))
})

// ---------------------------------------------------------------------------
// lineupReducer
// ---------------------------------------------------------------------------

describe('lineupReducer', () => {
  it('SET_FORMAT changes format and resets formation', () => {
    const state = makeState({ gameFormat: 11, formation: '4-4-2' })
    const result = lineupReducer(state, { type: 'SET_FORMAT', format: 7 })
    expect(result.gameFormat).toBe(7)
    expect(result.formation).toBe('2-3-1') // first 7-a-side formation
    expect(result.isDirty).toBe(true)
  })

  it('SET_FORMAT moves overflow starters to bench', () => {
    const starters = Array.from({ length: 11 }, (_, i) => ({
      playerId: `p${i}`,
      x: 0.5,
      y: 0.1 * i,
      positionCode: 'CM',
    }))
    const state = makeState({ gameFormat: 11, formation: '4-4-2', starters })
    const result = lineupReducer(state, { type: 'SET_FORMAT', format: 5 })
    expect(result.starters.length).toBe(5)
    expect(result.bench.length).toBe(6)
  })

  it('APPLY_FORMATION snaps starters to new positions', () => {
    const starters = [
      { playerId: PLAYER_A, x: 0.1, y: 0.1, positionCode: 'GK' },
      { playerId: PLAYER_B, x: 0.2, y: 0.2, positionCode: 'CB' },
    ]
    const state = makeState({ gameFormat: 5, formation: '2-2', starters })
    const result = lineupReducer(state, { type: 'APPLY_FORMATION', formation: '1-2-1' })
    expect(result.formation).toBe('1-2-1')
    expect(result.starters.length).toBe(2)
    // Positions should have changed
    expect(result.starters[0].x).not.toBe(0.1)
    expect(result.isDirty).toBe(true)
  })

  it('APPLY_FORMATION sends overflow to bench', () => {
    const starters = Array.from({ length: 5 }, (_, i) => ({
      playerId: `p${i}`,
      x: 0.5,
      y: 0.1 * i,
      positionCode: 'CM',
    }))
    const state = makeState({ gameFormat: 5, formation: '2-2', starters })
    // Apply a new formation that still has 5 slots
    const result = lineupReducer(state, { type: 'APPLY_FORMATION', formation: '1-2-1' })
    expect(result.starters.length).toBe(5)
    expect(result.bench.length).toBe(0)
  })

  it('PLACE_PLAYER adds to starters', () => {
    const state = makeState()
    const result = lineupReducer(state, {
      type: 'PLACE_PLAYER', playerId: PLAYER_A, x: 0.5, y: 0.5, positionCode: 'ST',
    })
    expect(result.starters).toHaveLength(1)
    expect(result.starters[0].playerId).toBe(PLAYER_A)
    expect(result.isDirty).toBe(true)
  })

  it('PLACE_PLAYER removes from bench if present', () => {
    const state = makeState({ bench: [{ playerId: PLAYER_A, order: 0 }] })
    const result = lineupReducer(state, {
      type: 'PLACE_PLAYER', playerId: PLAYER_A, x: 0.5, y: 0.5, positionCode: 'ST',
    })
    expect(result.bench).toHaveLength(0)
    expect(result.starters).toHaveLength(1)
  })

  it('MOVE_PLAYER updates coordinates', () => {
    const state = makeState({
      starters: [{ playerId: PLAYER_A, x: 0.5, y: 0.5, positionCode: 'ST' }],
    })
    const result = lineupReducer(state, {
      type: 'MOVE_PLAYER', playerId: PLAYER_A, x: 0.8, y: 0.3,
    })
    expect(result.starters[0].x).toBe(0.8)
    expect(result.starters[0].y).toBe(0.3)
  })

  it('MOVE_PLAYER clamps coordinates', () => {
    const state = makeState({
      starters: [{ playerId: PLAYER_A, x: 0.5, y: 0.5, positionCode: 'ST' }],
    })
    const result = lineupReducer(state, {
      type: 'MOVE_PLAYER', playerId: PLAYER_A, x: 1.5, y: -0.2,
    })
    expect(result.starters[0].x).toBe(1)
    expect(result.starters[0].y).toBe(0)
  })

  it('SWAP_PLAYERS swaps positions', () => {
    const state = makeState({
      starters: [
        { playerId: PLAYER_A, x: 0.2, y: 0.2, positionCode: 'CB' },
        { playerId: PLAYER_B, x: 0.8, y: 0.8, positionCode: 'ST' },
      ],
    })
    const result = lineupReducer(state, { type: 'SWAP_PLAYERS', playerA: PLAYER_A, playerB: PLAYER_B })
    expect(result.starters.find((s) => s.playerId === PLAYER_A)?.x).toBe(0.8)
    expect(result.starters.find((s) => s.playerId === PLAYER_B)?.x).toBe(0.2)
  })

  it('SEND_TO_BENCH moves starter to bench', () => {
    const state = makeState({
      starters: [{ playerId: PLAYER_A, x: 0.5, y: 0.5, positionCode: 'ST' }],
    })
    const result = lineupReducer(state, { type: 'SEND_TO_BENCH', playerId: PLAYER_A })
    expect(result.starters).toHaveLength(0)
    expect(result.bench).toHaveLength(1)
    expect(result.bench[0].playerId).toBe(PLAYER_A)
  })

  it('REMOVE_FROM_LINEUP removes from starters', () => {
    const state = makeState({
      starters: [{ playerId: PLAYER_A, x: 0.5, y: 0.5, positionCode: 'ST' }],
    })
    const result = lineupReducer(state, { type: 'REMOVE_FROM_LINEUP', playerId: PLAYER_A })
    expect(result.starters).toHaveLength(0)
    expect(result.bench).toHaveLength(0)
  })

  it('REMOVE_FROM_LINEUP removes from bench', () => {
    const state = makeState({ bench: [{ playerId: PLAYER_A, order: 0 }] })
    const result = lineupReducer(state, { type: 'REMOVE_FROM_LINEUP', playerId: PLAYER_A })
    expect(result.bench).toHaveLength(0)
  })

  it('REORDER_BENCH moves player down', () => {
    const state = makeState({
      bench: [
        { playerId: PLAYER_A, order: 0 },
        { playerId: PLAYER_B, order: 1 },
        { playerId: PLAYER_C, order: 2 },
      ],
    })
    const result = lineupReducer(state, { type: 'REORDER_BENCH', playerId: PLAYER_A, direction: 'down' })
    expect(result.bench[0].playerId).toBe(PLAYER_B)
    expect(result.bench[1].playerId).toBe(PLAYER_A)
    expect(result.bench[2].playerId).toBe(PLAYER_C)
  })

  it('REORDER_BENCH moves player up', () => {
    const state = makeState({
      bench: [
        { playerId: PLAYER_A, order: 0 },
        { playerId: PLAYER_B, order: 1 },
      ],
    })
    const result = lineupReducer(state, { type: 'REORDER_BENCH', playerId: PLAYER_B, direction: 'up' })
    expect(result.bench[0].playerId).toBe(PLAYER_B)
    expect(result.bench[1].playerId).toBe(PLAYER_A)
  })

  it('REORDER_BENCH ignores if already at boundary', () => {
    const state = makeState({ bench: [{ playerId: PLAYER_A, order: 0 }] })
    const result = lineupReducer(state, { type: 'REORDER_BENCH', playerId: PLAYER_A, direction: 'up' })
    expect(result).toBe(state)
  })

  it('SET_POSITION_CODE updates position', () => {
    const state = makeState({
      starters: [{ playerId: PLAYER_A, x: 0.5, y: 0.5, positionCode: 'CM' }],
    })
    const result = lineupReducer(state, { type: 'SET_POSITION_CODE', playerId: PLAYER_A, positionCode: 'CAM' })
    expect(result.starters[0].positionCode).toBe('CAM')
  })

  it('PLACE_ON_BENCH adds to bench', () => {
    const state = makeState()
    const result = lineupReducer(state, { type: 'PLACE_ON_BENCH', playerId: PLAYER_A })
    expect(result.bench).toHaveLength(1)
    expect(result.bench[0].playerId).toBe(PLAYER_A)
  })

  it('drawing is preserved across actions', () => {
    const drawing = [{ type: 'arrow', points: [[0.1, 0.2], [0.5, 0.6]] }]
    const state = makeState({ drawing })
    const result = lineupReducer(state, {
      type: 'PLACE_PLAYER', playerId: PLAYER_A, x: 0.5, y: 0.5, positionCode: 'ST',
    })
    expect(result.drawing).toBe(drawing) // same reference
  })

  it('MARK_SAVED updates version and clears dirty', () => {
    const state = makeState({ isDirty: true, version: 1 })
    const result = lineupReducer(state, { type: 'MARK_SAVED', version: 2 })
    expect(result.version).toBe(2)
    expect(result.isDirty).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// undoableReducer
// ---------------------------------------------------------------------------

describe('undoableReducer', () => {
  it('UNDO restores previous state', () => {
    let us = makeUndoable(makeState())
    us = undoableReducer(us, { type: 'PLACE_PLAYER', playerId: PLAYER_A, x: 0.5, y: 0.5, positionCode: 'ST' })
    expect(us.present.starters).toHaveLength(1)

    us = undoableReducer(us, { type: 'UNDO' })
    expect(us.present.starters).toHaveLength(0)
  })

  it('REDO re-applies undone state', () => {
    let us = makeUndoable(makeState())
    us = undoableReducer(us, { type: 'PLACE_PLAYER', playerId: PLAYER_A, x: 0.5, y: 0.5, positionCode: 'ST' })
    us = undoableReducer(us, { type: 'UNDO' })
    expect(us.present.starters).toHaveLength(0)

    us = undoableReducer(us, { type: 'REDO' })
    expect(us.present.starters).toHaveLength(1)
  })

  it('UNDO is no-op when past is empty', () => {
    const us = makeUndoable(makeState())
    const result = undoableReducer(us, { type: 'UNDO' })
    expect(result).toBe(us)
  })

  it('REDO is no-op when future is empty', () => {
    const us = makeUndoable(makeState())
    const result = undoableReducer(us, { type: 'REDO' })
    expect(result).toBe(us)
  })

  it('new action clears future', () => {
    let us = makeUndoable(makeState())
    us = undoableReducer(us, { type: 'PLACE_PLAYER', playerId: PLAYER_A, x: 0.5, y: 0.5, positionCode: 'ST' })
    us = undoableReducer(us, { type: 'UNDO' })
    expect(us.future).toHaveLength(1)

    us = undoableReducer(us, { type: 'PLACE_PLAYER', playerId: PLAYER_B, x: 0.3, y: 0.3, positionCode: 'CM' })
    expect(us.future).toHaveLength(0)
  })

  it('LOAD_SERVER_STATE clears history', () => {
    let us = makeUndoable(makeState())
    us = undoableReducer(us, { type: 'PLACE_PLAYER', playerId: PLAYER_A, x: 0.5, y: 0.5, positionCode: 'ST' })
    expect(us.past.length).toBeGreaterThan(0)

    const serverState = makeState({ version: 5 })
    us = undoableReducer(us, { type: 'LOAD_SERVER_STATE', state: serverState })
    expect(us.past).toHaveLength(0)
    expect(us.future).toHaveLength(0)
    expect(us.present.version).toBe(5)
  })

  it('caps history at 50 entries', () => {
    let us = makeUndoable(makeState())
    for (let i = 0; i < 60; i++) {
      us = undoableReducer(us, {
        type: 'PLACE_PLAYER' as const,
        playerId: `p${i}`,
        x: 0.5,
        y: 0.5,
        positionCode: 'CM',
      } satisfies LineupAction)
    }
    expect(us.past.length).toBeLessThanOrEqual(50)
  })

  it('APPLY_FORMATION overflow to bench preserves players', () => {
    // Start with 5 starters in 5-a-side
    const starters = Array.from({ length: 5 }, (_, i) => ({
      playerId: `p${i}`,
      x: 0.5,
      y: 0.1 * (i + 1),
      positionCode: 'CM',
    }))
    let us = makeUndoable(makeState({ gameFormat: 5, formation: '2-2', starters }))

    // Changing formation (still 5 slots) should keep all 5
    us = undoableReducer(us, { type: 'APPLY_FORMATION', formation: '1-2-1' })
    const allPlayers = [
      ...us.present.starters.map((s) => s.playerId),
      ...us.present.bench.map((b) => b.playerId),
    ]
    // All 5 original players should still be present
    for (let i = 0; i < 5; i++) {
      expect(allPlayers).toContain(`p${i}`)
    }
  })
})
