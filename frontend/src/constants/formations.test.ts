import { describe, it, expect } from 'vitest'
import {
  FORMATION_TEMPLATES,
  FORMATIONS_BY_FORMAT,
  GAME_FORMATS,
  type FormationSlot,
} from './formations'

// The backend formation keys (must match exactly)
const BACKEND_FORMATIONS: Record<number, string[]> = {
  11: ['4-4-2', '4-3-3', '4-2-3-1', '3-5-2', '5-3-2'],
  9: ['3-3-2', '3-2-3', '2-3-3'],
  7: ['2-3-1', '3-2-1', '2-1-2-1'],
  5: ['2-2', '1-2-1', '2-1-1'],
}

const VALID_POSITION_CODES = new Set([
  'GK', 'CB', 'LB', 'RB', 'LWB', 'RWB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'ST', 'CF',
])

describe('formations', () => {
  it('GAME_FORMATS covers all backend formats', () => {
    expect(GAME_FORMATS).toEqual([11, 9, 7, 5])
  })

  it('every backend formation key has a frontend template', () => {
    for (const [format, formations] of Object.entries(BACKEND_FORMATIONS)) {
      const formatNum = Number(format)
      expect(FORMATIONS_BY_FORMAT[formatNum as 5 | 7 | 9 | 11]).toEqual(formations)

      for (const key of formations) {
        expect(FORMATION_TEMPLATES).toHaveProperty(key)
      }
    }
  })

  it('no extra formation keys beyond backend list', () => {
    const allBackend = Object.values(BACKEND_FORMATIONS).flat()
    const allFrontend = Object.keys(FORMATION_TEMPLATES)
    expect(allFrontend.sort()).toEqual(allBackend.sort())
  })

  describe.each(Object.entries(FORMATION_TEMPLATES))('template %s', (key, template) => {
    // Find which format this formation belongs to
    const format = Object.entries(FORMATIONS_BY_FORMAT).find(
      ([, formations]) => formations.includes(key),
    )?.[0]

    it(`slot count equals game format (${format})`, () => {
      expect(template.length).toBe(Number(format))
    })

    it('all coordinates within [0, 1]', () => {
      for (const slot of template) {
        expect(slot.x).toBeGreaterThanOrEqual(0)
        expect(slot.x).toBeLessThanOrEqual(1)
        expect(slot.y).toBeGreaterThanOrEqual(0)
        expect(slot.y).toBeLessThanOrEqual(1)
      }
    })

    it('no duplicate positions (same x,y)', () => {
      const coords = template.map((s: FormationSlot) => `${s.x},${s.y}`)
      expect(new Set(coords).size).toBe(coords.length)
    })

    it('first slot is GK', () => {
      expect(template[0].positionCode).toBe('GK')
    })

    it('all position codes are valid', () => {
      for (const slot of template) {
        expect(VALID_POSITION_CODES.has(slot.positionCode)).toBe(true)
      }
    })
  })
})
