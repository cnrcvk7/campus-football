import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppNav from '../components/ui/AppNav'
import EmptyState from '../components/ui/EmptyState'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import { POSITIONS } from '../constants/football'
import { playerService } from '../services/playerService'
import type { Player } from '../types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function calcAge(dob: string): number {
  return Math.floor((Date.now() - new Date(dob).getTime()) / (1000 * 60 * 60 * 24 * 365.25))
}

function initials(p: Player): string {
  return `${p.first_name[0] ?? ''}${p.last_name[0] ?? ''}`.toUpperCase()
}

// Gender labels
const GENDER: Record<string, string> = {
  M: 'Male', F: 'Female', O: 'Other', P: 'Undisclosed',
}

// ---------------------------------------------------------------------------
// Player card
// ---------------------------------------------------------------------------

function PlayerCard({ player }: { player: Player }) {
  const navigate = useNavigate()
  const age = calcAge(player.date_of_birth)
  const position = player.preferred_position ? POSITIONS[player.preferred_position] : null

  return (
    <button
      onClick={() => navigate(`/players/${player.id}`)}
      className="group w-full rounded-2xl bg-white p-5 text-left shadow-sm ring-1 ring-gray-100 transition hover:shadow-md hover:ring-brand-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
    >
      <div className="flex items-start gap-4">
        {/* Avatar */}
        {player.profile_photo_url ? (
          <img
            src={player.profile_photo_url}
            alt={`${player.first_name} ${player.last_name}`}
            className="h-12 w-12 flex-shrink-0 rounded-xl object-cover"
          />
        ) : (
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-brand-600 text-sm font-bold text-white group-hover:bg-brand-700 transition">
            {initials(player)}
          </div>
        )}

        {/* Info */}
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-gray-900 truncate">
            {player.first_name} {player.last_name}
          </p>
          <p className="mt-0.5 font-mono text-xs text-brand-500">
            {player.football_id}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {position && (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                {position}
              </span>
            )}
            {player.jersey_number !== null && (
              <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-600">
                #{player.jersey_number}
              </span>
            )}
            <span className="text-xs text-gray-400">{age} yrs</span>
            <span className="text-xs text-gray-300">·</span>
            <span className="text-xs text-gray-400">{GENDER[player.gender] ?? player.gender}</span>
          </div>
        </div>

        {/* Arrow */}
        <span className="mt-1 flex-shrink-0 text-gray-300 transition group-hover:translate-x-0.5 group-hover:text-brand-400">
          →
        </span>
      </div>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Toolbar (search + filters)
// ---------------------------------------------------------------------------

interface ToolbarProps {
  search: string
  onSearch: (v: string) => void
  position: string
  onPosition: (v: string) => void
  total: number
  filtered: number
}

function Toolbar({ search, onSearch, position, onPosition, total, filtered }: ToolbarProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      {/* Left: search + position */}
      <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-xs">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-400">
            ⌕
          </span>
          <input
            type="search"
            placeholder="Search by name or Football ID…"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            className="w-full rounded-xl border border-gray-200 py-2 pl-8 pr-4 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20 transition"
          />
        </div>

        <select
          value={position}
          onChange={(e) => onPosition(e.target.value)}
          className="rounded-xl border border-gray-200 py-2 pl-3 pr-8 text-sm text-gray-700 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20 transition bg-white"
        >
          <option value="">All positions</option>
          {Object.entries(POSITIONS).map(([code, label]) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {/* Right: count */}
      <p className="text-sm text-gray-400 sm:text-right">
        {filtered < total ? (
          <>
            <span className="font-semibold text-gray-700">{filtered}</span> of {total} players
          </>
        ) : (
          <>
            <span className="font-semibold text-gray-700">{total}</span>{' '}
            {total === 1 ? 'player' : 'players'}
          </>
        )}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PlayersListPage() {
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [positionFilter, setPositionFilter] = useState('')

  useEffect(() => {
    playerService
      .list()
      .then((data) => {
        setPlayers(data)
        setLoading(false)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load players.')
        setLoading(false)
      })
  }, [])

  const filtered = useMemo(() => {
    let result = players
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      result = result.filter(
        (p) =>
          `${p.first_name} ${p.last_name}`.toLowerCase().includes(q) ||
          p.football_id.toLowerCase().includes(q),
      )
    }
    if (positionFilter) {
      result = result.filter((p) => p.preferred_position === positionFilter)
    }
    return result
  }, [players, search, positionFilter])

  return (
    <div className="min-h-screen bg-gray-50">
      <AppNav label="Players" />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Page heading */}
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Players</h1>
            <p className="mt-1 text-sm text-gray-400">
              All registered players — click a card to view the full profile.
            </p>
          </div>
          <button
            onClick={() => navigate('/players/new')}
            className="flex-shrink-0 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
          >
            + Add Player
          </button>
        </div>

        {loading && <LoadingSpinner />}

        {!loading && error && (
          <EmptyState icon="⚠️" title="Could not load players" description={error} />
        )}

        {!loading && !error && (
          <>
            <Toolbar
              search={search}
              onSearch={setSearch}
              position={positionFilter}
              onPosition={setPositionFilter}
              total={players.length}
              filtered={filtered.length}
            />

            <div className="mt-6">
              {filtered.length === 0 ? (
                <EmptyState
                  icon="⚽"
                  title={players.length === 0 ? 'No players registered yet' : 'No players match your search'}
                  description={
                    players.length === 0
                      ? 'Players will appear here once added via the API.'
                      : 'Try adjusting your search or clearing the position filter.'
                  }
                />
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {filtered.map((player) => (
                    <PlayerCard key={player.id} player={player} />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
