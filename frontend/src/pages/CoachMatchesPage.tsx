import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Eye, Plus, Trophy } from 'lucide-react'
import EmptyState from '../components/ui/EmptyState'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import { matchService } from '../services/matchService'
import type { Match } from '../types'
import { toDisplayLocale } from '../utils/localeDateFormatter'
import { cn } from '../lib/utils'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const RESULT_BADGE: Record<string, string> = {
  WIN:  'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-400 dark:ring-emerald-800',
  DRAW: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950 dark:text-amber-400 dark:ring-amber-800',
  LOSS: 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-950 dark:text-red-400 dark:ring-red-800',
}

function formatShortDate(d: string, locale: string): string {
  const date = new Date(d)
  const day = date.getDate().toString().padStart(2, '0')
  const month = date.toLocaleDateString(locale, { month: 'short' })
  const year = date.getFullYear()
  return `${day} ${month} ${year}`
}

// ---------------------------------------------------------------------------
// Desktop table row
// ---------------------------------------------------------------------------

function MatchTableRow({ match, onView }: { match: Match; onView: () => void }) {
  const { t, i18n } = useTranslation()
  const displayLocale = toDisplayLocale(i18n.language)

  return (
    <tr className="hover:bg-cf-muted/50 transition-colors">
      <td className="py-3 pl-4 pr-3 whitespace-nowrap text-sm text-cf-muted-foreground">
        {formatShortDate(match.match_date, displayLocale)}
      </td>
      <td className="px-3 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-cf-surface-foreground">
            vs {match.opponent_name}
          </p>
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
              match.home_away === 'HOME'
                ? 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-400 dark:ring-emerald-800'
                : 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700',
            )}
          >
            {match.home_away === 'HOME' ? t('matches.homeBadge') : t('matches.awayBadge')}
          </span>
        </div>
      </td>
      <td className="px-3 py-3 text-sm text-cf-muted-foreground">
        {match.competition || '—'}
      </td>
      <td className="px-3 py-3 whitespace-nowrap">
        {match.score_display ? (
          <span className="font-mono text-sm font-bold text-cf-surface-foreground">
            {match.score_display}
          </span>
        ) : (
          <span className="text-sm text-cf-muted-foreground">{t('matches.upcomingBadge')}</span>
        )}
      </td>
      <td className="px-3 py-3">
        {match.result ? (
          <span
            className={cn(
              'rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset',
              RESULT_BADGE[match.result] ?? 'bg-cf-muted text-cf-muted-foreground ring-cf-border',
            )}
          >
            {match.result === 'WIN'
              ? t('matches.winBadge')
              : match.result === 'DRAW'
              ? t('matches.drawBadge')
              : t('matches.lossBadge')}
          </span>
        ) : (
          <span className="text-sm text-cf-muted-foreground">—</span>
        )}
      </td>
      <td className="px-3 py-3 text-sm text-cf-muted-foreground">
        {match.team_name}
      </td>
      <td className="pl-3 pr-4 py-3 text-right">
        <button
          onClick={onView}
          aria-label="View match"
          className={cn(
            'inline-flex items-center justify-center h-8 w-8 rounded-lg transition',
            'text-cf-muted-foreground hover:text-cf-surface-foreground hover:bg-cf-muted',
          )}
        >
          <Eye size={16} />
        </button>
      </td>
    </tr>
  )
}

// ---------------------------------------------------------------------------
// Mobile card
// ---------------------------------------------------------------------------

