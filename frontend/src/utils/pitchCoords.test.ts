import { describe, it, expect } from 'vitest'
import {
  canonicalToDisplay,
  displayToCanonical,
  svgToDisplay,
  clampCoord,
  FIELD_LEFT,
  FIELD_TOP,
  FIELD_W,
  FIELD_H,
} from './pitchCoords'
import { FORMATION_TEMPLATES } from '../constants/formations'

// ---------------------------------------------------------------------------
// clampCoord
// ---------------------------------------------------------------------------

describe('clampCoord', () => {
  it('clamps below 0', () => expect(clampCoord(-0.5)).toBe(0))
  it('clamps above 1', () => expect(clampCoord(1.5)).toBe(1))
  it('passes through 0.42', () => expect(clampCoord(0.42)).toBe(0.42))
  it('passes 0 exactly', () => expect(clampCoord(0)).toBe(0))
  it('passes 1 exactly', () => expect(clampCoord(1)).toBe(1))
})

// ---------------------------------------------------------------------------
// Round-trip conversion
// ---------------------------------------------------------------------------

describe('canonicalToDisplay / displayToCanonical', () => {
  const CASES = [
    [0, 0],
    [1, 1],
    [0.5, 0.5],
    [0.15, 0.22],
    [0.85, 0.78],
    [0, 1],
    [1, 0],
  ]

  it.each(CASES)('round-trip canonical(%f, %f) → display → canonical', (cx, cy) => {
    const { dx, dy } = canonicalToDisplay(cx, cy)
    const { cx: cx2, cy: cy2 } = displayToCanonical(dx, dy)
    expect(cx2).toBeCloseTo(cx, 10)
    expect(cy2).toBeCloseTo(cy, 10)
  })

  it('canonical origin (0,0) → display (0,0)', () => {
    const { dx, dy } = canonicalToDisplay(0, 0)
    expect(dx).toBe(0) // left of screen (own goal)
    expect(dy).toBe(0) // top of screen
  })

  it('canonical (1,1) → display (1,1)', () => {
    const { dx, dy } = canonicalToDisplay(1, 1)
    expect(dx).toBe(1)
    expect(dy).toBe(1)
  })

  it('dx = cy and dy = cx', () => {
    const { dx, dy } = canonicalToDisplay(0.3, 0.7)
    expect(dx).toBe(0.7)
    expect(dy).toBe(0.3)
  })
})

// ---------------------------------------------------------------------------
// svgToDisplay
// ---------------------------------------------------------------------------

describe('svgToDisplay', () => {
  it('field top-left maps to display (0, 0)', () => {
    const { dx, dy } = svgToDisplay(FIELD_LEFT, FIELD_TOP)
    expect(dx).toBeCloseTo(0, 10)
    expect(dy).toBeCloseTo(0, 10)
  })

  it('field bottom-right maps to display (1, 1)', () => {
    const { dx, dy } = svgToDisplay(FIELD_LEFT + FIELD_W, FIELD_TOP + FIELD_H)
    expect(dx).toBeCloseTo(1, 10)
    expect(dy).toBeCloseTo(1, 10)
  })

  it('field center maps to display (0.5, 0.5)', () => {
    const { dx, dy } = svgToDisplay(FIELD_LEFT + FIELD_W / 2, FIELD_TOP + FIELD_H / 2)
    expect(dx).toBeCloseTo(0.5, 10)
    expect(dy).toBeCloseTo(0.5, 10)
  })
})

// ---------------------------------------------------------------------------
// Formation orientation on horizontal pitch
// ---------------------------------------------------------------------------

describe('formation orientation (4-4-2 on horizontal pitch)', () => {
  const F442 = FORMATION_TEMPLATES['4-4-2']

  it('GK renders near the left edge (own goal)', () => {
    const gk = F442[0]
    expect(gk.positionCode).toBe('GK')
    const { dx } = canonicalToDisplay(gk.x, gk.y)
    // GK y=0.06 → dx=0.06, near left of screen
    expect(dx).toBeLessThan(0.15)
  })

  it('strikers render in the right half (opponent side)', () => {
    const strikers = F442.filter((s) => s.positionCode === 'ST')
    expect(strikers.length).toBe(2)
    for (const st of strikers) {
      const { dx } = canonicalToDisplay(st.x, st.y)
      // ST y=0.78 → dx=0.78, in the right half
      expect(dx).toBeGreaterThan(0.5)
    }
  })

  it('left back is near the top of the screen (coach\'s left when attacking right)', () => {
    const lb = F442.find((s) => s.positionCode === 'LB')!
    const { dy } = canonicalToDisplay(lb.x, lb.y)
    // LB x=0.15 → dy=0.15, near top
    expect(dy).toBeLessThan(0.3)
  })

  it('right back is near the bottom of the screen', () => {
    const rb = F442.find((s) => s.positionCode === 'RB')!
    const { dy } = canonicalToDisplay(rb.x, rb.y)
    // RB x=0.85 → dy=0.85, near bottom
    expect(dy).toBeGreaterThan(0.7)
  })

  it('center midfielder renders in the middle area', () => {
    const cms = F442.filter((s) => s.positionCode === 'CM')
    expect(cms.length).toBe(2)
    for (const cm of cms) {
      const { dx, dy } = canonicalToDisplay(cm.x, cm.y)
      // CM y=0.48 → dx=0.48 (center along pitch)
      expect(dx).toBeGreaterThan(0.3)
      expect(dx).toBeLessThan(0.7)
      // CM x varies (0.38, 0.62) → dy in 0.3..0.7
      expect(dy).toBeGreaterThan(0.2)
      expect(dy).toBeLessThan(0.8)
    }
  })
})
