import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  Edit2,
  MapPin,
  Plus,
  Trophy,
} from 'lucide-react'
import AppNav from '../components/ui/AppNav'
import EmptyState from '../components/ui/EmptyState'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import { matchService } from '../services/matchService'
import type { Match, MatchStats } from '../types'
import { toDisplayLocale } from '../utils/localeDateFormatter'
import { cn } from '../lib/utils'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatLongDate(d: string, locale: string): string {
  return new Date(d).toLocaleDateString(locale, {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

const RESULT_BADGE: Record<string, string> = {
  WIN:  'bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-900 dark:text-emerald-300 dark:ring-emerald-700',
  DRAW: 'bg-amber-100 text-amber-700 ring-amber-200 dark:bg-amber-900 dark:text-amber-300 dark:ring-amber-700',
  LOSS: 'bg-red-100 text-red-700 ring-red-200 dark:bg-red-900 dark:text-red-300 dark:ring-red-700',
}

// ---------------------------------------------------------------------------
// Summary stat cell
// ---------------------------------------------------------------------------

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="text-center">
      <p className="text-lg font-bold text-cf-surface-foreground">{value}</p>
      <p className="text-xs text-cf-muted-foreground">{label}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CoachMatchDetailPage() {
  const { matchId } = useParams<{ matchId: string }>()
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const displayLocale = toDisplayLocale(i18n.language)

  const [match, setMatch] = useState<Match | null>(null)
  const [playerStats, setPlayerStats] = useState<MatchStats[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!matchId) return
    Promise.all([
      matchService.getMatch(matchId),
      matchService.listPlayerStats(matchId),
    ])
      .then(([m, s]) => {
        setMatch(m)
        setPlayerStats(s)
        setLoading(false)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : t('matches.error.matchLoadFailed'))
        setLoading(false)
      })
  }, [matchId, t])

  if (loading) {
    return (
      <div className="min-h-screen bg-cf-background">
        <AppNav label={t('matches.matchNavLabel')} />
        <LoadingSpinner />
      </div>
    )
  }

  if (error || !match) {
    return (
      <div className="min-h-screen bg-cf-background">
        <AppNav label={t('matches.matchNavLabel')} />
        <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
          <EmptyState
            icon={<AlertTriangle size={24} />}
            title={t('matches.error.matchLoadFailed')}
            description={error ?? t('matches.error.notFound')}
          />
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-cf-background">
      <AppNav label={t('matches.matchNavLabel')} />

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        {/* Back + edit */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={() => navigate('/coach/matches')}
            className="inline-flex items-center gap-1.5 text-sm text-cf-muted-foreground hover:text-cf-surface-foreground transition-colors"
          >
            <ArrowLeft size={15} />
            {t('matches.backToMatches')}
          </button>

          <button
            onClick={() => navigate(`/coach/matches/${match.id}/edit`)}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium bg-cf-surface ring-1 ring-cf-border text-cf-surface-foreground hover:bg-cf-muted transition-colors"
          >
            <Edit2 size={15} />
            {t('matches.editMatch')}
          </button>
        </div>

        {/* Match hero */}
        <div className="mb-6 overflow-hidden rounded-2xl bg-slate-900 dark:bg-slate-800 p-6 text-white">
          <div className="flex flex-wrap items-start justify-between gap-4">
            {/* Left: team info */}
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span
                  className={cn(
                    'rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset',
                    match.home_away === 'HOME'
                      ? 'bg-emerald-900 text-emerald-300 ring-emerald-700'
                      : 'bg-slate-700 text-slate-300 ring-slate-600',
                  )}
                >
                  {match.home_away === 'HOME' ? t('matches.homeBadge') : t('matches.awayBadge')}
                </span>
                {match.competition && (
                  <span className="text-xs text-slate-400">{match.competition}</span>
                )}
              </div>
              <h1 className="text-xl font-bold text-white">
                {match.team_name}
              </h1>
              <p className="mt-0.5 text-sm text-slate-400">
                vs {match.opponent_name}
              </p>
            </div>

            {/* Right: score */}
            <div className="text-right">
              {match.score_display ? (
                <p className="text-5xl font-black tracking-tight text-white">
                  {match.score_display}
                </p>
              ) : (
                <p className="text-sm text-slate-400">{t('matches.noScore')}</p>
              )}
              {match.result && (
                <span
                  className={cn(
                    'mt-2 inline-block rounded-full px-3 py-0.5 text-sm font-bold ring-1 ring-inset',
                    RESULT_BADGE[match.result],
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
          </div>

          {/* Info row */}
          <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 border-t border-slate-700 pt-4 text-sm text-slate-300">
            <span>{formatLongDate(match.match_date, displayLocale)}</span>
            {match.academy_name && (
              <span className="flex items-center gap-1.5">
                <Building2 size={13} />
                {match.academy_name}
              </span>
            )}
            {match.venue && (
              <span className="flex items-center gap-1.5">
                <MapPin size={13} />
                {match.venue}
              </span>
            )}
          </div>
        </div>

        {/* Notes */}
        {match.notes && (
          <div className="mb-6 rounded-2xl p-4 ring-1 bg-cf-surface ring-cf-border">
            <p className="text-sm text-cf-muted-foreground">{match.notes}</p>
          </div>
        )}

        {/* Player stats */}
        <section>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-cf-muted-foreground">
              {t('matches.playerStats', { count: playerStats.length })}
            </h2>
            <button
              onClick={() => navigate(`/coach/matches/${match.id}/add-stats`)}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium bg-emerald-500 hover:bg-emerald-600 text-white transition-colors"
            >
              <Plus size={15} />
              {t('matches.addPlayerStats')}
            </button>
          </div>

          {playerStats.length === 0 ? (
            <EmptyState
              icon={<Trophy size={24} />}
              title={t('matches.noPlayerStats')}
              description={t('matches.noPlayerStatsHint')}
            />
          ) : (
            <div className="overflow-hidden rounded-2xl ring-1 ring-cf-border">
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="min-w-full divide-y divide-cf-border">
                  <thead>
                    <tr className="bg-cf-muted">
                      <th className="py-3 pl-4 pr-3 text-left text-xs font-semibold uppercase tracking-wider text-cf-muted-foreground whitespace-nowrap">
                        {t('matches.tablePlayer')}
                      </th>
                      <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-cf-muted-foreground">
                        {t('matches.tableStart')}
                      </th>
                      <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-cf-muted-foreground">
                        {t('matches.tableMin')}
                      </th>
                      <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-cf-muted-foreground">
                        {t('matches.tableG')}
                      </th>
                      <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-cf-muted-foreground">
                        {t('matches.tableA')}
                      </th>
                      <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-cf-muted-foreground">
                        {t('matches.tableShots')}
                      </th>
                      <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-cf-muted-foreground">
                        {t('matches.tablePassPct')}
                      </th>
                      <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-cf-muted-foreground">
                        {t('matches.tableTackles')}
                      </th>
                      <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-cf-muted-foreground">
                        {t('matches.tableYellow')}
                      </th>
                      <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-cf-muted-foreground">
                        {t('matches.tableRed')}
                      </th>
                      <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-cf-muted-foreground">
                        {t('matches.tableRating')}
                      </th>
                      <th className="pl-3 pr-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-cf-border bg-cf-surface">
                    {playerStats.map((s) => {
                      const passAccuracy =
                        s.passes_attempted > 0
                          ? Math.round((s.passes_completed / s.passes_attempted) * 100)
                          : null
                      return (
                        <tr key={s.id} className="hover:bg-cf-muted/50">
                          <td className="py-3 pl-4 pr-3 whitespace-nowrap">
                            <p className="text-sm font-medium text-cf-surface-foreground">
                              {s.player_name}
                            </p>
                            <p className="font-mono text-xs text-emerald-600 dark:text-emerald-400">
                              {s.football_id}
                            </p>
                          </td>
                          <td className="px-3 py-3 text-center text-sm text-cf-muted-foreground">
                            {s.started ? (
                              <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                                {t('matches.playerStarted')}
                              </span>
                            ) : (
                              <span className="text-cf-muted-foreground">
                                {t('matches.playerSubstitute')}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-center text-sm text-cf-muted-foreground">
                            {s.minutes_played}
                          </td>
                          <td className="px-3 py-3 text-center text-sm font-semibold text-cf-surface-foreground">
                            {s.goals || '—'}
                          </td>
                          <td className="px-3 py-3 text-center text-sm text-cf-muted-foreground">
                            {s.assists || '—'}
                          </td>
                          <td className="px-3 py-3 text-center text-sm text-cf-muted-foreground">
                            {s.shots > 0 ? `${s.shots_on_target}/${s.shots}` : '—'}
                          </td>
                          <td className="px-3 py-3 text-center text-sm text-cf-muted-foreground">
                            {passAccuracy !== null ? `${passAccuracy}%` : '—'}
                          </td>
                          <td className="px-3 py-3 text-center text-sm text-cf-muted-foreground">
                            {s.tackles || '—'}
                          </td>
                          <td className="px-3 py-3 text-center text-sm">
                            {s.yellow_cards > 0 ? (
                              <span
                                className="inline-block h-4 w-3 rounded-sm bg-amber-400"
                                title={t('matchStats.yellowCardTitle', { count: s.yellow_cards })}
                              />
                            ) : '—'}
                          </td>
                          <td className="px-3 py-3 text-center text-sm">
                            {s.red_cards > 0 ? (
                              <span
                                className="inline-block h-4 w-3 rounded-sm bg-red-500"
                                title={t('matchStats.redCardTitle', { count: s.red_cards })}
                              />
                            ) : '—'}
                          </td>
                          <td className="px-3 py-3 text-center">
                            {s.rating ? (
                              <span className="inline-flex items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950 px-2 py-0.5 text-sm font-bold text-emerald-700 dark:text-emerald-400">
                                {parseFloat(s.rating).toFixed(1)}
                              </span>
                            ) : (
                              <span className="text-sm text-cf-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="pl-3 pr-4 py-3 text-right whitespace-nowrap">
                            <button
                              onClick={() =>
                                navigate(`/coach/matches/${match.id}/edit-stats/${s.id}`)
                              }
                              className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 transition-colors"
                            >
                              <Edit2 size={12} />
                              {t('matchStats.editStats')}
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden divide-y divide-cf-border bg-cf-surface">
                {playerStats.map((s) => (
                  <div key={s.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-cf-surface-foreground">{s.player_name}</p>
                        <p className="font-mono text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">
                          {s.football_id}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {s.rating && (
                          <span className="inline-flex items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950 px-2 py-0.5 text-sm font-bold text-emerald-700 dark:text-emerald-400">
                            {parseFloat(s.rating).toFixed(1)}
                          </span>
                        )}
                        <button
                          onClick={() =>
                            navigate(`/coach/matches/${match.id}/edit-stats/${s.id}`)
                          }
                          className="text-cf-muted-foreground hover:text-cf-surface-foreground transition-colors"
                        >
                          <Edit2 size={14} />
                        </button>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-cf-muted-foreground">
                      <span>
                        {s.started
                          ? t('matches.playerStarted')
                          : t('matches.playerSubstitute')}
                        {' '}&middot; {s.minutes_played}{t('matches.statsMobileMinutes')}
                      </span>
                      {s.goals > 0 && (
                        <span>{s.goals} {t('matches.statsMobileGoals')}</span>
                      )}
                      {s.assists > 0 && (
                        <span>{s.assists} {t('matches.statsMobileAssists')}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Summary row */}
              {playerStats.length > 1 && (
                <div className="border-t border-cf-border bg-cf-muted px-4 py-3">
                  <div className="flex flex-wrap justify-end gap-6">
                    <Stat label={t('matches.summaryPlayers')} value={playerStats.length} />
                    <Stat
                      label={t('matches.summaryStarters')}
                      value={playerStats.filter((s) => s.started).length}
                    />
                    <Stat
                      label={t('matches.summaryGoals')}
                      value={playerStats.reduce((tot, s) => tot + s.goals, 0)}
                    />
                    <Stat
                      label={t('matches.summaryAssists')}
                      value={playerStats.reduce((tot, s) => tot + s.assists, 0)}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
