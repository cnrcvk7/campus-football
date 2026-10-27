/**
 * Responsive SVG football pitch with field markings scaled for 11/9/7/5-a-side.
 *
 * ViewBox uses normalized units [0..1] with own goal at the bottom.
 * Children (PlayerTokens) are rendered inside the SVG coordinate space.
 */

import type { GameFormat } from '../../types/tactics'
import type { ReactNode } from 'react'

interface PitchProps {
  gameFormat: GameFormat
  children?: ReactNode
  onPointerDown?: (e: React.PointerEvent<SVGSVGElement>) => void
  onPointerMove?: (e: React.PointerEvent<SVGSVGElement>) => void
  onPointerUp?: (e: React.PointerEvent<SVGSVGElement>) => void
  svgRef?: React.Ref<SVGSVGElement>
}

// Pitch proportions: width=68, height=105 for 11-a-side.
// We map to viewBox 0..1 x 0..1.
const FIELD_STROKE = 0.003
const FIELD_COLOR = 'rgba(255,255,255,0.35)'

// Proportions per format (fraction of full pitch length used)
const FORMAT_CONFIG: Record<GameFormat, {
  penaltyAreaW: number; penaltyAreaH: number
  goalAreaW: number; goalAreaH: number
  centerRadius: number
  hasPenaltyArc: boolean
}> = {
  11: { penaltyAreaW: 0.60, penaltyAreaH: 0.157, goalAreaW: 0.26, goalAreaH: 0.052, centerRadius: 0.087, hasPenaltyArc: true },
  9:  { penaltyAreaW: 0.55, penaltyAreaH: 0.145, goalAreaW: 0.24, goalAreaH: 0.048, centerRadius: 0.080, hasPenaltyArc: true },
  7:  { penaltyAreaW: 0.50, penaltyAreaH: 0.135, goalAreaW: 0.22, goalAreaH: 0.045, centerRadius: 0.075, hasPenaltyArc: false },
  5:  { penaltyAreaW: 0.45, penaltyAreaH: 0.130, goalAreaW: 0.20, goalAreaH: 0.042, centerRadius: 0.070, hasPenaltyArc: false },
}

