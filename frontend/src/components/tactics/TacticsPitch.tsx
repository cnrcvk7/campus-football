/**
 * Reusable horizontal SVG football pitch (11 / 9 / 7 / 5-a-side).
 *
 * Own goal on the LEFT, attacking to the RIGHT.
 * ViewBox "0 0 1.4 1" — field boundary at (FIELD_LEFT, FIELD_TOP)..+(FIELD_W, FIELD_H).
 * Children (player tokens) are rendered inside a g-transform that maps
 * display coordinates (0..1 × 0..1) to the field area.
 *
 * A `drawingLayer` slot is reserved for a future drawing overlay.
 */

import type { GameFormat } from '../../types/tactics'
import type { ReactNode } from 'react'
import { FIELD_LEFT, FIELD_TOP, FIELD_W, FIELD_H } from '../../utils/pitchCoords'

interface TacticsPitchProps {
  gameFormat: GameFormat
  children?: ReactNode
  drawingLayer?: ReactNode
  onPointerDown?: (e: React.PointerEvent<SVGSVGElement>) => void
  onPointerMove?: (e: React.PointerEvent<SVGSVGElement>) => void
  onPointerUp?: (e: React.PointerEvent<SVGSVGElement>) => void
  svgRef?: React.Ref<SVGSVGElement>
}

const S = 0.003                             // stroke width
const L = 'rgba(255,255,255,0.35)'          // line colour
const VB_W = 1.4
const VB_H = 1.0

// Field edges in viewBox coords
const FL = FIELD_LEFT                       // 0.2
const FT = FIELD_TOP                        // 0.02
const FR = FL + FIELD_W                     // 1.2
const FB = FT + FIELD_H                     // 0.98
const FCX = (FL + FR) / 2                   // 0.7  (centre along pitch)
const FCY = (FT + FB) / 2                   // 0.5  (centre across pitch)

// Per-format marking dimensions (fractions of field dims)
const CFG: Record<GameFormat, {
  paW: number; paD: number                  // penalty area width (across) & depth (along)
  gaW: number; gaD: number                  // goal area
  cr: number                                // centre-circle radius (fraction of FIELD_H)
  arc: boolean                              // draw penalty arcs?
}> = {
  11: { paW: 0.60, paD: 0.157, gaW: 0.26, gaD: 0.052, cr: 0.087, arc: true },
  9:  { paW: 0.55, paD: 0.145, gaW: 0.24, gaD: 0.048, cr: 0.080, arc: true },
  7:  { paW: 0.50, paD: 0.135, gaW: 0.22, gaD: 0.045, cr: 0.075, arc: false },
  5:  { paW: 0.45, paD: 0.130, gaW: 0.20, gaD: 0.042, cr: 0.070, arc: false },
}

export default function TacticsPitch({
  gameFormat,
  children,
  drawingLayer,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  svgRef,
}: TacticsPitchProps) {
  const c = CFG[gameFormat]

  // Penalty / goal area sizes in viewBox units
  const paHalf = (c.paW * FIELD_H) / 2
  const paDepth = c.paD * FIELD_W
  const gaHalf = (c.gaW * FIELD_H) / 2
  const gaDepth = c.gaD * FIELD_W
  const cr = c.cr * FIELD_H                  // visually circular because meet preserves ratio
  const spot = 0.02 * FIELD_W                // penalty-spot inset
  const arcR = 0.08                           // arc endpoint offset (y-direction)

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      className="h-full w-full select-none"
      preserveAspectRatio="xMidYMid meet"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      style={{ touchAction: 'none' }}
    >
      {/* Background */}
      <rect x="0" y="0" width={VB_W} height={VB_H} rx="0.015"
        className="fill-emerald-700 dark:fill-emerald-900" />

      {/* Grass stripes (vertical bands) */}
      {[0, 0.2, 0.4, 0.6, 0.8, 1.0, 1.2].map((x) => (
        <rect key={x} x={x} y="0" width="0.1" height={VB_H}
          className="fill-emerald-600/20 dark:fill-emerald-800/20" />
      ))}

      {/* ── Field boundary ── */}
      <rect x={FL} y={FT} width={FIELD_W} height={FIELD_H}
        fill="none" stroke={L} strokeWidth={S} />

      {/* Centre line (vertical) */}
      <line x1={FCX} y1={FT} x2={FCX} y2={FB} stroke={L} strokeWidth={S} />

      {/* Centre circle & spot */}
      <circle cx={FCX} cy={FCY} r={cr} fill="none" stroke={L} strokeWidth={S} />
      <circle cx={FCX} cy={FCY} r={0.005} fill={L} />

      {/* ── Left goal (own) ── */}
      <rect x={FL} y={FCY - paHalf} width={paDepth} height={paHalf * 2}
        fill="none" stroke={L} strokeWidth={S} />
      <rect x={FL} y={FCY - gaHalf} width={gaDepth} height={gaHalf * 2}
        fill="none" stroke={L} strokeWidth={S} />
      <circle cx={FL + paDepth - spot} cy={FCY} r={0.004} fill={L} />
      {c.arc && (
        <path
          d={`M ${FL + paDepth} ${FCY - arcR} A ${cr} ${cr} 0 0 1 ${FL + paDepth} ${FCY + arcR}`}
          fill="none" stroke={L} strokeWidth={S} />
      )}

      {/* ── Right goal (opponent) ── */}
      <rect x={FR - paDepth} y={FCY - paHalf} width={paDepth} height={paHalf * 2}
        fill="none" stroke={L} strokeWidth={S} />
      <rect x={FR - gaDepth} y={FCY - gaHalf} width={gaDepth} height={gaHalf * 2}
        fill="none" stroke={L} strokeWidth={S} />
      <circle cx={FR - paDepth + spot} cy={FCY} r={0.004} fill={L} />
      {c.arc && (
        <path
          d={`M ${FR - paDepth} ${FCY - arcR} A ${cr} ${cr} 0 0 0 ${FR - paDepth} ${FCY + arcR}`}
          fill="none" stroke={L} strokeWidth={S} />
      )}

      {/* Corner arcs */}
      <path d={`M ${FL + 0.015} ${FT} A 0.015 0.015 0 0 0 ${FL} ${FT + 0.015}`}
        fill="none" stroke={L} strokeWidth={S} />
      <path d={`M ${FL} ${FB - 0.015} A 0.015 0.015 0 0 0 ${FL + 0.015} ${FB}`}
        fill="none" stroke={L} strokeWidth={S} />
      <path d={`M ${FR} ${FT + 0.015} A 0.015 0.015 0 0 0 ${FR - 0.015} ${FT}`}
        fill="none" stroke={L} strokeWidth={S} />
      <path d={`M ${FR - 0.015} ${FB} A 0.015 0.015 0 0 0 ${FR} ${FB - 0.015}`}
        fill="none" stroke={L} strokeWidth={S} />

      {/* Drawing layer (future PR) */}
      {drawingLayer && (
        <g transform={`translate(${FIELD_LEFT}, ${FIELD_TOP}) scale(${FIELD_W}, ${FIELD_H})`}>
          {drawingLayer}
        </g>
      )}

      {/* Token layer — maps display coords (0..1 × 0..1) to the field area */}
      <g transform={`translate(${FIELD_LEFT}, ${FIELD_TOP}) scale(${FIELD_W}, ${FIELD_H})`}>
        {children}
      </g>
    </svg>
  )
}
