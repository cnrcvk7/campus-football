/**
 * Bench (substitutes) with reorder buttons and actions.
 */

import { forwardRef } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronUp, ChevronDown, X, ArrowUpToLine } from 'lucide-react'
import type { SquadPlayer, BenchSlot } from '../../types/tactics'
import { useDragSource } from './DragOverlay'

interface BenchProps {
  slots: BenchSlot[]
  playerMap: Map<string, SquadPlayer>
  onReorder: (playerId: string, direction: 'up' | 'down') => void
  onMoveToPitch: (playerId: string) => void
  onRemove: (playerId: string) => void
}

function DraggableBenchRow({
  player,
  idx,
  total,
  onReorder,
  onMoveToPitch,
  onRemove,
}: {
  player: SquadPlayer
  idx: number
  total: number
  onReorder: (id: string, dir: 'up' | 'down') => void
  onMoveToPitch: (id: string) => void
  onRemove: (id: string) => void
}) {
  const { t } = useTranslation()
  const { handlePointerDown } = useDragSource(player, 'bench')

  return (
    <li
      className="group flex items-center gap-2 py-1.5"
      onPointerDown={handlePointerDown}
      style={{ touchAction: 'none' }}
    >
      <span className="w-5 text-center text-xs tabular-nums text-cf-muted-foreground">
        {idx + 1}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-cf-surface-foreground">
          {player.jersey_number != null && (
            <span className="mr-1 text-xs text-cf-muted-foreground">#{player.jersey_number}</span>
          )}
          {player.first_name} {player.last_name}
        </p>
        {player.preferred_position && (
          <p className="text-xs text-cf-muted-foreground">
            {player.preferred_position}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        <button
          onClick={(e) => { e.stopPropagation(); onReorder(player.id, 'up') }}
          disabled={idx === 0}
          className="rounded p-0.5 text-cf-muted-foreground hover:text-cf-surface-foreground disabled:opacity-30"
          aria-label={t('tactics.moveUp')}
        >
          <ChevronUp size={14} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onReorder(player.id, 'down') }}
          disabled={idx === total - 1}
          className="rounded p-0.5 text-cf-muted-foreground hover:text-cf-surface-foreground disabled:opacity-30"
          aria-label={t('tactics.moveDown')}
        >
          <ChevronDown size={14} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onMoveToPitch(player.id) }}
          className="rounded p-0.5 text-cf-muted-foreground hover:text-emerald-500"
          aria-label={t('tactics.moveToPitch', { name: `${player.first_name} ${player.last_name}` })}
        >
          <ArrowUpToLine size={14} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(player.id) }}
          className="rounded p-0.5 text-cf-muted-foreground hover:text-red-500"
          aria-label={t('tactics.removePlayer', { name: `${player.first_name} ${player.last_name}` })}
        >
          <X size={14} />
        </button>
      </div>
    </li>
  )
}

const Bench = forwardRef<HTMLDivElement, BenchProps>(function Bench(
  { slots, playerMap, onReorder, onMoveToPitch, onRemove },
  ref,
) {
  const { t } = useTranslation()

  return (
    <div ref={ref} className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-cf-muted-foreground">
        {t('tactics.substitutes')} ({slots.length})
      </h3>

      {slots.length === 0 && (
        <p className="py-2 text-center text-xs text-cf-muted-foreground">
          {t('tactics.noSubs')}
        </p>
      )}

      <ul className="divide-y divide-cf-border">
        {slots.map((slot, idx) => {
          const p = playerMap.get(slot.playerId)
          if (!p) return null
          return (
            <DraggableBenchRow
              key={slot.playerId}
              player={p}
              idx={idx}
              total={slots.length}
              onReorder={onReorder}
              onMoveToPitch={onMoveToPitch}
              onRemove={onRemove}
            />
          )
        })}
      </ul>
    </div>
  )
})

export default Bench
