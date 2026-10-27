/**
 * Squad panel: ACTIVE team players not yet placed on the pitch or bench.
 * Filter by position group. Players can be dragged onto the pitch or added
 * via a keyboard-accessible "assign" flow.
 */

import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { SquadPlayer } from '../../types/tactics'
import { useDragSource } from './DragOverlay'

interface SquadListProps {
  players: SquadPlayer[]
  placedIds: Set<string>
  onPlaceOnPitch: (playerId: string) => void
  onPlaceOnBench: (playerId: string) => void
}

function DraggableSquadRow({
  player,
  onPlaceOnPitch,
  onPlaceOnBench,
}: {
  player: SquadPlayer
  onPlaceOnPitch: (id: string) => void
  onPlaceOnBench: (id: string) => void
}) {
  const { t } = useTranslation()
  const { handlePointerDown } = useDragSource(player, 'squad')

  return (
    <li
      className="group flex items-center justify-between gap-2 rounded px-2 py-1.5 hover:bg-cf-muted"
      onPointerDown={handlePointerDown}
      style={{ touchAction: 'none' }}
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-cf-surface-foreground">
          {player.jersey_number != null && (
            <span className="mr-1 text-xs text-cf-muted-foreground">#{player.jersey_number}</span>
          )}
          {player.first_name} {player.last_name}
        </p>
        {player.preferred_position && (
          <p className="text-xs text-cf-muted-foreground">
            {t(`positions.${player.preferred_position}`, player.preferred_position)}
          </p>
        )}
      </div>
      <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        <button
          onClick={(e) => { e.stopPropagation(); onPlaceOnPitch(player.id) }}
          className="rounded bg-cf-brand px-1.5 py-0.5 text-xs text-cf-brand-foreground hover:bg-cf-brand-hover"
          aria-label={t('tactics.addToPitch', { name: `${player.first_name} ${player.last_name}` })}
        >
          {t('tactics.pitch')}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onPlaceOnBench(player.id) }}
          className="rounded bg-cf-muted px-1.5 py-0.5 text-xs text-cf-muted-foreground ring-1 ring-cf-border hover:bg-cf-border"
          aria-label={t('tactics.addToBench', { name: `${player.first_name} ${player.last_name}` })}
        >
          {t('tactics.bench')}
        </button>
      </div>
    </li>
  )
}

const POSITION_GROUPS = [
  { key: 'all', codes: [] as string[] },
  { key: 'GK', codes: ['GK'] },
  { key: 'DEF', codes: ['CB', 'LB', 'RB', 'LWB', 'RWB'] },
  { key: 'MID', codes: ['CDM', 'CM', 'CAM', 'LM', 'RM'] },
  { key: 'FWD', codes: ['LW', 'RW', 'ST', 'CF'] },
]

export default function SquadList({ players, placedIds, onPlaceOnPitch, onPlaceOnBench }: SquadListProps) {
  const { t } = useTranslation()
  const [filter, setFilter] = useState('all')

  const available = useMemo(() => {
    const unplaced = players.filter((p) => !placedIds.has(p.id))
    if (filter === 'all') return unplaced
    const group = POSITION_GROUPS.find((g) => g.key === filter)
    if (!group || group.codes.length === 0) return unplaced
    return unplaced.filter((p) => group.codes.includes(p.preferred_position))
  }, [players, placedIds, filter])

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-cf-muted-foreground">
        {t('tactics.squad')} ({players.length - placedIds.size})
      </h3>

      {/* Position filter */}
      <div className="flex flex-wrap gap-1">
        {POSITION_GROUPS.map((g) => (
          <button
            key={g.key}
            onClick={() => setFilter(g.key)}
            className={`rounded px-2 py-0.5 text-xs font-medium transition-colors ${
              filter === g.key
                ? 'bg-cf-brand text-cf-brand-foreground'
                : 'bg-cf-muted text-cf-muted-foreground hover:bg-cf-border'
            }`}
          >
            {g.key === 'all' ? t('tactics.filterAll') : t(`tactics.filter${g.key}`)}
          </button>
        ))}
      </div>

      {/* Player list */}
      <ul className="max-h-[40vh] overflow-y-auto">
        {available.length === 0 && (
          <li className="py-3 text-center text-xs text-cf-muted-foreground">
            {t('tactics.noAvailablePlayers')}
          </li>
        )}
        {available.map((p) => (
          <DraggableSquadRow
            key={p.id}
            player={p}
            onPlaceOnPitch={onPlaceOnPitch}
            onPlaceOnBench={onPlaceOnBench}
          />
        ))}
      </ul>
    </div>
  )
}
