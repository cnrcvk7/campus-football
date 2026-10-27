/**
 * Formation templates for every backend formation key and game format.
 *
 * Coordinates are normalized (x, y) in [0..1]:
 *   x: 0 = left touchline, 1 = right touchline
 *   y: 0 = own goal line (bottom), 1 = opponent goal line (top)
 *
 * Each slot has a suggested `positionCode` from the Player.Position choices:
 *   GK CB LB RB LWB RWB CDM CM CAM LM RM LW RW ST CF
 *
 * The GK is always included in the template (slot index 0).
 * Formation keys must match the backend `formations.py` FORMATIONS dict exactly.
 */

import type { GameFormat } from '../types/tactics'

export interface FormationSlot {
  x: number
  y: number
  positionCode: string
}

export type FormationTemplate = FormationSlot[]

// ---------------------------------------------------------------------------
// 11-a-side
// ---------------------------------------------------------------------------

const F11_442: FormationTemplate = [
  { x: 0.50, y: 0.06, positionCode: 'GK' },
  { x: 0.15, y: 0.22, positionCode: 'LB' },
  { x: 0.38, y: 0.22, positionCode: 'CB' },
  { x: 0.62, y: 0.22, positionCode: 'CB' },
  { x: 0.85, y: 0.22, positionCode: 'RB' },
  { x: 0.15, y: 0.48, positionCode: 'LM' },
  { x: 0.38, y: 0.48, positionCode: 'CM' },
  { x: 0.62, y: 0.48, positionCode: 'CM' },
  { x: 0.85, y: 0.48, positionCode: 'RM' },
  { x: 0.35, y: 0.78, positionCode: 'ST' },
  { x: 0.65, y: 0.78, positionCode: 'ST' },
]

const F11_433: FormationTemplate = [
  { x: 0.50, y: 0.06, positionCode: 'GK' },
  { x: 0.15, y: 0.22, positionCode: 'LB' },
  { x: 0.38, y: 0.22, positionCode: 'CB' },
  { x: 0.62, y: 0.22, positionCode: 'CB' },
  { x: 0.85, y: 0.22, positionCode: 'RB' },
  { x: 0.25, y: 0.48, positionCode: 'CM' },
  { x: 0.50, y: 0.48, positionCode: 'CM' },
  { x: 0.75, y: 0.48, positionCode: 'CM' },
  { x: 0.18, y: 0.78, positionCode: 'LW' },
  { x: 0.50, y: 0.78, positionCode: 'ST' },
  { x: 0.82, y: 0.78, positionCode: 'RW' },
]

const F11_4231: FormationTemplate = [
  { x: 0.50, y: 0.06, positionCode: 'GK' },
  { x: 0.15, y: 0.20, positionCode: 'LB' },
  { x: 0.38, y: 0.20, positionCode: 'CB' },
  { x: 0.62, y: 0.20, positionCode: 'CB' },
  { x: 0.85, y: 0.20, positionCode: 'RB' },
  { x: 0.35, y: 0.38, positionCode: 'CDM' },
  { x: 0.65, y: 0.38, positionCode: 'CDM' },
  { x: 0.18, y: 0.58, positionCode: 'LW' },
  { x: 0.50, y: 0.58, positionCode: 'CAM' },
  { x: 0.82, y: 0.58, positionCode: 'RW' },
  { x: 0.50, y: 0.82, positionCode: 'ST' },
]

const F11_352: FormationTemplate = [
  { x: 0.50, y: 0.06, positionCode: 'GK' },
  { x: 0.22, y: 0.22, positionCode: 'CB' },
  { x: 0.50, y: 0.22, positionCode: 'CB' },
  { x: 0.78, y: 0.22, positionCode: 'CB' },
  { x: 0.10, y: 0.48, positionCode: 'LWB' },
  { x: 0.30, y: 0.48, positionCode: 'CM' },
  { x: 0.50, y: 0.48, positionCode: 'CM' },
  { x: 0.70, y: 0.48, positionCode: 'CM' },
  { x: 0.90, y: 0.48, positionCode: 'RWB' },
  { x: 0.35, y: 0.78, positionCode: 'ST' },
  { x: 0.65, y: 0.78, positionCode: 'ST' },
]

