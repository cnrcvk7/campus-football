/**
 * A generic board token: home (white), away (red), or ball (yellow).
 *
 * Receives CANONICAL coords, renders in DISPLAY space via canonicalToDisplay.
 * Draggable with pointer events; click handler for eraser.
 */

import { useCallback, useRef } from 'react'
import type { TokenKind } from '../../types/tactics'
import { canonicalToDisplay, screenToCanonical, clampCoord } from '../../utils/pitchCoords'

interface BoardTokenProps {
  id: string
  kind: TokenKind
  x: number
  y: number
  label?: string
  playerName?: string
  selected?: boolean
  interactive?: boolean
  onDragMove?: (id: string, cx: number, cy: number) => void
  onDragEnd?: (id: string) => void
  onClick?: (id: string) => void
  svgRef: React.RefObject<SVGSVGElement | null>
}

const TOKEN_R = 0.030
const BALL_R = 0.018

const KIND_FILL: Record<TokenKind, { normal: string; dark: string }> = {
  home: { normal: 'fill-white dark:fill-slate-200', dark: 'fill-slate-800 dark:fill-slate-900' },
  away: { normal: 'fill-red-500 dark:fill-red-600', dark: 'fill-white' },
  ball: { normal: 'fill-yellow-400 dark:fill-yellow-500', dark: 'fill-slate-800' },
}

export default function BoardToken({
  id, kind, x, y, label, playerName,
  selected, interactive, onDragMove, onDragEnd, onClick, svgRef,
}: BoardTokenProps) {
  const draggingRef = useRef(false)

  const pointerToCanonical = useCallback(
    (clientX: number, clientY: number) => {
      const svg = svgRef.current
      if (!svg) return { cx: x, cy: y }
      return screenToCanonical(clientX, clientY, svg) ?? { cx: x, cy: y }
    },
    [svgRef, x, y],
  )

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!interactive) return
    e.stopPropagation()
    e.preventDefault()
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    draggingRef.current = true
  }, [interactive])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current) return
    e.preventDefault()
    const { cx, cy } = pointerToCanonical(e.clientX, e.clientY)
    onDragMove?.(id, clampCoord(cx), clampCoord(cy))
  }, [id, onDragMove, pointerToCanonical])

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current) return
    draggingRef.current = false
    ;(e.currentTarget as Element).releasePointerCapture(e.pointerId)
    onDragEnd?.(id)
  }, [id, onDragEnd])

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (draggingRef.current) return
    e.stopPropagation()
    onClick?.(id)
  }, [id, onClick])

  const { dx, dy } = canonicalToDisplay(x, y)
  const r = kind === 'ball' ? BALL_R : TOKEN_R
  const fills = KIND_FILL[kind]

  return (
    <g
      transform={`translate(${dx}, ${dy})`}
      className={interactive ? 'cursor-grab active:cursor-grabbing' : ''}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onClick={handleClick}
      style={{ outline: 'none' }}
    >
      {selected && (
        <circle r={r + 0.006} fill="none" stroke="white" strokeWidth="0.003" opacity="0.8" />
      )}
      <circle r={r} className={fills.normal} stroke="rgba(0,0,0,0.3)" strokeWidth="0.002" />
      {label && kind !== 'ball' && (
        <text
          textAnchor="middle"
          dominantBaseline="central"
          className={fills.dark}
          style={{ fontSize: '0.024px', fontWeight: 700, pointerEvents: 'none', userSelect: 'none' }}
        >
          {label}
        </text>
      )}
      {kind === 'ball' && (
        <text
          textAnchor="middle"
          dominantBaseline="central"
          className={fills.dark}
          style={{ fontSize: '0.016px', fontWeight: 700, pointerEvents: 'none', userSelect: 'none' }}
        >
          ●
        </text>
      )}
      {playerName && (
        <text
          y={r + 0.015}
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-white"
          style={{ fontSize: '0.017px', fontWeight: 600, pointerEvents: 'none', userSelect: 'none', textShadow: '0 0 2px rgba(0,0,0,0.6)' }}
        >
          {playerName.length > 8 ? playerName.slice(0, 7) + '.' : playerName}
        </text>
      )}
    </g>
  )
}