export default function Pitch({ gameFormat, children, onPointerDown, onPointerMove, onPointerUp, svgRef }: PitchProps) {
  const cfg = FORMAT_CONFIG[gameFormat]
  const paLeft = (1 - cfg.penaltyAreaW) / 2
  const gaLeft = (1 - cfg.goalAreaW) / 2

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 1 1.4"
      className="h-full w-full select-none"
      preserveAspectRatio="xMidYMid meet"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      style={{ touchAction: 'none' }}
    >
      {/* Pitch background */}
      <rect x="0" y="0" width="1" height="1.4" rx="0.02"
        className="fill-emerald-700 dark:fill-emerald-900" />

      {/* Grass stripes */}
      {[0, 0.2, 0.4, 0.6, 0.8, 1.0, 1.2].map((y) => (
        <rect key={y} x="0" y={y} width="1" height="0.1"
          className="fill-emerald-600/20 dark:fill-emerald-800/20" />
      ))}

      {/* Pitch outline — use 0.2 offset so the pitch is centered within */}
      <g transform="translate(0, 0.2)">
        {/* Outer boundary */}
        <rect x="0.02" y="0" width="0.96" height="1" rx="0"
          fill="none" stroke={FIELD_COLOR} strokeWidth={FIELD_STROKE} />

        {/* Half-way line */}
        <line x1="0.02" y1="0.5" x2="0.98" y2="0.5"
          stroke={FIELD_COLOR} strokeWidth={FIELD_STROKE} />

        {/* Center circle */}
        <circle cx="0.5" cy="0.5" r={cfg.centerRadius}
          fill="none" stroke={FIELD_COLOR} strokeWidth={FIELD_STROKE} />
        <circle cx="0.5" cy="0.5" r="0.005" fill={FIELD_COLOR} />

        {/* --- Bottom (own goal) --- */}
        {/* Penalty area */}
        <rect x={paLeft} y={1 - cfg.penaltyAreaH} width={cfg.penaltyAreaW} height={cfg.penaltyAreaH}
          fill="none" stroke={FIELD_COLOR} strokeWidth={FIELD_STROKE} />
        {/* Goal area */}
        <rect x={gaLeft} y={1 - cfg.goalAreaH} width={cfg.goalAreaW} height={cfg.goalAreaH}
          fill="none" stroke={FIELD_COLOR} strokeWidth={FIELD_STROKE} />
        {/* Penalty spot */}
        <circle cx="0.5" cy={1 - cfg.penaltyAreaH + 0.02} r="0.004" fill={FIELD_COLOR} />
        {/* Penalty arc */}
        {cfg.hasPenaltyArc && (
          <path
            d={`M ${0.5 - 0.08} ${1 - cfg.penaltyAreaH} A ${cfg.centerRadius} ${cfg.centerRadius} 0 0 0 ${0.5 + 0.08} ${1 - cfg.penaltyAreaH}`}
            fill="none" stroke={FIELD_COLOR} strokeWidth={FIELD_STROKE}
          />
        )}

        {/* --- Top (opponent goal) --- */}
        <rect x={paLeft} y="0" width={cfg.penaltyAreaW} height={cfg.penaltyAreaH}
          fill="none" stroke={FIELD_COLOR} strokeWidth={FIELD_STROKE} />
        <rect x={gaLeft} y="0" width={cfg.goalAreaW} height={cfg.goalAreaH}
          fill="none" stroke={FIELD_COLOR} strokeWidth={FIELD_STROKE} />
        <circle cx="0.5" cy={cfg.penaltyAreaH - 0.02} r="0.004" fill={FIELD_COLOR} />
        {cfg.hasPenaltyArc && (
          <path
            d={`M ${0.5 - 0.08} ${cfg.penaltyAreaH} A ${cfg.centerRadius} ${cfg.centerRadius} 0 0 1 ${0.5 + 0.08} ${cfg.penaltyAreaH}`}
            fill="none" stroke={FIELD_COLOR} strokeWidth={FIELD_STROKE}
          />
        )}

        {/* Corner arcs */}
        {[
          [0.02, 0], [0.98, 0], [0.02, 1], [0.98, 1],
        ].map(([cx, cy], i) => (
          <path
            key={i}
            d={`M ${cx} ${cy! + (cy === 0 ? 0.015 : -0.015)} A 0.015 0.015 0 0 ${cy === 0 ? (cx < 0.5 ? 1 : 0) : (cx < 0.5 ? 0 : 1)} ${cx + (cx < 0.5 ? 0.015 : -0.015)} ${cy}`}
            fill="none" stroke={FIELD_COLOR} strokeWidth={FIELD_STROKE}
          />
        ))}
      </g>

      {/* Player tokens rendered in pitch-normalized space */}
      {/* Transform: the pitch field occupies y 0.2..1.2 within the viewBox 0..1.4 */}
      {/* So a normalized y=0 (own goal) maps to svg y=1.2, y=1 (opponent) maps to svg y=0.2 */}
      <g transform="translate(0.02, 0.2) scale(0.96, 1)">
        {children}
      </g>
    </svg>
  )
}

/**
 * Convert normalized pitch coords (0..1) to SVG viewBox coords.
 * x: 0..1 maps to 0.02..0.98 (within field boundary)
 * y: 0..1 maps to 1.2..0.2 (inverted: 0=own goal=bottom=1.2, 1=opponent=top=0.2)
 */
export function pitchToSvg(nx: number, ny: number): { sx: number; sy: number } {
  return {
    sx: 0.02 + nx * 0.96,
    sy: 1.2 - ny * 1.0,
  }
}

/**
 * Convert SVG viewBox coords back to normalized pitch coords.
 */
export function svgToPitch(sx: number, sy: number): { nx: number; ny: number } {
  return {
    nx: (sx - 0.02) / 0.96,
    ny: (1.2 - sy) / 1.0,
  }
}