function MatchMobileCard({ match, onView }: { match: Match; onView: () => void }) {
  const { t, i18n } = useTranslation()
  const displayLocale = toDisplayLocale(i18n.language)
  const date = new Date(match.match_date)

  return (
    <button
      onClick={onView}
      className={cn(
        'w-full text-left rounded-2xl p-4 ring-1 bg-cf-surface ring-cf-border transition',
        'hover:ring-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {/* Date + result row */}
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="text-xs text-cf-muted-foreground">
              {date.toLocaleDateString(displayLocale, { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
            {match.result && (
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset',
                  RESULT_BADGE[match.result] ?? 'bg-cf-muted text-cf-muted-foreground ring-cf-border',
                )}
              >
                {match.result === 'WIN'
                  ? t('matches.winBadge')
                  : match.result === 'DRAW'
                  ? t('matches.drawBadge')
                  : t('matches.lossBadge')}
              </span>
            )}
          </div>

          {/* Opponent + score */}
          <div className="flex flex-wrap items-center gap-3">
            <p className="font-semibold text-cf-surface-foreground">vs {match.opponent_name}</p>
            {match.score_display && (
              <span className="font-mono text-sm font-bold text-cf-surface-foreground">
                {match.score_display}
              </span>
            )}
          </div>

          {/* Meta */}
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-cf-muted-foreground">
            <span>{match.team_name}</span>
            {match.competition && <span>{match.competition}</span>}
            <span
              className={cn(
                'rounded-full px-1.5 py-0.5 font-medium ring-1 ring-inset',
                match.home_away === 'HOME'
                  ? 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-400 dark:ring-emerald-800'
                  : 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700',
              )}
            >
              {match.home_away === 'HOME' ? t('matches.homeBadge') : t('matches.awayBadge')}
            </span>
          </div>
        </div>
      </div>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CoachMatchesPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [matches, setMatches] = useState<Match[]>([])
  const [total, setTotal] = useState(0)
  const [hasNext, setHasNext] = useState(false)
  const [hasPrev, setHasPrev] = useState(false)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    matchService
      .listMatches({ page })
      .then((data) => {
        setMatches(data.results)
        setTotal(data.count)
        setHasNext(data.next !== null)
        setHasPrev(data.previous !== null)
        setLoading(false)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : t('matches.error.loadFailed'))
        setLoading(false)
      })
  }, [page, t])

  const totalPages = Math.max(1, Math.ceil(total / 20))

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-cf-surface-foreground">{t('matches.listTitle')}</h1>
            <p className="mt-1 text-sm text-cf-muted-foreground">
              {!loading && t('matches.matchCount', { count: total })}
            </p>
          </div>
          <button
            onClick={() => navigate('/coach/matches/new')}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium bg-emerald-500 hover:bg-emerald-600 text-white transition-colors"
          >
            <Plus size={16} />
            {t('matches.addButton')}
          </button>
        </div>

        {/* Loading */}
        {loading && matches.length === 0 && <LoadingSpinner />}

        {/* Error */}
        {!loading && error && (
          <EmptyState
            icon={<AlertTriangle size={24} />}
            title={t('matches.error.loadFailed')}
            description={error}
          />
        )}

        {/* Content */}
        {(!loading || matches.length > 0) && !error && (
          <>
            {matches.length === 0 && !loading ? (
              <EmptyState
                icon={<Trophy size={24} />}
                title={t('matches.emptyTitle')}
                description={t('matches.emptyDesc')}
              />
            ) : (
              <>
                {/* Desktop table */}
                <div className="hidden md:block overflow-hidden rounded-2xl ring-1 ring-cf-border">
                  <table className="min-w-full divide-y divide-cf-border">
                    <thead>
                      <tr className="bg-cf-muted">
                        <th className="py-3 pl-4 pr-3 text-left text-xs font-semibold uppercase tracking-wider text-cf-muted-foreground">
                          {t('matches.tableDate')}
                        </th>
                        <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-cf-muted-foreground">
                          {t('matches.tableOpponent')}
                        </th>
                        <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-cf-muted-foreground">
                          {t('matches.tableCompetition')}
                        </th>
                        <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-cf-muted-foreground">
                          {t('matches.tableScore')}
                        </th>
                        <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-cf-muted-foreground">
                          {t('matches.tableResult')}
                        </th>
                        <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-cf-muted-foreground">
                          {t('matches.tableTeam')}
                        </th>
                        <th className="pl-3 pr-4 py-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-cf-border bg-cf-surface">
                      {matches.map((m) => (
                        <MatchTableRow
                          key={m.id}
                          match={m}
                          onView={() => navigate(`/coach/matches/${m.id}`)}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile cards */}
                <div className="md:hidden space-y-3">
                  {matches.map((m) => (
                    <MatchMobileCard
                      key={m.id}
                      match={m}
                      onView={() => navigate(`/coach/matches/${m.id}`)}
                    />
                  ))}
                </div>
              </>
            )}

            {/* Pagination */}
            {(hasNext || hasPrev) && (
              <div className="mt-8 flex items-center justify-between">
                <button
                  onClick={() => setPage((p) => p - 1)}
                  disabled={!hasPrev || loading}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium bg-cf-surface ring-1 ring-cf-border text-cf-surface-foreground hover:bg-cf-muted transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {t('pagination.previous')}
                </button>
                <p className="text-sm text-cf-muted-foreground">
                  {t('pagination.page')}{' '}
                  <span className="font-semibold text-cf-surface-foreground">{page}</span>
                  {' '}{t('pagination.of')}{' '}
                  <span className="font-semibold text-cf-surface-foreground">{totalPages}</span>
                </p>
                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={!hasNext || loading}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium bg-cf-surface ring-1 ring-cf-border text-cf-surface-foreground hover:bg-cf-muted transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {t('pagination.next')}
                </button>
              </div>
            )}
          </>
        )}
    </div>
  )
}
