/**
 * A single player token on the pitch.
 *
 * Receives CANONICAL coordinates (cx, cy).  Converts to DISPLAY coordinates
 * for rendering inside the horizontal TacticsPitch g-transform.  Dragging
 * uses the centralized screenToCanonical() and reports canonical coords back.
 */

import { useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { SquadPlayer } from '../../types/tactics'
import { canonicalToDisplay, screenToCanonical, clampCoord } from '../../utils/pitchCoords'

interface PlayerTokenProps {
  player: SquadPlayer
  /** Canonical x: 0..1 across the pitch (left→right from behind own goal). */
  x: number
  /** Canonical y: 0..1 along the pitch (0 = own goal, 1 = opponent). */
  y: number
  positionCode: string
  selected?: boolean
  onDragStart?: (playerId: string) => void
  onDragMove?: (playerId: string, cx: number, cy: number) => void
  onDragEnd?: (playerId: string) => void
  onSelect?: (playerId: string) => void
  /** Reports canonical (dx, dy) deltas. */
  onKeyMove?: (playerId: string, dx: number, dy: number) => void
  onRemove?: (playerId: string) => void
  svgRef: React.RefObject<SVGSVGElement | null>
}

const TOKEN_R = 0.032
const KEY_STEP = 0.02

function getInitials(player: SquadPlayer): string {
  if (player.jersey_number != null) return String(player.jersey_number)
  const f = player.first_name?.[0] ?? ''
  const l = player.last_name?.[0] ?? ''
  return (f + l).toUpperCase()
}

function getShortName(player: SquadPlayer): string {
  const last = player.last_name ?? ''
  return last.length > 8 ? last.slice(0, 7) + '.' : last
}

export default function PlayerToken({
  player,
  x,
  y,
  positionCode,
  selected,
  onDragStart,
  onDragMove,
  onDragEnd,
  onSelect,
  onKeyMove,
  onRemove,
  svgRef,
}: PlayerTokenProps) {
  const { t } = useTranslation()
  const draggingRef = useRef(false)

  // ---------------------------------------------------------------------------
  // Pointer → canonical via centralized module
  // ---------------------------------------------------------------------------

  const pointerToCanonical = useCallback(
    (clientX: number, clientY: number) => {
      const svg = svgRef.current
      if (!svg) return { cx: x, cy: y }
      const result = screenToCanonical(clientX, clientY, svg)
      return result ?? { cx: x, cy: y }
    },
    [svgRef, x, y],
  )

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation()
      e.preventDefault()
      ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
      draggingRef.current = true
      onDragStart?.(player.id)
      onSelect?.(player.id)
    },
    [onDragStart, onSelect, player.id],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!draggingRef.current) return
      e.preventDefault()
      const { cx, cy } = pointerToCanonical(e.clientX, e.clientY)
      onDragMove?.(player.id, clampCoord(cx), clampCoord(cy))
    },
    [onDragMove, player.id, pointerToCanonical],
  )

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!draggingRef.current) return
      draggingRef.current = false
      ;(e.currentTarget as Element).releasePointerCapture(e.pointerId)
      onDragEnd?.(player.id)
    },
    [onDragEnd, player.id],
  )

  // ---------------------------------------------------------------------------
  // Keyboard — arrows map to screen directions on the horizontal pitch
  // ---------------------------------------------------------------------------

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowRight':
          e.preventDefault()
          onKeyMove?.(player.id, 0, KEY_STEP)        // → increase cy (toward opponent)
          break
        case 'ArrowLeft':
          e.preventDefault()
          onKeyMove?.(player.id, 0, -KEY_STEP)       // ← decrease cy (toward own goal)
          break
        case 'ArrowUp':
          e.preventDefault()
          onKeyMove?.(player.id, -KEY_STEP, 0)       // ↑ decrease cx (top of screen)
          break
        case 'ArrowDown':
          e.preventDefault()
          onKeyMove?.(player.id, KEY_STEP, 0)         // ↓ increase cx (bottom of screen)
          break
        case 'Delete':
        case 'Backspace':
          e.preventDefault()
          onRemove?.(player.id)
          break
        case 'Enter':
        case ' ':
          e.preventDefault()
          onSelect?.(player.id)
          break
      }
    },
    [player.id, onKeyMove, onRemove, onSelect],
  )

  // ---------------------------------------------------------------------------
  // Render in DISPLAY space (the g-transform maps 0..1 → field area)
  // ---------------------------------------------------------------------------

  const { dx, dy } = canonicalToDisplay(x, y)

  const posLabel = positionCode ? t(`positions.${positionCode}`, positionCode) : ''
  const ariaLabel = `${player.first_name} ${player.last_name}${
    player.jersey_number != null ? ` #${player.jersey_number}` : ''
  }${posLabel ? ` — ${posLabel}` : ''}`

  return (
    <g
      transform={`translate(${dx}, ${dy})`}
      className="cursor-grab active:cursor-grabbing"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-label={ariaLabel}
      style={{ outline: 'none' }}
    >
      {/* Selection ring */}
      {selected && (
        <circle r={TOKEN_R + 0.006} fill="none" stroke="white" strokeWidth="0.003" opacity="0.8" />
      )}
      {/* Token circle */}
      <circle
        r={TOKEN_R}
        className={selected
          ? 'fill-emerald-400 dark:fill-emerald-500'
          : 'fill-white dark:fill-slate-200'}
        stroke="rgba(0,0,0,0.3)"
        strokeWidth="0.002"
      />
      {/* Jersey number / initials */}
      <text
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-slate-800 dark:fill-slate-900"
        style={{ fontSize: '0.028px', fontWeight: 700, pointerEvents: 'none', userSelect: 'none' }}
      >
        {getInitials(player)}
      </text>
      {/* Short name below */}
      <text
        y={TOKEN_R + 0.016}
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-white"
        style={{ fontSize: '0.019px', fontWeight: 600, pointerEvents: 'none', userSelect: 'none', textShadow: '0 0 2px rgba(0,0,0,0.6)' }}
      >
        {getShortName(player)}
      </text>
      {positionCode && (
        <text
          y={TOKEN_R + 0.033}
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-white/70"
          style={{ fontSize: '0.015px', fontWeight: 500, pointerEvents: 'none', userSelect: 'none' }}
        >
          {positionCode}
        </text>
      )}
    </g>
  )
}
