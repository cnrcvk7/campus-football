import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Users,
  Trophy,
  ChevronRight,
  BarChart2,
  Layers,
  Shield,
  LogIn,
  Activity,
  User,
} from 'lucide-react'
import AppNav from '../components/ui/AppNav'
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
    // Append time to avoid local-timezone shifts on pure date strings
    return new Date(dateStr + 'T00:00:00').toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
    })
  } catch {
    return dateStr
  }
}

// ---------------------------------------------------------------------------
// KPI stat card (coach/admin — shows live count from API)
// ---------------------------------------------------------------------------

interface KpiCardProps {
  icon: ReactNode
  label: string
  /** null = data not yet loaded (shows animated placeholder) */
  value: string | null
  onClick: () => void
}

function KpiCard({ icon, label, value, onClick }: KpiCardProps) {
  const loading = value === null
  return (
    <button
      onClick={onClick}
      className={cn(
        'group flex flex-col gap-4 rounded-2xl p-5 text-left ring-1 transition',
        'bg-cf-surface ring-cf-border hover:ring-emerald-400 hover:shadow-md',
      )}
    >
      <div className="flex items-center justify-between">
        <div
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-xl',
            'bg-emerald-50 text-emerald-600',
            'dark:bg-emerald-950 dark:text-emerald-400',
          )}
        >
          {icon}
        </div>
        <ChevronRight
          size={15}
          className="text-cf-muted-foreground group-hover:text-emerald-500 transition-colors"
        />
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-cf-muted-foreground">
          {label}
        </p>
        <p
          className={cn(
            'mt-1 text-3xl font-bold',
            loading
              ? 'animate-pulse text-cf-muted-foreground'
              : 'text-cf-surface-foreground',
          )}
        >
          {loading ? '—' : value}
        </p>
      </div>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Quick-access navigation card
// ---------------------------------------------------------------------------

interface QuickLinkCardProps {
  icon: ReactNode
  title: string
  description: string
  openLabel: string
  onClick: () => void
}

function QuickLinkCard({
  icon,
  title,
  description,
  openLabel,
  onClick,
}: QuickLinkCardProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'group flex flex-col gap-3 rounded-2xl p-5 text-left ring-1 transition',
        'bg-cf-surface ring-cf-border hover:ring-emerald-400 hover:shadow-md',
      )}
    >
      <div
        className={cn(
          'flex h-10 w-10 items-center justify-center rounded-xl transition-colors',
          'bg-emerald-50 text-emerald-600',
          'dark:bg-emerald-950 dark:text-emerald-400',
          'group-hover:bg-emerald-500 group-hover:text-white',
          'dark:group-hover:bg-emerald-500 dark:group-hover:text-white',
        )}
      >
        {icon}
      </div>
      <div className="flex-1">
        <p className="font-semibold text-cf-surface-foreground group-hover:text-emerald-600 transition-colors">
          {title}
        </p>
        <p className="mt-0.5 text-sm text-cf-muted-foreground leading-relaxed">
          {description}
        </p>
      </div>
      <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
        {openLabel}
      </p>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Activity list row (sessions & matches)
// ---------------------------------------------------------------------------

interface ActivityRowProps {
  iconBg: string
  icon: ReactNode
  title: string
  subtitle: string
  trailing?: ReactNode
}