const F11_532: FormationTemplate = [
  { x: 0.50, y: 0.06, positionCode: 'GK' },
  { x: 0.10, y: 0.22, positionCode: 'LWB' },
  { x: 0.30, y: 0.22, positionCode: 'CB' },
  { x: 0.50, y: 0.22, positionCode: 'CB' },
  { x: 0.70, y: 0.22, positionCode: 'CB' },
  { x: 0.90, y: 0.22, positionCode: 'RWB' },
  { x: 0.25, y: 0.48, positionCode: 'CM' },
  { x: 0.50, y: 0.48, positionCode: 'CM' },
  { x: 0.75, y: 0.48, positionCode: 'CM' },
  { x: 0.35, y: 0.78, positionCode: 'ST' },
  { x: 0.65, y: 0.78, positionCode: 'ST' },
]

// ---------------------------------------------------------------------------
// 9-a-side
// ---------------------------------------------------------------------------

const F9_332: FormationTemplate = [
  { x: 0.50, y: 0.07, positionCode: 'GK' },
  { x: 0.22, y: 0.25, positionCode: 'CB' },
  { x: 0.50, y: 0.25, positionCode: 'CB' },
  { x: 0.78, y: 0.25, positionCode: 'CB' },
  { x: 0.22, y: 0.50, positionCode: 'LM' },
  { x: 0.50, y: 0.50, positionCode: 'CM' },
  { x: 0.78, y: 0.50, positionCode: 'RM' },
  { x: 0.35, y: 0.78, positionCode: 'ST' },
  { x: 0.65, y: 0.78, positionCode: 'ST' },
]

const F9_323: FormationTemplate = [
  { x: 0.50, y: 0.07, positionCode: 'GK' },
  { x: 0.22, y: 0.25, positionCode: 'CB' },
  { x: 0.50, y: 0.25, positionCode: 'CB' },
  { x: 0.78, y: 0.25, positionCode: 'CB' },
  { x: 0.35, y: 0.50, positionCode: 'CM' },
  { x: 0.65, y: 0.50, positionCode: 'CM' },
  { x: 0.22, y: 0.78, positionCode: 'LW' },
  { x: 0.50, y: 0.78, positionCode: 'ST' },
  { x: 0.78, y: 0.78, positionCode: 'RW' },
]

const F9_233: FormationTemplate = [
  { x: 0.50, y: 0.07, positionCode: 'GK' },
  { x: 0.35, y: 0.25, positionCode: 'CB' },
  { x: 0.65, y: 0.25, positionCode: 'CB' },
  { x: 0.22, y: 0.50, positionCode: 'LM' },
  { x: 0.50, y: 0.50, positionCode: 'CM' },
  { x: 0.78, y: 0.50, positionCode: 'RM' },
  { x: 0.22, y: 0.78, positionCode: 'LW' },
  { x: 0.50, y: 0.78, positionCode: 'ST' },
  { x: 0.78, y: 0.78, positionCode: 'RW' },
]

// ---------------------------------------------------------------------------
// 7-a-side
// ---------------------------------------------------------------------------

const F7_231: FormationTemplate = [
  { x: 0.50, y: 0.08, positionCode: 'GK' },
  { x: 0.33, y: 0.26, positionCode: 'CB' },
  { x: 0.67, y: 0.26, positionCode: 'CB' },
  { x: 0.20, y: 0.52, positionCode: 'LM' },
  { x: 0.50, y: 0.52, positionCode: 'CM' },
  { x: 0.80, y: 0.52, positionCode: 'RM' },
  { x: 0.50, y: 0.80, positionCode: 'ST' },
]

