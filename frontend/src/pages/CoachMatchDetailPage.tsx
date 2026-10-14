import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import AppNav from '../components/ui/AppNav'
import EmptyState from '../components/ui/EmptyState'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import { matchService } from '../services/matchService'
import type { Match, MatchStats } from '../types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

const RESULT_STYLE: Record<string, { badge: string; border: string }> = {
  WIN:  { badge: 'bg-green-100 text-green-700', border: 'border-l-green-400' },
  DRAW: { badge: 'bg-yellow-100 text-yellow-700', border: 'border-l-yellow-400' },
  LOSS: { badge: 'bg-red-100 text-red-700', border: 'border-l-red-400' },
}

// ---------------------------------------------------------------------------
// Stat cell helper
// ---------------------------------------------------------------------------

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="text-center">
      <p className="text-lg font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-400">{label}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CoachMatchDetailPage() {
  const { matchId } = useParams<{ matchId: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()

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
      <div className="min-h-screen bg-gray-50">
        <AppNav label={t('matches.matchNavLabel')} />
        <div className="flex min-h-[60vh] items-center justify-center">
          <LoadingSpinner />
        </div>
      </div>
    )
  }

  if (error || !match) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppNav label={t('matches.matchNavLabel')} />
        <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
          <EmptyState icon="⚠️" title={t('matches.error.matchLoadFailed')} description={error ?? t('matches.error.notFound')} />
        </main>
      </div>
    )
  }

  const resultStyle = match.result ? RESULT_STYLE[match.result] : null

  return (
    <div className="min-h-screen bg-gray-50">
      <AppNav label={t('matches.matchNavLabel')} />

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        {/* Back + actions */}
        <div className="mb-6 flex items-center justify-between">
          <button
            onClick={() => navigate('/coach/matches')}
            className="text-sm text-brand-600 hover:text-brand-700"
          >
            {t('matches.backToMatches')}
          </button>
          <button
            onClick={() => navigate(`/coach/matches/${match.id}/edit`)}
            className="rounded-xl border border-gray-200 bg-white px-4 py-1.5 text-sm font-medium text-gray-600 shadow-sm transition hover:border-gray-300 hover:text-gray-900"
          >
            {t('matches.editMatch')}
          </button>
        </div>

        {/* Match header */}
        <div className={`rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100 border-l-4 ${resultStyle?.border ?? 'border-l-gray-200'}`}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                {match.home_away === 'HOME' ? t('matches.homeBadge') : t('matches.awayBadge')}
                {match.competition && ` · ${match.competition}`}
              </p>
              <h1 className="mt-1 text-2xl font-bold text-gray-900">
                vs {match.opponent_name}
              </h1>
              <p className="mt-0.5 text-sm text-gray-400">{formatDate(match.match_date)}</p>
            </div>

            <div className="text-right">
              {match.score_display ? (
                <p className="text-4xl font-black tracking-tight text-gray-900">{match.score_display}</p>
              ) : (
                <p className="text-sm text-gray-300">{t('matches.noScore')}</p>
              )}
              {match.result && (
                <span className={`mt-1 inline-block rounded-full px-3 py-0.5 text-sm font-bold ${resultStyle?.badge}`}>
                  {match.result === 'WIN' ? t('matches.winBadge') : match.result === 'DRAW' ? t('matches.drawBadge') : t('matches.lossBadge')}
                </span>
              )}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide">{t('matches.team')}</p>
              <p className="mt-0.5 text-sm font-medium text-gray-700">{match.team_name}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide">{t('matches.academy')}</p>
              <p className="mt-0.5 text-sm font-medium text-gray-700">{match.academy_name}</p>
            </div>
            {match.venue && (
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide">{t('matches.venue')}</p>
                <p className="mt-0.5 text-sm font-medium text-gray-700">{match.venue}</p>
              </div>
            )}
          </div>

          {match.notes && (
            <p className="mt-4 text-sm text-gray-500">{match.notes}</p>
          )}
        </div>

        {/* Player stats */}
        <section className="mt-6">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">
              {t('matches.playerStats', { count: playerStats.length })}
            </h2>
            <button
              onClick={() => navigate(`/coach/matches/${match.id}/add-stats`)}
              className="rounded-xl bg-brand-600 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-700"
            >
              {t('matches.addPlayerStats')}
            </button>
          </div>

          {playerStats.length === 0 ? (
            <EmptyState
              icon="📋"
              title={t('matches.noPlayerStats')}
              description={t('matches.noPlayerStatsHint')}
            />
          ) : (
            <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-100">
              {/* Wide table — horizontal scroll on mobile */}
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-100">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="py-3 pl-4 pr-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide whitespace-nowrap">{t('matches.tablePlayer')}</th>
                      <th className="px-3 py-3 text-center text-xs font-medium text-gray-400 uppercase tracking-wide">{t('matches.tableStart')}</th>
                      <th className="px-3 py-3 text-center text-xs font-medium text-gray-400 uppercase tracking-wide">{t('matches.tableMin')}</th>
                      <th className="px-3 py-3 text-center text-xs font-medium text-gray-400 uppercase tracking-wide">{t('matches.tableG')}</th>
                      <th className="px-3 py-3 text-center text-xs font-medium text-gray-400 uppercase tracking-wide">{t('matches.tableA')}</th>
                      <th className="px-3 py-3 text-center text-xs font-medium text-gray-400 uppercase tracking-wide">{t('matches.tableShots')}</th>
                      <th className="px-3 py-3 text-center text-xs font-medium text-gray-400 uppercase tracking-wide">{t('matches.tablePassPct')}</th>
                      <th className="px-3 py-3 text-center text-xs font-medium text-gray-400 uppercase tracking-wide">{t('matches.tableTackles')}</th>
                      <th className="px-3 py-3 text-center text-xs font-medium text-gray-400 uppercase tracking-wide">{t('matches.tableYellow')}</th>
                      <th className="px-3 py-3 text-center text-xs font-medium text-gray-400 uppercase tracking-wide">{t('matches.tableRed')}</th>
                      <th className="px-3 py-3 text-center text-xs font-medium text-gray-400 uppercase tracking-wide">{t('matches.tableRating')}</th>
                      <th className="pl-3 pr-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {playerStats.map((s) => {
                      const passAccuracy = s.passes_attempted > 0
                        ? Math.round((s.passes_completed / s.passes_attempted) * 100)
                        : null
                      return (
                        <tr key={s.id} className="hover:bg-gray-50/50">
                          <td className="py-3 pl-4 pr-3 whitespace-nowrap">
                            <p className="text-sm font-medium text-gray-900">{s.player_name}</p>
                            <p className="font-mono text-xs text-brand-500">{s.football_id}</p>
                          </td>
                          <td className="px-3 py-3 text-center text-sm text-gray-600">
                            {s.started ? '✓' : '—'}
                          </td>
                          <td className="px-3 py-3 text-center text-sm text-gray-600">{s.minutes_played}</td>
                          <td className="px-3 py-3 text-center text-sm font-semibold text-gray-700">{s.goals || '—'}</td>
                          <td className="px-3 py-3 text-center text-sm text-gray-600">{s.assists || '—'}</td>
                          <td className="px-3 py-3 text-center text-sm text-gray-600">
                            {s.shots > 0 ? `${s.shots_on_target}/${s.shots}` : '—'}
                          </td>
                          <td className="px-3 py-3 text-center text-sm text-gray-600">
                            {passAccuracy !== null ? `${passAccuracy}%` : '—'}
                          </td>
                          <td className="px-3 py-3 text-center text-sm text-gray-600">{s.tackles || '—'}</td>
                          <td className="px-3 py-3 text-center text-sm">
                            {s.yellow_cards > 0 ? (
                              <span className="inline-block h-4 w-3 rounded-sm bg-yellow-400" title={`${s.yellow_cards} yellow`} />
                            ) : '—'}
                          </td>
                          <td className="px-3 py-3 text-center text-sm">
                            {s.red_cards > 0 ? (
                              <span className="inline-block h-4 w-3 rounded-sm bg-red-500" title={`${s.red_cards} red`} />
                            ) : '—'}
                          </td>
                          <td className="px-3 py-3 text-center">
                            {s.rating ? (
                              <span className="inline-flex items-center justify-center rounded-full bg-brand-50 px-2 py-0.5 text-sm font-bold text-brand-700">
                                {parseFloat(s.rating).toFixed(1)}
                              </span>
                            ) : (
                              <span className="text-sm text-gray-300">—</span>
                            )}
                          </td>
                          <td className="pl-3 pr-4 py-3 text-right whitespace-nowrap">
                            <button
                              onClick={() => navigate(`/coach/matches/${match.id}/edit-stats/${s.id}`)}
                              className="text-xs font-medium text-brand-600 hover:text-brand-700"
                            >
                              {t('playerProfile.editGoal')}
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Summary row */}
              {playerStats.length > 1 && (
                <div className="border-t border-gray-100 bg-gray-50 px-4 py-3">
                  <div className="flex flex-wrap justify-end gap-4">
                    <Stat label={t('matches.summaryPlayers')} value={playerStats.length} />
                    <Stat label={t('matches.summaryStarters')} value={playerStats.filter(s => s.started).length} />
                    <Stat label={t('matches.summaryGoals')} value={playerStats.reduce((tot, s) => tot + s.goals, 0)} />
                    <Stat label={t('matches.summaryAssists')} value={playerStats.reduce((tot, s) => tot + s.assists, 0)} />
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
