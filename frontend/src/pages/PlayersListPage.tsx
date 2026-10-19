import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Search, ChevronRight, AlertTriangle, Users } from 'lucide-react'
import AppNav from '../components/ui/AppNav'
import EmptyState from '../components/ui/EmptyState'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import { POSITIONS } from '../constants/football'
import { playerService } from '../services/playerService'
import { cn } from '../lib/utils'
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

// ---------------------------------------------------------------------------
// Player avatar (shared by table row and mobile card)
// ---------------------------------------------------------------------------

function PlayerAvatar({ player, size = 'md' }: { player: Player; size?: 'sm' | 'md' }) {
  const cls = size === 'sm'
    ? 'h-8 w-8 rounded-lg text-xs'
    : 'h-10 w-10 rounded-xl text-sm'

  if (player.profile_photo_url) {
    return (
      <img
        src={player.profile_photo_url}
        alt={`${player.first_name} ${player.last_name}`}
        className={cn(cls, 'flex-shrink-0 object-cover')}
      />
    )
  }
  return (
    <div
      className={cn(
        cls,
        'flex flex-shrink-0 items-center justify-center bg-emerald-500 font-bold text-white',
      )}
    >
      {initials(player)}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Mobile player card (sm screens)
// ---------------------------------------------------------------------------

function PlayerCard({ player }: { player: Player }) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const age = calcAge(player.date_of_birth)
  const position = player.preferred_position ? t('positions.' + player.preferred_position) : null

  return (
    <button
      onClick={() => navigate(`/players/${player.id}`)}
      className={cn(
        'group w-full rounded-2xl p-4 text-left ring-1 transition',
        'bg-cf-surface ring-cf-border hover:ring-emerald-400 hover:shadow-md',
      )}
    >
      <div className="flex items-center gap-3">
        <PlayerAvatar player={player} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-cf-surface-foreground">
            {player.first_name} {player.last_name}
          </p>
          <p className="mt-0.5 font-mono text-xs text-emerald-600 dark:text-emerald-400">
            {player.football_id}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {position && (
              <span className="rounded-full bg-cf-muted px-2 py-0.5 text-xs font-medium text-cf-muted-foreground">
                {position}
              </span>
            )}
            {player.jersey_number !== null && (
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
                #{player.jersey_number}
              </span>
            )}
            <span className="text-xs text-cf-muted-foreground">
              {t('players.yearsOld', { count: age })}
            </span>
          </div>
        </div>
        <ChevronRight
          size={16}
          className="flex-shrink-0 text-cf-muted-foreground transition group-hover:text-emerald-500"
        />
      </div>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Desktop table row
// ---------------------------------------------------------------------------

function PlayerRow({ player }: { player: Player }) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const age = calcAge(player.date_of_birth)
  const position = player.preferred_position ? t('positions.' + player.preferred_position) : null

  return (
    <tr
      onClick={() => navigate(`/players/${player.id}`)}
      className="group cursor-pointer transition-colors hover:bg-cf-muted/50"
    >
      <td className="whitespace-nowrap px-4 py-3">
        <div className="flex items-center gap-3">
          <PlayerAvatar player={player} size="sm" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-cf-surface-foreground">
              {player.first_name} {player.last_name}
            </p>
          </div>
        </div>
      </td>
      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-emerald-600 dark:text-emerald-400">
        {player.football_id}
      </td>
      <td className="whitespace-nowrap px-4 py-3">
        {position ? (
          <span className="rounded-full bg-cf-muted px-2.5 py-0.5 text-xs font-medium text-cf-muted-foreground">
            {position}
          </span>
        ) : (
          <span className="text-xs text-cf-muted-foreground">—</span>
        )}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-sm text-cf-muted-foreground">
        {t('players.yearsOld', { count: age })}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-sm text-cf-muted-foreground">
        {player.jersey_number !== null ? (
          <span className="font-medium text-cf-surface-foreground">#{player.jersey_number}</span>
        ) : (
          <span className="text-cf-muted-foreground">—</span>
        )}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-right">
        <ChevronRight
          size={16}
          className="ml-auto text-cf-muted-foreground transition group-hover:text-emerald-500"
        />
      </td>
    </tr>
  )
}

// ---------------------------------------------------------------------------
// Toolbar
// ---------------------------------------------------------------------------

interface ToolbarProps {
  search: string
  onSearch: (v: string) => void
  position: string
  onPosition: (v: string) => void
  count: number
  loading: boolean
}

function Toolbar({ search, onSearch, position, onPosition, count, loading }: ToolbarProps) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
        {/* Search */}
        <div className="relative flex-1 sm:max-w-xs">
          <Search
            size={14}
            className="pointer-events-none absolute inset-y-0 left-3 my-auto text-cf-muted-foreground"
          />
          <input
            type="search"
            placeholder={t('players.searchPlaceholder')}
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            className={cn(
              'w-full rounded-xl py-2 pl-8 pr-4 text-sm outline-none transition',
              'bg-cf-surface text-cf-surface-foreground placeholder:text-cf-muted-foreground',
              'ring-1 ring-cf-border focus:ring-2 focus:ring-emerald-400/50',
            )}
          />
        </div>

        {/* Position filter */}
        <select
          value={position}
          onChange={(e) => onPosition(e.target.value)}
          className={cn(
            'rounded-xl py-2 pl-3 pr-8 text-sm outline-none transition',
            'bg-cf-surface text-cf-surface-foreground ring-1 ring-cf-border',
            'focus:ring-2 focus:ring-emerald-400/50',
          )}
        >
          <option value="">{t('players.allPositions')}</option>
          {Object.keys(POSITIONS).map((code) => (
            <option key={code} value={code}>
              {t('positions.' + code)}
            </option>
          ))}
        </select>
      </div>

      {/* Count */}
      <p className="text-sm text-cf-muted-foreground sm:text-right">
        {loading ? (
          <span className="animate-pulse">{t('common.loading')}</span>
        ) : (
          t('players.playerCount', { count })
        )}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PlayersListPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [players, setPlayers] = useState<Player[]>([])
  const [total, setTotal] = useState(0)
  const [hasNext, setHasNext] = useState(false)
  const [hasPrev, setHasPrev] = useState(false)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [positionFilter, setPositionFilter] = useState('')

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setPage(1)
  }, [search, positionFilter])

  useEffect(() => {
    setLoading(true)
    setError(null)

    if (debounceRef.current) clearTimeout(debounceRef.current)

    const delay = page === 1 ? 300 : 0
    debounceRef.current = setTimeout(() => {
      playerService
        .list({ search: search.trim() || undefined, position: positionFilter || undefined, page })
        .then((data) => {
          setPlayers(data.results)
          setTotal(data.count)
          setHasNext(data.next !== null)
          setHasPrev(data.previous !== null)
          setLoading(false)
        })
        .catch((err: unknown) => {
          setError(err instanceof Error ? err.message : t('players.error.loadFailed2'))
          setLoading(false)
        })
    }, delay)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [search, positionFilter, page, t])

  return (
    <div className="min-h-screen bg-cf-background">
      <AppNav label={t('players.navLabel')} />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">

        {/* Page header */}
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-cf-foreground sm:text-3xl">
              {t('players.title')}
            </h1>
            <p className="mt-1 text-sm text-cf-muted-foreground">{t('players.subtitle')}</p>
          </div>
          <button
            onClick={() => navigate('/players/new')}
            className="flex-shrink-0 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-600"
          >
            {t('players.addButton')}
          </button>
        </div>

        {/* Initial loading */}
        {loading && players.length === 0 && <LoadingSpinner />}

        {/* Error */}
        {!loading && error && (
          <EmptyState
            icon={<AlertTriangle size={28} />}
            title={t('players.error.loadFailed')}
            description={error}
          />
        )}

        {/* Content */}
        {(!loading || players.length > 0) && !error && (
          <>
            <Toolbar
              search={search}
              onSearch={setSearch}
              position={positionFilter}
              onPosition={setPositionFilter}
              count={total}
              loading={loading}
            />

            <div className="mt-5">
              {players.length === 0 && !loading ? (
                <EmptyState
                  icon={<Users size={28} />}
                  title={
                    search || positionFilter
                      ? t('players.empty.noMatch')
                      : t('players.empty.noPlayers')
                  }
                  description={
                    search || positionFilter
                      ? t('players.empty.noMatchHint')
                      : t('players.empty.noPlayersHint')
                  }
                />
              ) : (
                <>
                  {/* ── Desktop table (md+) ── */}
                  <div className="hidden overflow-hidden rounded-2xl ring-1 bg-cf-surface ring-cf-border md:block">
                    <table className="min-w-full">
                      <thead>
                        <tr className="border-b border-cf-border bg-cf-muted">
                          {[
                            t('players.tablePlayer'),
                            t('players.tableFootballId'),
                            t('players.tablePosition'),
                            t('players.tableAge'),
                            t('players.tableJersey'),
                            '',
                          ].map((header, i) => (
                            <th
                              key={i}
                              className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-cf-muted-foreground"
                            >
                              {header}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-cf-border">
                        {players.map((player) => (
                          <PlayerRow key={player.id} player={player} />
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* ── Mobile card grid (< md) ── */}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:hidden">
                    {players.map((player) => (
                      <PlayerCard key={player.id} player={player} />
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Pagination */}
            {(hasNext || hasPrev) && (
              <div className="mt-8 flex items-center justify-between">
                <button
                  onClick={() => setPage((p) => p - 1)}
                  disabled={!hasPrev || loading}
                  className={cn(
                    'rounded-xl px-4 py-2 text-sm font-medium transition ring-1',
                    'bg-cf-surface text-cf-surface-foreground ring-cf-border',
                    'hover:bg-cf-muted disabled:cursor-not-allowed disabled:opacity-40',
                  )}
                >
                  {t('pagination.previous')}
                </button>
                <p className="text-sm text-cf-muted-foreground">
                  {t('pagination.page')}{' '}
                  <span className="font-semibold text-cf-surface-foreground">{page}</span>
                  {' '}{t('pagination.of')}{' '}
                  <span className="font-semibold text-cf-surface-foreground">
                    {Math.ceil(total / 20)}
                  </span>
                </p>
                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={!hasNext || loading}
                  className={cn(
                    'rounded-xl px-4 py-2 text-sm font-medium transition ring-1',
                    'bg-cf-surface text-cf-surface-foreground ring-cf-border',
                    'hover:bg-cf-muted disabled:cursor-not-allowed disabled:opacity-40',
                  )}
                >
                  {t('pagination.next')}
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