const F7_321: FormationTemplate = [
  { x: 0.50, y: 0.08, positionCode: 'GK' },
  { x: 0.22, y: 0.26, positionCode: 'CB' },
  { x: 0.50, y: 0.26, positionCode: 'CB' },
  { x: 0.78, y: 0.26, positionCode: 'CB' },
  { x: 0.35, y: 0.52, positionCode: 'CM' },
  { x: 0.65, y: 0.52, positionCode: 'CM' },
  { x: 0.50, y: 0.80, positionCode: 'ST' },
]

const F7_2121: FormationTemplate = [
  { x: 0.50, y: 0.08, positionCode: 'GK' },
  { x: 0.33, y: 0.22, positionCode: 'CB' },
  { x: 0.67, y: 0.22, positionCode: 'CB' },
  { x: 0.50, y: 0.40, positionCode: 'CDM' },
  { x: 0.30, y: 0.58, positionCode: 'LM' },
  { x: 0.70, y: 0.58, positionCode: 'RM' },
  { x: 0.50, y: 0.80, positionCode: 'ST' },
]

// ---------------------------------------------------------------------------
// 5-a-side
// ---------------------------------------------------------------------------

const F5_22: FormationTemplate = [
  { x: 0.50, y: 0.10, positionCode: 'GK' },
  { x: 0.33, y: 0.35, positionCode: 'CB' },
  { x: 0.67, y: 0.35, positionCode: 'CB' },
  { x: 0.33, y: 0.68, positionCode: 'ST' },
  { x: 0.67, y: 0.68, positionCode: 'ST' },
]

const F5_121: FormationTemplate = [
  { x: 0.50, y: 0.10, positionCode: 'GK' },
  { x: 0.50, y: 0.30, positionCode: 'CB' },
  { x: 0.30, y: 0.54, positionCode: 'LM' },
  { x: 0.70, y: 0.54, positionCode: 'RM' },
  { x: 0.50, y: 0.78, positionCode: 'ST' },
]

const F5_211: FormationTemplate = [
  { x: 0.50, y: 0.10, positionCode: 'GK' },
  { x: 0.33, y: 0.30, positionCode: 'CB' },
  { x: 0.67, y: 0.30, positionCode: 'CB' },
  { x: 0.50, y: 0.54, positionCode: 'CM' },
  { x: 0.50, y: 0.78, positionCode: 'ST' },
]

// ---------------------------------------------------------------------------
// Registry — keys must match backend FORMATIONS exactly
// ---------------------------------------------------------------------------

export const FORMATION_TEMPLATES: Record<string, FormationTemplate> = {
  // 11
  '4-4-2': F11_442,
  '4-3-3': F11_433,
  '4-2-3-1': F11_4231,
  '3-5-2': F11_352,
  '5-3-2': F11_532,
  // 9
  '3-3-2': F9_332,
  '3-2-3': F9_323,
  '2-3-3': F9_233,
  // 7
  '2-3-1': F7_231,
  '3-2-1': F7_321,
  '2-1-2-1': F7_2121,
  // 5
  '2-2': F5_22,
  '1-2-1': F5_121,
  '2-1-1': F5_211,
}

/**
 * Valid formations per game format — must match the backend formations.py.
 */
export const FORMATIONS_BY_FORMAT: Record<GameFormat, string[]> = {
  11: ['4-4-2', '4-3-3', '4-2-3-1', '3-5-2', '5-3-2'],
  9: ['3-3-2', '3-2-3', '2-3-3'],
  7: ['2-3-1', '3-2-1', '2-1-2-1'],
  5: ['2-2', '1-2-1', '2-1-1'],
}

export const GAME_FORMATS: GameFormat[] = [11, 9, 7, 5]

export function getDefaultFormation(format: GameFormat): string {
  return FORMATIONS_BY_FORMAT[format][0]
}
