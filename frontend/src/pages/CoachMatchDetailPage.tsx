import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  CalendarDays,
  Edit2,
  MapPin,
  Plus,
  Trophy,
  UserPen,
} from 'lucide-react'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import DataTable, { type Column } from '../components/ui/DataTable'
import EmptyState from '../components/ui/EmptyState'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import Panel from '../components/ui/Panel'
import StatCard from '../components/ui/StatCard'
import { RESULT_VARIANT, resultLabelKey } from '../constants/badgeVariants'
import { matchService } from '../services/matchService'
import type { Match, MatchStats } from '../types'
import { parseDateOnly, relativeToToday } from '../utils/dateOnly'
import { toDisplayLocale } from '../utils/localeDateFormatter'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function passAccuracy(s: MatchStats): number | null {
  return s.passes_attempted > 0 ? Math.round((s.passes_completed / s.passes_attempted) * 100) : null
}

/** Shows a count, or an em dash for zero. */
function countOrDash(n: number): string | number {
  return n || '—'
}

function CardIndicator({ count, color, title }: { count: number; color: string; title: string }) {
  if (count <= 0) return <span className="text-cf-muted-foreground">—</span>
  return (
    <span className="inline-flex items-center gap-1" title={title}>
      <span className={`inline-block h-3.5 w-2.5 rounded-sm ${color}`} aria-hidden="true" />
      <span className="text-xs tabular-nums">{count}</span>
      <span className="sr-only">{title}</span>
    </span>
  )
}