function ActivityRow({ iconBg, icon, title, subtitle, trailing }: ActivityRowProps) {
  return (
    <div className="flex items-start gap-3 rounded-xl px-4 py-3 hover:bg-cf-muted/50 transition-colors">
      <div
        className={cn(
          'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
          iconBg,
        )}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-cf-surface-foreground">{title}</p>
        <p className="text-xs text-cf-muted-foreground">{subtitle}</p>
      </div>
      {trailing}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Section card (header + scrollable list)
// ---------------------------------------------------------------------------

interface SectionCardProps {
  title: string
  actionLabel: string
  onAction: () => void
  children: ReactNode
}

function SectionCard({
  title,
  actionLabel,
  onAction,
  children,
}: SectionCardProps) {
  return (
    <div className="overflow-hidden rounded-2xl ring-1 bg-cf-surface ring-cf-border">
      <div className="flex items-center justify-between border-b border-cf-border px-5 py-4">
        <h2 className="text-sm font-semibold text-cf-surface-foreground">{title}</h2>
        <button
          onClick={onAction}
          className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
        >
          {actionLabel}
        </button>
      </div>
      <div className="py-2">{children}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Unauthenticated feature-preview card
// ---------------------------------------------------------------------------

function FeaturePreviewCard({
  icon,
  title,
  description,
}: {
  icon: ReactNode
  title: string
  description: string
}) {
  return (
    <div className="rounded-2xl p-6 ring-1 bg-cf-surface ring-cf-border">
      <div
        className={cn(
          'flex h-10 w-10 items-center justify-center rounded-xl',
          'bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400',
        )}
      >
        {icon}
      </div>
      <h3 className="mt-4 font-semibold text-cf-surface-foreground">{title}</h3>
      <p className="mt-1 text-sm text-cf-muted-foreground leading-relaxed">{description}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Match result badge
// ---------------------------------------------------------------------------

const RESULT_BADGE_CLASS: Record<'WIN' | 'DRAW' | 'LOSS', string> = {
  WIN: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400',
  DRAW: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400',
  LOSS: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400',
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

  // ── Coach/admin live data ──────────────────────────────────────────
  const [playerCount, setPlayerCount] = useState<number | null>(null)
  const [sessionCount, setSessionCount] = useState<number | null>(null)
  const [recentSessions, setRecentSessions] = useState<TrainingSession[] | null>(null)
  const [matchCount, setMatchCount] = useState<number | null>(null)
  const [recentMatches, setRecentMatches] = useState<Match[] | null>(null)

  useEffect(() => {
    if (!isAuthenticated || !isCoach) return
    void Promise.all([
      playerService.list({ page: 1 }),
      trainingService.listSessions({ page: 1 }),
      matchService.listMatches({ page: 1 }),
    ]).then(([players, sessions, matches]) => {
      setPlayerCount(players.count)
      setSessionCount(sessions.count)
      setRecentSessions(sessions.results.slice(0, 5))
      setMatchCount(matches.count)
      setRecentMatches(matches.results.slice(0, 5))
    }).catch(() => {
      // Counts stay null → KPI cards show '—' (graceful degradation)
    })
  }, [isAuthenticated, isCoach])

  // ── Unauthenticated view ───────────────────────────────────────────
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-cf-background">
        <AppNav />
        <main className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
          <div className="text-center">
            <div
              className={cn(
                'mx-auto flex h-16 w-16 items-center justify-center',
                'rounded-2xl bg-emerald-500 text-white text-lg font-bold shadow-lg',
              )}
            >
              CF
            </div>
            <h1 className="mt-6 text-3xl font-bold text-cf-foreground sm:text-4xl">
              {t('dashboard.hero.headline')}
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-base text-cf-muted-foreground leading-relaxed">
              {t('dashboard.hero.subheadline')}
            </p>
            <button
              onClick={() => navigate('/login')}
              className={cn(
                'mt-8 inline-flex items-center gap-2 rounded-xl px-6 py-3',
                'bg-emerald-500 text-sm font-semibold text-white shadow-sm',
                'transition hover:bg-emerald-600',
              )}
            >
              <LogIn size={16} aria-hidden="true" />
              {t('dashboard.hero.signInCta')}
            </button>
          </div>

          <div className="mt-16 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FeaturePreviewCard
              icon={<Users size={20} />}
              title={t('dashboard.features.playerProfiles.title')}
              description={t('dashboard.features.playerProfiles.description')}
            />
            <FeaturePreviewCard
              icon={<Activity size={20} />}
              title={t('dashboard.features.trainingSessions.title')}
              description={t('dashboard.features.trainingSessions.description')}
            />
            <FeaturePreviewCard
              icon={<Trophy size={20} />}
              title={t('dashboard.features.matches.title')}
              description={t('dashboard.features.matches.description')}
            />
            <FeaturePreviewCard
              icon={<BarChart2 size={20} />}
              title={t('dashboard.features.assessments.title')}
              description={t('dashboard.features.assessments.description')}
            />
          </div>
        </main>
      </div>
    )
  }

  // ── Authenticated view ─────────────────────────────────────────────
  const userName = user?.first_name || user?.email.split('@')[0] || ''
  const roleLabel = user?.role ? t(`dashboard.roleBadge.${user.role}`) : ''

  const pageDescription = isCoach
    ? t('dashboard.description.coach')
    : isPlayer
    ? t('dashboard.description.player')
    : isParent
    ? t('dashboard.description.parent')
    : t('dashboard.description.default')

  return (
    <div className="min-h-screen bg-cf-background">
      <AppNav />

      <main className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">

        {/* ── Page header ──────────────────────────────────────── */}
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold text-cf-foreground sm:text-3xl">
                {t('dashboard.title')}
              </h1>
              <span
                className={cn(
                  'rounded-full px-2.5 py-0.5 text-xs font-semibold',
                  'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400',
                )}
              >
                {roleLabel}
              </span>
            </div>
            <p className="mt-1 text-sm text-cf-muted-foreground">{pageDescription}</p>
          </div>
          <p className="shrink-0 text-sm text-cf-muted-foreground">
            {t('dashboard.welcome', { name: userName })}
          </p>
        </header>

        {/* ── Coach/Admin: KPI summary ─────────────────────────── */}
        {isCoach && (
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <KpiCard
              icon={<Users size={20} />}
              label={t('dashboard.kpi.totalPlayers')}
              value={playerCount !== null ? String(playerCount) : null}
              onClick={() => navigate('/players')}
            />
            <KpiCard
              icon={<Activity size={20} />}
              label={t('dashboard.kpi.trainingSessions')}
              value={sessionCount !== null ? String(sessionCount) : null}
              onClick={() => navigate('/coach/sessions')}
            />
            <KpiCard
              icon={<Trophy size={20} />}
              label={t('dashboard.kpi.matchesPlayed')}
              value={matchCount !== null ? String(matchCount) : null}
              onClick={() => navigate('/coach/matches')}
            />
          </section>
        )}

        {/* ── Coach/Admin: Recent activity ─────────────────────── */}
        {isCoach && (
          <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Recent sessions */}
            <SectionCard
              title={t('dashboard.recentSessions')}
              actionLabel={t('dashboard.viewAll')}
              onAction={() => navigate('/coach/sessions')}
            >
              {recentSessions === null ? (
                <p className="px-5 py-4 text-sm text-cf-muted-foreground">
                  {t('common.loading')}
                </p>
              ) : recentSessions.length === 0 ? (
                <p className="px-5 py-4 text-sm text-cf-muted-foreground">
                  {t('dashboard.empty.noSessions')}
                </p>
              ) : (
                recentSessions.map((s) => {
                  const parts = [formatShortDate(s.training_date)]
                  if (s.team_name) parts.push(s.team_name)
                  if (s.location) parts.push(s.location)
                  return (
                    <ActivityRow
                      key={s.id}
                      iconBg="bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
                      icon={<Activity size={14} />}
                      title={s.title}
                      subtitle={parts.join(' · ')}
                    />
                  )
                })
              )}
            </SectionCard>

            {/* Recent matches */}
            <SectionCard
              title={t('dashboard.recentMatches')}
              actionLabel={t('dashboard.viewAll')}
              onAction={() => navigate('/coach/matches')}
            >
              {recentMatches === null ? (
                <p className="px-5 py-4 text-sm text-cf-muted-foreground">
                  {t('common.loading')}
                </p>
              ) : recentMatches.length === 0 ? (
                <p className="px-5 py-4 text-sm text-cf-muted-foreground">
                  {t('dashboard.empty.noMatches')}
                </p>
              ) : (
                recentMatches.map((m) => {
                  const parts = [formatShortDate(m.match_date)]
                  if (m.team_name) parts.push(m.team_name)
                  return (
                    <ActivityRow
                      key={m.id}
                      iconBg="bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400"
                      icon={<Trophy size={14} />}
                      title={t('matches.vsOpponent', { opponent: m.opponent_name })}
                      subtitle={parts.join(' · ')}
                      trailing={
                        m.result ? (
                          <span
                            className={cn(
                              'shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold',
                              RESULT_BADGE_CLASS[m.result],
                            )}
                          >
                            {m.score_display ??
                              t(`matches.${m.result.toLowerCase()}Badge`)}
                          </span>
                        ) : undefined
                      }
                    />
                  )
                })
              )}
            </SectionCard>
          </section>
        )}

        {/* ── Player: direct profile and report links ───────────── */}
        {isPlayer && user?.player_profile != null && (
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <button
              onClick={() => navigate(`/players/${user?.player_profile?.player_id}`)}
              className={cn(
                'group flex items-center gap-4 rounded-2xl p-5 text-left ring-1 transition',
                'bg-cf-surface ring-cf-border hover:ring-emerald-400 hover:shadow-md',
              )}
            >
              <div
                className={cn(
                  'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl',
                  'bg-emerald-500 text-white text-sm font-bold',
                )}
              >
                {(user?.first_name?.[0] ?? '') + (user?.last_name?.[0] ?? '')}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-cf-surface-foreground group-hover:text-emerald-600 transition-colors">
                  {t('dashboard.myProfile')}
                </p>
                <p className="text-xs font-mono text-cf-muted-foreground">
                  {user?.player_profile?.football_id}
                </p>
                <p className="mt-0.5 text-sm text-cf-muted-foreground">
                  {t('dashboard.myProfileDesc')}
                </p>
              </div>
              <ChevronRight
                size={18}
                className="shrink-0 text-cf-muted-foreground group-hover:text-emerald-500 transition-colors"
              />
            </button>

            <button
              onClick={() =>
                navigate(`/players/${user?.player_profile?.player_id}/report`)
              }
              className={cn(
                'group flex items-center gap-4 rounded-2xl p-5 text-left ring-1 transition',
                'bg-cf-surface ring-cf-border hover:ring-emerald-400 hover:shadow-md',
              )}
            >
              <div
                className={cn(
                  'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl',
                  'bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400',
                )}
              >
                <BarChart2 size={22} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-cf-surface-foreground group-hover:text-emerald-600 transition-colors">
                  {t('dashboard.myReport')}
                </p>
                <p className="mt-0.5 text-sm text-cf-muted-foreground">
                  {t('dashboard.myReportDesc')}
                </p>
              </div>
              <ChevronRight
                size={18}
                className="shrink-0 text-cf-muted-foreground group-hover:text-emerald-500 transition-colors"
              />
            </button>
          </section>
        )}

        {/* ── Quick access cards ────────────────────────────────── */}
        <section>
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-cf-muted-foreground">
            {t('dashboard.quickAccess')}
          </h2>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* Players — visible to all authenticated roles */}
            <QuickLinkCard
              icon={<Users size={20} />}
              title={t('dashboard.quickLinks.players.title')}
              description={t('dashboard.quickLinks.players.description')}
              openLabel={t('dashboard.card.open')}
              onClick={() => navigate('/players')}
            />

            {/* Coach / Admin tools */}
            {isCoach && (
              <>
                <QuickLinkCard
                  icon={<Layers size={20} />}
                  title={t('dashboard.quickLinks.academies.title')}
                  description={t('dashboard.quickLinks.academies.description')}
                  openLabel={t('dashboard.card.open')}
                  onClick={() => navigate('/coach/academies')}
                />
                <QuickLinkCard
                  icon={<Shield size={20} />}
                  title={t('dashboard.quickLinks.teams.title')}
                  description={t('dashboard.quickLinks.teams.description')}
                  openLabel={t('dashboard.card.open')}
                  onClick={() => navigate('/coach/teams')}
                />
                <QuickLinkCard
                  icon={<Activity size={20} />}
                  title={t('dashboard.quickLinks.training.title')}
                  description={t('dashboard.quickLinks.training.description')}
                  openLabel={t('dashboard.card.open')}
                  onClick={() => navigate('/coach/sessions')}
                />
                <QuickLinkCard
                  icon={<Trophy size={20} />}
                  title={t('dashboard.quickLinks.matches.title')}
                  description={t('dashboard.quickLinks.matches.description')}
                  openLabel={t('dashboard.card.open')}
                  onClick={() => navigate('/coach/matches')}
                />
              </>
            )}

            {/* Parent: my children */}
            {isParent && (
              <QuickLinkCard
                icon={<User size={20} />}
                title={t('dashboard.quickLinks.myChildren.title')}
                description={t('dashboard.quickLinks.myChildren.description')}
                openLabel={t('dashboard.card.open')}
                onClick={() => navigate('/players')}
              />
            )}
          </div>
        </section>

      </main>
    </div>
  )
}
