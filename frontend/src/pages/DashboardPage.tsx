import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Users,
  Trophy,
  Activity,
  Plus,
  ChevronRight,
  BarChart2,
  LogIn,
  CalendarDays,
  Clock,
} from 'lucide-react'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import EmptyState from '../components/ui/EmptyState'
import PageHeader from '../components/ui/PageHeader'
import { useAuth } from '../context/AuthContext'
import { cn } from '../lib/utils'
import { playerService } from '../services/playerService'
import { trainingService } from '../services/trainingService'
import { matchService } from '../services/matchService'
import type { Match, TrainingSession } from '../types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatShortDate(dateStr: string): string {
  try {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
    })
  } catch {
    return dateStr
  }
}

// ---------------------------------------------------------------------------
// KPI card — compact, clickable stat tile
// ---------------------------------------------------------------------------

function KpiCard({
  icon,
  label,
  value,
  onClick,
}: {
  icon: ReactNode
  label: string
  value: string | null
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'group w-full rounded-xl p-4 text-left ring-1 transition-colors',
        'bg-cf-surface ring-cf-border hover:ring-emerald-400',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-cf-muted-foreground">
          {label}
        </p>
        <span className="text-cf-muted-foreground group-hover:text-emerald-500 transition-colors">
          {icon}
        </span>
      </div>
      {value === null ? (
        <div className="mt-2 h-7 w-12 animate-pulse rounded bg-cf-muted" />
      ) : (
        <p className="mt-2 text-2xl font-bold leading-none text-cf-surface-foreground">
          {value}
        </p>
      )}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Panel — section card with header + "view all" link
// ---------------------------------------------------------------------------

function Panel({
  title,
  onViewAll,
  children,
}: {
  title: string
  onViewAll: () => void
  children: ReactNode
}) {
  const { t } = useTranslation()
  return (
    <div className="overflow-hidden rounded-xl ring-1 bg-cf-surface ring-cf-border">
      <div className="flex items-center justify-between border-b border-cf-border px-4 py-3">
        <h2 className="text-sm font-semibold text-cf-surface-foreground">{title}</h2>
        <button
          onClick={onViewAll}
          className="text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline"
        >
          {t('dashboard.viewAll')} →
        </button>
      </div>
      <div>{children}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Session row
// ---------------------------------------------------------------------------

function SessionRow({ session }: { session: TrainingSession }) {
  const navigate = useNavigate()

  return (
    <button
      onClick={() => navigate(`/coach/sessions/${session.id}`)}
      className="group flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-cf-muted/50"
    >
      <span className="w-14 shrink-0 text-xs tabular-nums text-cf-muted-foreground">
        {formatShortDate(session.training_date)}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-cf-surface-foreground">
        {session.title}
      </span>
      {session.team_name && (
        <Badge className="shrink-0 max-w-[6rem] truncate">{session.team_name}</Badge>
      )}
      {session.duration_minutes != null && (
        <span className="shrink-0 flex items-center gap-1 text-xs text-cf-muted-foreground">
          <Clock size={11} aria-hidden="true" />
          {session.duration_minutes}m
        </span>
      )}
      <ChevronRight
        size={13}
        className="shrink-0 text-cf-muted-foreground transition-colors group-hover:text-emerald-500"
      />
    </button>
  )
}

// ---------------------------------------------------------------------------
// Match row
// ---------------------------------------------------------------------------

function MatchRow({ match }: { match: Match }) {
  const navigate = useNavigate()
  const { t } = useTranslation()

  const resultVariant =
    match.result === 'WIN'
      ? 'emerald'
      : match.result === 'DRAW'
      ? 'amber'
      : 'red'

  return (
    <button
      onClick={() => navigate(`/coach/matches/${match.id}`)}
      className="group flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-cf-muted/50"
    >
      <span className="w-14 shrink-0 text-xs tabular-nums text-cf-muted-foreground">
        {formatShortDate(match.match_date)}
      </span>
      <Badge
        variant={match.home_away === 'HOME' ? 'emerald' : 'default'}
        className="shrink-0"
      >
        {match.home_away === 'HOME' ? 'H' : 'A'}
      </Badge>
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-cf-surface-foreground">
        {t('matches.vsOpponent', { opponent: match.opponent_name })}
      </span>
      {match.score_display && (
        <span className="shrink-0 font-mono text-xs font-semibold text-cf-surface-foreground">
          {match.score_display}
        </span>
      )}
      {match.result && (
        <Badge variant={resultVariant} className="shrink-0">
          {t(`matches.${match.result.toLowerCase()}Badge`)}
        </Badge>
      )}
      <ChevronRight
        size={13}
        className="shrink-0 text-cf-muted-foreground transition-colors group-hover:text-emerald-500"
      />
    </button>
  )
}

// ---------------------------------------------------------------------------
// Unauthenticated feature card (landing page)
// ---------------------------------------------------------------------------

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: ReactNode
  title: string
  description: string
}) {
  return (
    <div className="rounded-xl p-4 ring-1 bg-cf-surface ring-cf-border">
      <div className="flex items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-cf-surface-foreground">{title}</p>
          <p className="mt-0.5 text-xs text-cf-muted-foreground leading-relaxed">
            {description}
          </p>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// DashboardPage
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const navigate = useNavigate()
  const { isAuthenticated, user } = useAuth()
  const { t } = useTranslation()

  const isCoach = user?.role === 'COACH' || user?.role === 'ACADEMY_ADMIN'
  const isPlayer = user?.role === 'PLAYER'
  const isParent = user?.role === 'PARENT'

  // ── Coach/Admin: live counts + recent activity ─────────────────────
  const [playerCount, setPlayerCount] = useState<number | null>(null)
  const [sessionCount, setSessionCount] = useState<number | null>(null)
  const [matchCount, setMatchCount] = useState<number | null>(null)
  const [recentSessions, setRecentSessions] = useState<TrainingSession[] | null>(null)
  const [recentMatches, setRecentMatches] = useState<Match[] | null>(null)

  useEffect(() => {
    if (!isAuthenticated || !isCoach) return
    void Promise.all([
      playerService.list({ page: 1 }),
      trainingService.listSessions({ page: 1 }),
      matchService.listMatches({ page: 1 }),
    ])
      .then(([players, sessions, matches]) => {
        setPlayerCount(players.count)
        setSessionCount(sessions.count)
        setMatchCount(matches.count)
        setRecentSessions(sessions.results.slice(0, 6))
        setRecentMatches(matches.results.slice(0, 6))
      })
      .catch(() => {
        // Counts stay null → KPI cards show skeleton (graceful degradation)
      })
  }, [isAuthenticated, isCoach])

  // ── Unauthenticated landing ────────────────────────────────────────
  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
        <div className="text-center">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500 text-sm font-bold text-white">
            CF
          </span>
          <h1 className="mt-5 text-2xl font-bold text-cf-foreground sm:text-3xl">
            {t('dashboard.hero.headline')}
          </h1>
          <p className="mx-auto mt-3 max-w-lg text-sm text-cf-muted-foreground leading-relaxed">
            {t('dashboard.hero.subheadline')}
          </p>
          <Button
            onClick={() => navigate('/login')}
            size="lg"
            className="mt-6"
          >
            <LogIn size={14} aria-hidden="true" />
            {t('dashboard.hero.signInCta')}
          </Button>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FeatureCard
            icon={<Users size={15} />}
            title={t('dashboard.features.playerProfiles.title')}
            description={t('dashboard.features.playerProfiles.description')}
          />
          <FeatureCard
            icon={<Activity size={15} />}
            title={t('dashboard.features.trainingSessions.title')}
            description={t('dashboard.features.trainingSessions.description')}
          />
          <FeatureCard
            icon={<Trophy size={15} />}
            title={t('dashboard.features.matches.title')}
            description={t('dashboard.features.matches.description')}
          />
          <FeatureCard
            icon={<BarChart2 size={15} />}
            title={t('dashboard.features.assessments.title')}
            description={t('dashboard.features.assessments.description')}
          />
        </div>
      </div>
    )
  }

  // ── Shared: header values ──────────────────────────────────────────
  const userName = user?.first_name || user?.email.split('@')[0] || ''
  const roleLabel = user?.role ? t(`dashboard.roleBadge.${user.role}`) : ''

  // ── Coach / Academy Admin ──────────────────────────────────────────
  if (isCoach) {
    return (
      <div className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6 lg:px-8">
        <PageHeader
          title={t('dashboard.title')}
          subtitle={t('dashboard.welcome', { name: userName })}
          action={
            <div className="flex items-center gap-2">
              <Badge variant="emerald">{roleLabel}</Badge>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => navigate('/coach/sessions/new')}
              >
                <Plus size={12} />
                {t('dashboard.actions.newSession')}
              </Button>
              <Button
                size="sm"
                onClick={() => navigate('/coach/matches/new')}
              >
                <Plus size={12} />
                {t('dashboard.actions.newMatch')}
              </Button>
            </div>
          }
        />

        {/* KPI row */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <KpiCard
            icon={<Users size={14} />}
            label={t('dashboard.kpi.totalPlayers')}
            value={playerCount !== null ? String(playerCount) : null}
            onClick={() => navigate('/players')}
          />
          <KpiCard
            icon={<CalendarDays size={14} />}
            label={t('dashboard.kpi.trainingSessions')}
            value={sessionCount !== null ? String(sessionCount) : null}
            onClick={() => navigate('/coach/sessions')}
          />
          <KpiCard
            icon={<Trophy size={14} />}
            label={t('dashboard.kpi.matchesPlayed')}
            value={matchCount !== null ? String(matchCount) : null}
            onClick={() => navigate('/coach/matches')}
          />
        </div>

        {/* Activity panels */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* Recent Sessions */}
          <Panel
            title={t('dashboard.recentSessions')}
            onViewAll={() => navigate('/coach/sessions')}
          >
            {recentSessions === null ? (
              <div className="space-y-px py-1">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="h-3 w-12 animate-pulse rounded bg-cf-muted" />
                    <div className="h-3 flex-1 animate-pulse rounded bg-cf-muted" />
                    <div className="h-3 w-10 animate-pulse rounded bg-cf-muted" />
                  </div>
                ))}
              </div>
            ) : recentSessions.length === 0 ? (
              <div className="px-4 py-6">
                <EmptyState
                  icon={<CalendarDays size={16} />}
                  title={t('dashboard.empty.noSessions')}
                  className="ring-0 bg-transparent py-4"
                />
              </div>
            ) : (
              <div className="divide-y divide-cf-border">
                {recentSessions.map((s) => (
                  <SessionRow key={s.id} session={s} />
                ))}
              </div>
            )}
          </Panel>

          {/* Recent Matches */}
          <Panel
            title={t('dashboard.recentMatches')}
            onViewAll={() => navigate('/coach/matches')}
          >
            {recentMatches === null ? (
              <div className="space-y-px py-1">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="h-3 w-12 animate-pulse rounded bg-cf-muted" />
                    <div className="h-3 w-5 animate-pulse rounded bg-cf-muted" />
                    <div className="h-3 flex-1 animate-pulse rounded bg-cf-muted" />
                    <div className="h-3 w-10 animate-pulse rounded bg-cf-muted" />
                  </div>
                ))}
              </div>
            ) : recentMatches.length === 0 ? (
              <div className="px-4 py-6">
                <EmptyState
                  icon={<Trophy size={16} />}
                  title={t('dashboard.empty.noMatches')}
                  className="ring-0 bg-transparent py-4"
                />
              </div>
            ) : (
              <div className="divide-y divide-cf-border">
                {recentMatches.map((m) => (
                  <MatchRow key={m.id} match={m} />
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>
    )
  }

  // ── Player ─────────────────────────────────────────────────────────
  if (isPlayer) {
    const profile = user?.player_profile
    return (
      <div className="mx-auto max-w-2xl space-y-5 px-4 py-6 sm:px-6">
        <PageHeader
          title={t('dashboard.title')}
          subtitle={t('dashboard.welcome', { name: userName })}
          action={<Badge variant="emerald">{roleLabel}</Badge>}
        />

        {profile != null ? (
          <div className="rounded-xl ring-1 bg-cf-surface ring-cf-border overflow-hidden">
            {/* Profile identity row */}
            <div className="flex items-center gap-4 border-b border-cf-border px-5 py-4">
              <span
                className={cn(
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
                  'bg-emerald-500 text-sm font-bold text-white',
                )}
              >
                {(user?.first_name?.[0] ?? '') + (user?.last_name?.[0] ?? '')}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-cf-surface-foreground">
                  {user?.first_name
                    ? `${user.first_name} ${user.last_name}`
                    : user?.email}
                </p>
                <p className="font-mono text-xs text-cf-muted-foreground">
                  {profile.football_id}
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 px-5 py-3">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => navigate(`/players/${profile.player_id}`)}
              >
                <Users size={12} />
                {t('dashboard.myProfile')}
              </Button>
              <Button
                size="sm"
                onClick={() => navigate(`/players/${profile.player_id}/report`)}
              >
                <BarChart2 size={12} />
                {t('dashboard.myReport')}
              </Button>
            </div>
          </div>
        ) : (
          <EmptyState
            icon={<Users size={16} />}
            title={t('dashboard.myProfile')}
            description={t('dashboard.myProfileDesc')}
          />
        )}
      </div>
    )
  }

  // ── Parent ─────────────────────────────────────────────────────────
  if (isParent) {
    return (
      <div className="mx-auto max-w-2xl space-y-5 px-4 py-6 sm:px-6">
        <PageHeader
          title={t('dashboard.title')}
          subtitle={t('dashboard.welcome', { name: userName })}
          action={<Badge variant="default">{roleLabel}</Badge>}
        />

        <button
          onClick={() => navigate('/players')}
          className={cn(
            'group flex w-full items-center justify-between rounded-xl px-5 py-4 ring-1 transition-colors',
            'bg-cf-surface ring-cf-border hover:ring-emerald-400',
          )}
        >
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
              <Users size={16} />
            </span>
            <div className="text-left">
              <p className="text-sm font-semibold text-cf-surface-foreground">
                {t('dashboard.quickLinks.myChildren.title')}
              </p>
              <p className="text-xs text-cf-muted-foreground">
                {t('dashboard.quickLinks.myChildren.description')}
              </p>
            </div>
          </div>
          <ChevronRight
            size={16}
            className="shrink-0 text-cf-muted-foreground transition-colors group-hover:text-emerald-500"
          />
        </button>
      </div>
    )
  }

  // ── Fallback (unknown role) ────────────────────────────────────────
  return (
    <div className="mx-auto max-w-2xl space-y-5 px-4 py-6 sm:px-6">
      <PageHeader
        title={t('dashboard.title')}
        subtitle={t('dashboard.welcome', { name: userName })}
      />
      <p className="text-sm text-cf-muted-foreground">
        {t('dashboard.description.default')}
      </p>
    </div>
  )
}
