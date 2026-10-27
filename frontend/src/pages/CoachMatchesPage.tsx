import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, ChevronRight, Plus, Trophy } from 'lucide-react'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import DataTable, { type Column } from '../components/ui/DataTable'
import EmptyState from '../components/ui/EmptyState'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import PageHeader from '../components/ui/PageHeader'
import Pagination from '../components/ui/Pagination'
import { RESULT_VARIANT, resultLabelKey } from '../constants/badgeVariants'
import { matchService } from '../services/matchService'
import type { Match } from '../types'
import { parseDateOnly, relativeToToday } from '../utils/dateOnly'
import { toDisplayLocale } from '../utils/localeDateFormatter'
import { cn } from '../lib/utils'

// ---------------------------------------------------------------------------
// Shared cells
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20

function HomeAwayBadge({ match }: { match: Match }) {
  const { t } = useTranslation()
  return match.home_away === 'HOME'
    ? <Badge variant="emerald">{t('matches.homeBadge')}</Badge>
    : <Badge>{t('matches.awayBadge')}</Badge>
}

function ResultBadge({ match }: { match: Match }) {
  const { t } = useTranslation()
  if (!match.result) return null
  return <Badge variant={RESULT_VARIANT[match.result]}>{t(resultLabelKey(match.result))}</Badge>
}

/**
 * Recorded score, or — when no score exists — "Upcoming" for today/future
 * fixtures and "Score not recorded" for past ones. Never invents a score.
 */
function ScoreCell({ match }: { match: Match }) {
  const { t } = useTranslation()
  if (match.score_display) {
    return (
      <span className="font-mono text-sm font-bold tabular-nums text-cf-surface-foreground">
        {match.score_display}
      </span>
    )
  }
  return relativeToToday(match.match_date) === 'past'
    ? <span className="text-xs text-cf-muted-foreground">{t('matches.noScore')}</span>
    : <Badge variant="sky">{t('matches.upcomingBadge')}</Badge>
}

// ---------------------------------------------------------------------------
// Mobile card
// ---------------------------------------------------------------------------

function MatchMobileCard({ match, onView }: { match: Match; onView: () => void }) {
  const { t, i18n } = useTranslation()
  const displayLocale = toDisplayLocale(i18n.language)
  const date = parseDateOnly(match.match_date)

  return (
    <button
      onClick={onView}
      className={cn(
        'w-full rounded-xl p-3 text-left ring-1 transition',
        'bg-cf-surface ring-cf-border hover:ring-emerald-400',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400',
      )}
    >
      <div className="flex items-center justify-between gap-2 text-xs text-cf-muted-foreground">
        <span className="truncate">
          {date.toLocaleDateString(displayLocale, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
          {match.competition && <> · {match.competition}</>}
        </span>
        <ResultBadge match={match} />
      </div>

      <div className="mt-1.5 flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-sm font-semibold text-cf-surface-foreground">
          {t('matches.vsOpponent', { opponent: match.opponent_name })}
        </p>
        <div className="flex-shrink-0">
          <ScoreCell match={match} />
        </div>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-cf-muted-foreground">
        <HomeAwayBadge match={match} />
        <span>{match.team_name}</span>
      </div>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CoachMatchesPage() {
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const displayLocale = toDisplayLocale(i18n.language)
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

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const openMatch = (m: Match) => navigate(`/coach/matches/${m.id}`)

  // Inside the table the EmptyState drops its own frame (the table provides one)
  const renderEmpty = (inTable: boolean) => (
    <EmptyState
      icon={<Trophy size={20} />}
      title={t('matches.emptyTitle')}
      description={t('matches.emptyDesc')}
      className={inTable ? 'rounded-none ring-0' : undefined}
    />
  )

  const columns: Column<Match>[] = [
    {
      key: 'date',
      header: t('matches.tableDate'),
      cellClassName: 'whitespace-nowrap',
      render: (m) => {
        const date = parseDateOnly(m.match_date)
        return (
          <div>
            <p className="font-medium tabular-nums text-cf-surface-foreground">
              {date.toLocaleDateString(displayLocale, { day: '2-digit', month: 'short', year: 'numeric' })}
            </p>
            <p className="text-xs text-cf-muted-foreground">
              {date.toLocaleDateString(displayLocale, { weekday: 'short' })}
            </p>
          </div>
        )
      },
    },
    {
      key: 'opponent',
      header: t('matches.tableOpponent'),
      render: (m) => (
        <div className="min-w-0">
          <Link
            to={`/coach/matches/${m.id}`}
            onClick={(e) => e.stopPropagation()}
            className="font-semibold text-cf-surface-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50 rounded-sm"
          >
            {t('matches.vsOpponent', { opponent: m.opponent_name })}
          </Link>
          <p className="text-xs text-cf-muted-foreground">{m.team_name}</p>
        </div>
      ),
    },
    {
      key: 'homeAway',
      header: t('playerProfile.tableHomeAway'),
      render: (m) => <HomeAwayBadge match={m} />,
    },
    {
      key: 'competition',
      header: t('matches.tableCompetition'),
      cellClassName: 'text-cf-muted-foreground',
      render: (m) => m.competition || '—',
    },
    {
      key: 'score',
      header: t('matches.tableScore'),
      cellClassName: 'whitespace-nowrap',
      render: (m) => <ScoreCell match={m} />,
    },
    {
      key: 'result',
      header: t('matches.tableResult'),
      render: (m) => (m.result ? <ResultBadge match={m} /> : <span className="text-cf-muted-foreground">—</span>),
    },
    {
      key: 'chevron',
      header: '',
      headerClassName: 'w-8',
      render: () => <ChevronRight size={14} className="ml-auto text-cf-muted-foreground" />,
    },
  ]

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        title={t('matches.listTitle')}
        subtitle={t('matches.pageSubtitle')}
        action={
          <Button onClick={() => navigate('/coach/matches/new')}>
            <Plus size={14} />
            {t('matches.newMatch')}
          </Button>
        }
      />

      {!loading && !error && (
        <p className="mb-4 text-xs text-cf-muted-foreground">{t('matches.matchCount', { count: total })}</p>
      )}

      {/* Initial loading */}
      {loading && matches.length === 0 && <LoadingSpinner />}

      {/* Error */}
      {!loading && error && (
        <EmptyState
          icon={<AlertTriangle size={20} />}
          title={t('matches.error.loadFailed')}
          description={error}
        />
      )}

      {/* Content */}
      {(!loading || matches.length > 0) && !error && (
        <>
          {/* Desktop table (md+) */}
          <div className={cn('hidden md:block', loading && 'opacity-60')}>
            <DataTable
              columns={columns}
              rows={matches}
              rowKey={(m) => m.id}
              onRowClick={openMatch}
              empty={renderEmpty(true)}
            />
          </div>

          {/* Mobile cards (< md) */}
          <div className={cn('md:hidden', loading && 'opacity-60')}>
            {matches.length === 0 ? (
              renderEmpty(false)
            ) : (
              <div className="space-y-2">
                {matches.map((m) => (
                  <MatchMobileCard key={m.id} match={m} onView={() => openMatch(m)} />
                ))}
              </div>
            )}
          </div>

          {(hasNext || hasPrev) && (
            <Pagination
              className="mt-6"
              page={page}
              totalPages={totalPages}
              hasPrev={hasPrev}
              hasNext={hasNext}
              onPrev={() => setPage((p) => p - 1)}
              onNext={() => setPage((p) => p + 1)}
              disabled={loading}
            />
          )}
        </>
      )}
    </div>
  )
}