function RatingBadge({ rating }: { rating: string | null }) {
  if (!rating) return <span className="text-cf-muted-foreground">—</span>
  return <Badge variant="emerald" className="tabular-nums">{parseFloat(rating).toFixed(1)}</Badge>
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
    return <LoadingSpinner />
  }

  if (error || !match) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <EmptyState
          icon={<AlertTriangle size={20} />}
          title={t('matches.error.matchLoadFailed')}
          description={error ?? t('matches.error.notFound')}
        />
      </div>
    )
  }

  const longDate = parseDateOnly(match.match_date).toLocaleDateString(displayLocale, {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
  const hasScore = match.team_score !== null && match.opponent_score !== null
  const isUpcoming = relativeToToday(match.match_date) !== 'past'
  const editStatsPath = (s: MatchStats) => `/coach/matches/${match.id}/edit-stats/${s.id}`

  const totals = {
    players: playerStats.length,
    starters: playerStats.filter((s) => s.started).length,
    goals: playerStats.reduce((tot, s) => tot + s.goals, 0),
    assists: playerStats.reduce((tot, s) => tot + s.assists, 0),
  }

  const num = 'text-center tabular-nums text-cf-muted-foreground'
  const numHead = 'text-center'

  const statsColumns: Column<MatchStats>[] = [
    {
      key: 'player',
      header: t('matches.tablePlayer'),
      cellClassName: 'whitespace-nowrap',
      render: (s) => (
        <div>
          <p className="font-medium text-cf-surface-foreground">{s.player_name}</p>
          <p className="font-mono text-xs text-emerald-600 dark:text-emerald-400">{s.football_id}</p>
        </div>
      ),
    },
    {
      key: 'start',
      header: t('matches.tableStart'),
      headerClassName: numHead,
      cellClassName: 'text-center',
      render: (s) =>
        s.started
          ? <Badge variant="emerald">{t('matches.playerStarted')}</Badge>
          : <Badge>{t('matches.playerSubstitute')}</Badge>,
    },
    { key: 'min', header: t('matches.tableMin'), headerClassName: numHead, cellClassName: num, render: (s) => s.minutes_played },
    {
      key: 'goals',
      header: t('matches.tableG'),
      headerClassName: numHead,
      cellClassName: 'text-center tabular-nums font-semibold text-cf-surface-foreground',
      render: (s) => countOrDash(s.goals),
    },
    { key: 'assists', header: t('matches.tableA'), headerClassName: numHead, cellClassName: num, render: (s) => countOrDash(s.assists) },
    {
      key: 'shots',
      header: t('matches.tableShots'),
      headerClassName: numHead,
      cellClassName: num,
      render: (s) => (s.shots > 0 ? `${s.shots_on_target}/${s.shots}` : '—'),
    },
    {
      key: 'pass',
      header: t('matches.tablePassPct'),
      headerClassName: numHead,
      cellClassName: num,
      render: (s) => {
        const pct = passAccuracy(s)
        return pct !== null ? `${pct}%` : '—'
      },
    },
    { key: 'kp', header: t('matches.tableKeyPasses'), headerClassName: numHead, cellClassName: num, render: (s) => countOrDash(s.key_passes) },
    { key: 'drb', header: t('matches.tableDribbles'), headerClassName: numHead, cellClassName: num, render: (s) => countOrDash(s.dribbles) },
    { key: 'tkl', header: t('matches.tableTackles'), headerClassName: numHead, cellClassName: num, render: (s) => countOrDash(s.tackles) },
    { key: 'int', header: t('matches.tableInterceptions'), headerClassName: numHead, cellClassName: num, render: (s) => countOrDash(s.interceptions) },
    {
      key: 'yc',
      header: t('matches.tableYellow'),
      headerClassName: numHead,
      cellClassName: 'text-center',
      render: (s) => (
        <CardIndicator
          count={s.yellow_cards}
          color="bg-amber-400"
          title={t('matchStats.yellowCardTitle', { count: s.yellow_cards })}
        />
      ),
    },
    {
      key: 'rc',
      header: t('matches.tableRed'),
      headerClassName: numHead,
      cellClassName: 'text-center',
      render: (s) => (
        <CardIndicator
          count={s.red_cards}
          color="bg-red-500"
          title={t('matchStats.redCardTitle', { count: s.red_cards })}
        />
      ),
    },
    {
      key: 'rating',
      header: t('matches.tableRating'),
      headerClassName: numHead,
      cellClassName: 'text-center',
      render: (s) => <RatingBadge rating={s.rating} />,
    },
    {
      key: 'actions',
      header: '',
      cellClassName: 'text-right whitespace-nowrap',
      render: (s) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(editStatsPath(s))}
          aria-label={`${t('matchStats.editStats')} — ${s.player_name}`}
        >
          <Edit2 size={12} />
          {t('matchStats.editStats')}
        </Button>
      ),
    },
  ]

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Back link + edit */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/coach/matches"
          className="inline-flex items-center gap-1.5 text-sm text-cf-muted-foreground transition-colors hover:text-cf-surface-foreground"
        >
          <ArrowLeft size={14} />
          {t('matches.allMatches')}
        </Link>
        <Button variant="secondary" onClick={() => navigate(`/coach/matches/${match.id}/edit`)}>
          <Edit2 size={14} />
          {t('matches.editMatch')}
        </Button>
      </div>

      {/* Scoreboard */}
      <section className="mb-5 overflow-hidden rounded-xl bg-cf-surface ring-1 ring-cf-border">
        <div className="flex flex-wrap items-center justify-center gap-2 border-b border-cf-border px-4 py-2 text-xs text-cf-muted-foreground">
          {match.home_away === 'HOME'
            ? <Badge variant="emerald">{t('matches.homeBadge')}</Badge>
            : <Badge>{t('matches.awayBadge')}</Badge>}
          {match.competition && <span className="font-medium">{match.competition}</span>}
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-6 sm:gap-6">
          <h1 className="text-right text-base font-semibold leading-tight text-cf-surface-foreground sm:text-lg">
            {match.team_name}
          </h1>

          <div className="flex min-w-[6rem] flex-col items-center gap-1.5">
            {hasScore ? (
              <p className="font-mono text-3xl font-bold tabular-nums text-cf-surface-foreground sm:text-4xl">
                {match.team_score}
                <span className="mx-1.5 text-cf-muted-foreground">–</span>
                {match.opponent_score}
              </p>
            ) : isUpcoming ? (
              <Badge variant="sky">{t('matches.upcomingBadge')}</Badge>
            ) : (
              <p className="text-center text-xs text-cf-muted-foreground">{t('matches.noScore')}</p>
            )}
            {match.result && (
              <Badge variant={RESULT_VARIANT[match.result]}>{t(resultLabelKey(match.result))}</Badge>
            )}
          </div>

          <p className="text-base font-semibold leading-tight text-cf-surface-foreground sm:text-lg">
            {match.opponent_name}
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-x-5 gap-y-1.5 border-t border-cf-border bg-cf-muted/40 px-4 py-2.5 text-xs text-cf-muted-foreground">
          <span className="flex items-center gap-1.5">
            <CalendarDays size={13} />
            <span className="first-letter:uppercase">{longDate}</span>
          </span>
          {match.venue && (
            <span className="flex items-center gap-1.5">
              <MapPin size={13} />
              {match.venue}
            </span>
          )}
          {match.academy_name && (
            <span className="flex items-center gap-1.5">
              <Building2 size={13} />
              {match.academy_name}
            </span>
          )}
          {match.created_by_name && (
            <span className="flex items-center gap-1.5">
              <UserPen size={13} />
              {t('matches.recordedBy')}: {match.created_by_name}
            </span>
          )}
        </div>
      </section>

      {/* Notes */}
      {match.notes && (
        <Panel title={t('matches.sectionNotes')} className="mb-5">
          <p className="whitespace-pre-line text-sm text-cf-muted-foreground">{match.notes}</p>
        </Panel>
      )}

      {/* Summary */}
      {playerStats.length > 0 && (
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label={t('matches.summaryPlayers')} value={String(totals.players)} />
          <StatCard label={t('matches.summaryStarters')} value={String(totals.starters)} />
          <StatCard label={t('matches.summaryGoals')} value={String(totals.goals)} />
          <StatCard label={t('matches.summaryAssists')} value={String(totals.assists)} />
        </div>
      )}

      {/* Player stats */}
      <Panel
        title={t('matches.playerStatsTitle')}
        count={playerStats.length}
        bodyClassName="p-0"
        action={
          <Button size="sm" onClick={() => navigate(`/coach/matches/${match.id}/add-stats`)}>
            <Plus size={13} />
            {t('matches.addStats')}
          </Button>
        }
      >
        {playerStats.length === 0 ? (
          <EmptyState
            icon={<Trophy size={20} />}
            title={t('matches.noPlayerStats')}
            description={t('matches.noPlayerStatsHint')}
            className="rounded-none ring-0"
          />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block">
              <DataTable
                columns={statsColumns}
                rows={playerStats}
                rowKey={(s) => s.id}
                className="rounded-none ring-0"
              />
            </div>

            {/* Mobile list */}
            <ul className="divide-y divide-cf-border md:hidden">
              {playerStats.map((s) => {
                const pct = passAccuracy(s)
                return (
                  <li key={s.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-cf-surface-foreground">{s.player_name}</p>
                        <p className="font-mono text-xs text-emerald-600 dark:text-emerald-400">{s.football_id}</p>
                      </div>
                      <div className="flex flex-shrink-0 items-center gap-1">
                        <RatingBadge rating={s.rating} />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(editStatsPath(s))}
                          aria-label={`${t('matchStats.editStats')} — ${s.player_name}`}
                        >
                          <Edit2 size={13} />
                        </Button>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-cf-muted-foreground">
                      <span>
                        {s.started ? t('matches.playerStarted') : t('matches.playerSubstitute')}
                        {' '}&middot; {s.minutes_played}{t('matches.statsMobileMinutes')}
                      </span>
                      {s.goals > 0 && <span>{s.goals} {t('matches.statsMobileGoals')}</span>}
                      {s.assists > 0 && <span>{s.assists} {t('matches.statsMobileAssists')}</span>}
                      {s.shots > 0 && <span>{t('matches.tableShots')} {s.shots_on_target}/{s.shots}</span>}
                      {pct !== null && <span>{t('matches.tablePassPct')} {pct}%</span>}
                      {s.yellow_cards > 0 && (
                        <CardIndicator
                          count={s.yellow_cards}
                          color="bg-amber-400"
                          title={t('matchStats.yellowCardTitle', { count: s.yellow_cards })}
                        />
                      )}
                      {s.red_cards > 0 && (
                        <CardIndicator
                          count={s.red_cards}
                          color="bg-red-500"
                          title={t('matchStats.redCardTitle', { count: s.red_cards })}
                        />
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </Panel>
    </div>
  )
}
