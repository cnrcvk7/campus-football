/**
 * Cross-boundary drag-and-drop with Pointer Events.
 *
 * SquadList/Bench items become drag sources. On pointerdown (after a small
 * movement threshold) a floating ghost follows the pointer. On pointerup
 * we check if the drop landed on the pitch SVG or the bench area and dispatch
 * the appropriate action. Escape cancels.
 *
 * The component renders a fixed-position overlay element (pointer-events: none)
 * that shows a compact player badge during drag.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { SquadPlayer } from '../../types/tactics'
import { screenToCanonical } from '../../utils/pitchCoords'

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface DragState {
  player: SquadPlayer
  sourceType: 'squad' | 'bench' | 'pitch'
  startX: number
  startY: number
  currentX: number
  currentY: number
  active: boolean // true once threshold exceeded
}

interface DragContextValue {
  dragState: DragState | null
  startDrag: (
    player: SquadPlayer,
    sourceType: 'squad' | 'bench' | 'pitch',
    clientX: number,
    clientY: number,
  ) => void
}

const DragContext = createContext<DragContextValue | null>(null)

export function useDragContext(): DragContextValue {
  const ctx = useContext(DragContext)
  if (!ctx) throw new Error('useDragContext must be inside DragProvider')
  return ctx
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

const DRAG_THRESHOLD = 5 // px before drag activates

interface DragProviderProps {
  children: ReactNode
  pitchRef: React.RefObject<SVGSVGElement | null>
  benchRef: React.RefObject<HTMLDivElement | null>
  onDropOnPitch: (playerId: string, nx: number, ny: number, sourceType: 'squad' | 'bench' | 'pitch') => void
  onDropOnBench: (playerId: string, sourceType: 'squad' | 'bench' | 'pitch') => void
  onCancel: () => void
}

export function DragProvider({
  children,
  pitchRef,
  benchRef,
  onDropOnPitch,
  onDropOnBench,
  onCancel,
}: DragProviderProps) {
  const [dragState, setDragState] = useState<DragState | null>(null)
  const stateRef = useRef(dragState)
  stateRef.current = dragState

  const startDrag = useCallback(
    (player: SquadPlayer, sourceType: 'squad' | 'bench' | 'pitch', clientX: number, clientY: number) => {
      setDragState({
        player,
        sourceType,
        startX: clientX,
        startY: clientY,
        currentX: clientX,
        currentY: clientY,
        active: false,
      })
    },
    [],
  )

  // Global pointer move/up listeners
  useEffect(() => {
    if (!dragState) return

    function handleMove(e: PointerEvent) {
      const ds = stateRef.current
      if (!ds) return

      const dx = e.clientX - ds.startX
      const dy = e.clientY - ds.startY

      if (!ds.active && Math.sqrt(dx * dx + dy * dy) < DRAG_THRESHOLD) return

      setDragState((prev) =>
        prev ? { ...prev, currentX: e.clientX, currentY: e.clientY, active: true } : null,
      )
    }

    function handleUp(e: PointerEvent) {
      const ds = stateRef.current
      if (!ds || !ds.active) {
        setDragState(null)
        return
      }

      // Check if dropped on pitch — use centralized conversion
      const svg = pitchRef.current
      if (svg) {
        const rect = svg.getBoundingClientRect()
        if (
          e.clientX >= rect.left &&
          e.clientX <= rect.right &&
          e.clientY >= rect.top &&
          e.clientY <= rect.bottom
        ) {
          const result = screenToCanonical(e.clientX, e.clientY, svg)
          if (result) {
            onDropOnPitch(ds.player.id, result.cx, result.cy, ds.sourceType)
            setDragState(null)
            return
          }
        }
      }

      // Check if dropped on bench
      const bench = benchRef.current
      if (bench) {
        const rect = bench.getBoundingClientRect()
        if (
          e.clientX >= rect.left &&
          e.clientX <= rect.right &&
          e.clientY >= rect.top &&
          e.clientY <= rect.bottom
        ) {
          onDropOnBench(ds.player.id, ds.sourceType)
          setDragState(null)
          return
        }
      }

      // Dropped elsewhere — cancel
      onCancel()
      setDragState(null)
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onCancel()
        setDragState(null)
      }
    }

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [dragState, pitchRef, benchRef, onDropOnPitch, onDropOnBench, onCancel])

  return (
    <DragContext.Provider value={{ dragState, startDrag }}>
      {children}
      {/* Floating ghost */}
      {dragState?.active && (
        <div
          className="pointer-events-none fixed z-50 rounded-full bg-cf-brand px-3 py-1 text-xs font-bold text-cf-brand-foreground shadow-lg"
          style={{
            left: dragState.currentX,
            top: dragState.currentY,
            transform: 'translate(-50%, -50%)',
          }}
        >
          {dragState.player.jersey_number != null
            ? `#${dragState.player.jersey_number}`
            : `${dragState.player.first_name[0]}${dragState.player.last_name[0]}`}
          {' '}
          {dragState.player.last_name}
        </div>
      )}
    </DragContext.Provider>
  )
}

// ---------------------------------------------------------------------------
// Hook for drag sources (squad/bench items)
// ---------------------------------------------------------------------------

export function useDragSource(player: SquadPlayer, sourceType: 'squad' | 'bench' | 'pitch') {
  const { startDrag } = useDragContext()

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Only primary button
      if (e.button !== 0) return
      startDrag(player, sourceType, e.clientX, e.clientY)
    },
    [player, sourceType, startDrag],
  )

  return { handlePointerDown }
}
