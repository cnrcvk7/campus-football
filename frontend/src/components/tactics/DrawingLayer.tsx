/**
 * SVG rendering of drawing elements (strokes and texts).
 *
 * Rendered inside TacticsPitch's drawingLayer slot (g-transform maps
 * display coords 0..1 to the field area).  Drawing coordinates are
 * stored in CANONICAL space; we convert to display for rendering.
 *
 * Text elements: draggable in Select AND Text tool modes; double-click
 * to edit. An invisible padded rect provides a comfortable hit area.
 */

import { useCallback, useRef } from 'react'
import type { DrawingElement, DrawingColor, StrokeWidth } from '../../types/tactics'
import { canonicalToDisplay, screenToCanonical, clampCoord } from '../../utils/pitchCoords'

// ---------------------------------------------------------------------------
// Color / width maps  (exported for the live-pen draft stroke)
// ---------------------------------------------------------------------------

export const COLOR_MAP: Record<DrawingColor, string> = {
  white: '#ffffff',
  yellow: '#facc15',
  red: '#ef4444',
  blue: '#3b82f6',
  black: '#1e293b',
}

export const WIDTH_MAP: Record<StrokeWidth, number> = {
  sm: 0.004,
  md: 0.007,
  lg: 0.012,
}

/** Convert canonical points to an SVG path in DISPLAY space. */
export function pointsToPath(pts: [number, number][]): string {
  if (pts.length === 0) return ''
  const dPts = pts.map(([cx, cy]) => canonicalToDisplay(cx, cy))
  let d = `M ${dPts[0].dx} ${dPts[0].dy}`
  for (let i = 1; i < dPts.length; i++) {
    d += ` L ${dPts[i].dx} ${dPts[i].dy}`
  }
  return d
}

// ---------------------------------------------------------------------------
// Draggable text element
// ---------------------------------------------------------------------------

const TEXT_PAD = 0.025  // invisible hit-area padding around the text

function DraggableText({
  el, interactive, onElementClick, onTextDrag, onTextDoubleClick, svgRef,
}: {
  el: DrawingElement
  interactive: boolean
  onElementClick?: (id: string) => void
  onTextDrag?: (id: string, cx: number, cy: number) => void
  onTextDoubleClick?: (id: string) => void
  svgRef?: React.RefObject<SVGSVGElement | null>
}) {
  const at = el.at as [number, number]
  if (!at) return null
  const { dx, dy } = canonicalToDisplay(at[0], at[1])
  const color = COLOR_MAP[el.color as DrawingColor] ?? '#ffffff'

  const draggingRef = useRef(false)
  const movedRef = useRef(false)

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!interactive) return
    e.stopPropagation()
    e.preventDefault()
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    draggingRef.current = true
    movedRef.current = false
  }, [interactive])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current || !svgRef?.current) return
    e.preventDefault()
    movedRef.current = true
    const result = screenToCanonical(e.clientX, e.clientY, svgRef.current)
    if (result) onTextDrag?.(el.id, clampCoord(result.cx), clampCoord(result.cy))
  }, [el.id, onTextDrag, svgRef])

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current) return
    draggingRef.current = false
    ;(e.currentTarget as Element).releasePointerCapture(e.pointerId)
  }, [])

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (movedRef.current) return  // was a drag, not a click
    onElementClick?.(el.id)
  }, [el.id, onElementClick])

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    onTextDoubleClick?.(el.id)
  }, [el.id, onTextDoubleClick])

  // Approximate text width for hit-area padding
  const textLen = (el.text as string)?.length ?? 1
  const approxW = textLen * 0.013 + TEXT_PAD * 2
  const approxH = 0.03 + TEXT_PAD * 2

  return (
    <g
      onPointerDown={interactive ? handlePointerDown : undefined}
      onPointerMove={interactive ? handlePointerMove : undefined}
      onPointerUp={interactive ? handlePointerUp : undefined}
      onClick={interactive ? handleClick : undefined}
      onDoubleClick={interactive && onTextDoubleClick ? handleDoubleClick : undefined}
      style={{ cursor: interactive ? 'grab' : 'default' }}
    >
      {/* Invisible padded hit-area rect */}
      <rect
        x={dx - approxW / 2}
        y={dy - approxH / 2}
        width={approxW}
        height={approxH}
        fill="transparent"
        style={{ pointerEvents: interactive ? 'fill' : 'none' }}
      />
      <text
        x={dx} y={dy}
        fill={color}
        textAnchor="middle"
        dominantBaseline="central"
        style={{
          fontSize: '0.024px', fontWeight: 600, userSelect: 'none',
          pointerEvents: 'none',  // the rect handles events
          textShadow: '0 0 3px rgba(0,0,0,0.5)',
        }}
      >
        {el.text}
      </text>
    </g>
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface DrawingLayerProps {
  elements: DrawingElement[]
  onElementClick?: (id: string) => void
  onTextDrag?: (id: string, cx: number, cy: number) => void
  onTextDoubleClick?: (id: string) => void
  interactive?: boolean
  svgRef?: React.RefObject<SVGSVGElement | null>
}

export default function DrawingLayer({
  elements, onElementClick, onTextDrag, onTextDoubleClick, interactive, svgRef,
}: DrawingLayerProps) {
  return (
    <>
      {elements.map((el) => {
        if (el.type === 'freehand' || el.type === 'arrow' || el.type === 'line') {
          const pts = el.points as [number, number][]
          if (!pts || pts.length < 2) return null
          const color = COLOR_MAP[el.color as DrawingColor] ?? '#ffffff'
          const width = WIDTH_MAP[el.width as StrokeWidth] ?? WIDTH_MAP.md
          const dashed = el.dashed ? `${width * 3} ${width * 2}` : undefined
          return (
            <path
              key={el.id}
              d={pointsToPath(pts)}
              fill="none" stroke={color} strokeWidth={width}
              strokeLinecap="round" strokeLinejoin="round"
              strokeDasharray={dashed}
              style={interactive ? { cursor: 'pointer', pointerEvents: 'stroke' } : { pointerEvents: 'none' }}
              onClick={interactive && onElementClick ? () => onElementClick(el.id) : undefined}
            />
          )
        }

        if (el.type === 'text') {
          return (
            <DraggableText key={el.id} el={el} interactive={!!interactive}
              onElementClick={onElementClick} onTextDrag={onTextDrag}
              onTextDoubleClick={onTextDoubleClick} svgRef={svgRef} />
          )
        }

        return null
      })}
    </>
  )
}
