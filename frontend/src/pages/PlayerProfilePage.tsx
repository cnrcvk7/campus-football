import { type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  BarChart2,
  Target,
  Trophy,
  Activity,
  Shield,
  Ruler,
  AlertTriangle,
  CheckCircle2,
  Clock,
  MinusCircle,
  XCircle,
  TrendingUp,
  TrendingDown,
  Minus,
  Pencil,
} from 'lucide-react'
import { usePlayerProfile } from '../hooks/usePlayerProfile'
import { toDisplayLocale } from '../utils/localeDateFormatter'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import EmptyState from '../components/ui/EmptyState'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import { cn } from '../lib/utils'
import SkillCategoryChart from '../components/analytics/SkillCategoryChart'
import CategoryBarChart from '../components/analytics/CategoryBarChart'
import type {
  Assessment,
  AssessmentItem,
  AcademyMembership,
  AttendanceStatus,
  DevelopmentGoal,
  MatchSummary,
  PhysicalMeasurement,
  Player,
  PlayerHistory,
  PlayerMatchStats,
  SkillCategory,
  TeamMembership,
  TrainingSessionSummary,
} from '../types'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORY_META: Record<
  SkillCategory,
  { color: string; bar: string; border: string }
> = {
  TECHNICAL: {
    color: 'text-sky-600 dark:text-sky-400',
    bar:   'bg-sky-500',
    border:'border-l-sky-500',
  },
  TACTICAL: {
    color: 'text-violet-600 dark:text-violet-400',
    bar:   'bg-violet-500',
    border:'border-l-violet-500',
  },
  PHYSICAL: {
    color: 'text-emerald-600 dark:text-emerald-400',
    bar:   'bg-emerald-500',
    border:'border-l-emerald-500',
  },
  MENTAL: {
    color: 'text-amber-600 dark:text-amber-400',
    bar:   'bg-amber-500',
    border:'border-l-amber-500',
  },
}

const ATTENDANCE_COLOR: Record<AttendanceStatus, string> = {
  PRESENT: 'text-emerald-500 dark:text-emerald-400',
  LATE:    'text-amber-500 dark:text-amber-400',
  EXCUSED: 'text-sky-500 dark:text-sky-400',
  ABSENT:  'text-red-500 dark:text-red-400',
}

function AttendanceIcon({ status }: { status: AttendanceStatus }) {
  const cls = cn('mt-0.5 h-4 w-4 shrink-0', ATTENDANCE_COLOR[status])
  switch (status) {
    case 'PRESENT': return <CheckCircle2 size={14} className={cls} />
    case 'LATE':    return <Clock        size={14} className={cls} />
    case 'EXCUSED': return <MinusCircle  size={14} className={cls} />
    case 'ABSENT':  return <XCircle      size={14} className={cls} />
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function calcAge(dob: string): number {
  const diff = Date.now() - new Date(dob).getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25))
}

function fmtDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtShortDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short' })
}

function initials(firstName: string, lastName: string): string {
  return `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase()
}

function computeCategoryScores(
  assessments: Assessment[],
): Partial<Record<SkillCategory, { score: number; count: number }>> {
  if (assessments.length === 0) return {}
  const latest = assessments[assessments.length - 1]
  const acc: Partial<Record<SkillCategory, { sum: number; count: number }>> = {}
  for (const item of latest.items) {
    const cat = item.skill_category
    if (!acc[cat]) acc[cat] = { sum: 0, count: 0 }
    acc[cat]!.sum += item.score
    acc[cat]!.count += 1
  }
  const result: Partial<Record<SkillCategory, { score: number; count: number }>> = {}
  for (const [cat, val] of Object.entries(acc) as [SkillCategory, { sum: number; count: number }][]) {
    result[cat] = { score: Math.round(val.sum / val.count), count: val.count }
  }
  return result
}

function getActiveAcademy(history: PlayerHistory): AcademyMembership | null {
  return history.academy_history.find((m) => m.status === 'active') ?? null
}

function getActiveTeam(history: PlayerHistory): TeamMembership | null {
  return history.team_history.find((m) => m.status === 'active') ?? null
}

function goalProgress(goal: DevelopmentGoal): number | null {
  const current = goal.current_value !== null ? parseFloat(goal.current_value) : null
  const target  = goal.target_value  !== null ? parseFloat(goal.target_value)  : null
  if (current === null || target === null || target === 0) return null
  return Math.min(100, Math.round((current / target) * 100))
}

// ---------------------------------------------------------------------------
// Layout primitives
// ---------------------------------------------------------------------------

function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-xl p-5 ring-1 bg-cf-surface ring-cf-border', className)}>
      {children}
    </div>
  )
}

function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-cf-muted-foreground">
      {children}
    </h2>
  )
}

// ---------------------------------------------------------------------------
// Player Header — compact identity banner
// ---------------------------------------------------------------------------

function PlayerHeader({
  player,
  history,
}: {
  player: Player
  history: PlayerHistory | null
}) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const activeAcademy = history ? getActiveAcademy(history) : null
  const activeTeam    = history ? getActiveTeam(history)    : null
  const age      = calcAge(player.date_of_birth)
  const position = player.preferred_position ? t('positions.' + player.preferred_position) : null

  return (
    <div className="border-b border-cf-border bg-cf-surface">
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          {/* Left: avatar + identity */}
          <div className="flex items-center gap-4">
            {/* Avatar */}
            {player.profile_photo_url ? (
              <img
                src={player.profile_photo_url}
                alt={`${player.first_name} ${player.last_name}`}
                className="h-12 w-12 flex-shrink-0 rounded-lg object-cover ring-1 ring-cf-border"
              />
            ) : (
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-emerald-500 text-sm font-bold text-white ring-1 ring-emerald-400/30">
                {initials(player.first_name, player.last_name)}
              </div>
            )}

            {/* Name + meta */}
            <div className="min-w-0">
              <h1 className="text-lg font-semibold leading-tight text-cf-surface-foreground">
                {player.first_name} {player.last_name}
              </h1>
              <p className="mt-0.5 font-mono text-xs text-emerald-600 dark:text-emerald-400">
                {player.football_id}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {position && <Badge>{position}</Badge>}
                {player.jersey_number !== null && (
                  <Badge variant="emerald">#{player.jersey_number}</Badge>
                )}
                <span className="text-xs text-cf-muted-foreground">
                  {t('players.yearsOld', { count: age })}
                </span>
                {activeTeam && (
                  <span className="text-xs text-cf-muted-foreground">
                    · {activeTeam.team.name}
                    {activeTeam.team.age_group ? ` (${activeTeam.team.age_group})` : ''}
                  </span>
                )}
                {activeAcademy && (
                  <span className="text-xs text-cf-muted-foreground">
                    · {activeAcademy.academy.name}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Right: actions */}
          <div className="flex flex-shrink-0 flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => navigate(`/players/${player.id}/edit`)}
            >
              <Pencil size={12} />
              {t('playerProfile.editProfile')}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => navigate(`/players/${player.id}/report`)}
            >
              <BarChart2 size={12} />
              {t('playerProfile.developmentReport')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Development Overview
// ---------------------------------------------------------------------------

function DevelopmentOverview({ assessments, playerId }: { assessments: Assessment[]; playerId: string }) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const scores     = computeCategoryScores(assessments)
  const categories: SkillCategory[] = ['TECHNICAL', 'TACTICAL', 'PHYSICAL', 'MENTAL']
  const hasData    = Object.keys(scores).length > 0

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <SectionHeading>{t('playerProfile.sectionDevelopment')}</SectionHeading>
        <Button
          variant="primary"
          size="sm"
          onClick={() => navigate(`/players/${playerId}/assessments/new`)}
        >
          {t('playerProfile.newAssessment')}
        </Button>
      </div>
      {!hasData ? (
        <EmptyState
          icon={<BarChart2 size={28} />}
          title={t('playerProfile.empty.noAssessments')}
          description={t('playerProfile.empty.noAssessmentsHint')}
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {categories.map((cat) => {
            const meta = CATEGORY_META[cat]
            const data = scores[cat]
            if (!data) return null
            return (
              <div
                key={cat}
                className={cn(
                  'rounded-xl p-4 ring-1 bg-cf-surface ring-cf-border',
                  'border-l-4',
                  meta.border,
                )}
              >
                <p className={cn('text-xs font-semibold uppercase tracking-wider', meta.color)}>
                  {t('skillCategories.' + cat)}
                </p>
                <p className="mt-1 text-3xl font-bold text-cf-surface-foreground">{data.score}</p>
                <p className="text-xs text-cf-muted-foreground">{t('playerProfile.scoreOf100')}</p>
                <div className="mt-2 h-1.5 rounded-full bg-cf-muted">
                  <div
                    className={cn('h-1.5 rounded-full transition-all', meta.bar)}
                    style={{ width: `${data.score}%` }}
                  />
                </div>
                <p className="mt-1.5 text-xs text-cf-muted-foreground">
                  {t('playerProfile.basedOn', { count: data.count })}
                </p>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Analytics Section
// ---------------------------------------------------------------------------

function AnalyticsSection({ assessments }: { assessments: Assessment[] }) {
  const { t } = useTranslation()
  if (assessments.length === 0) return null

  return (
    <section>
      <SectionHeading>{t('analytics.title')}</SectionHeading>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Category snapshot */}
        <Card>
          <h3 className="mb-4 text-sm font-semibold text-cf-surface-foreground">
            {t('analytics.categorySnapshot')}
          </h3>
          <CategoryBarChart assessments={assessments} />
        </Card>

        {/* Skill progression over time */}
        <Card>
          <h3 className="mb-4 text-sm font-semibold text-cf-surface-foreground">
            {t('analytics.skillProgression')}
          </h3>
          <SkillCategoryChart assessments={assessments} />
        </Card>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Latest Assessment Detail
// ---------------------------------------------------------------------------

function LatestAssessmentItems({ assessments }: { assessments: Assessment[] }) {
  const { t, i18n } = useTranslation()
  const displayLocale = toDisplayLocale(i18n.language)
  if (assessments.length === 0) return null
  const latest = assessments[assessments.length - 1]
  if (latest.items.length === 0) return null

  // Build previous assessment skill score lookup for trend indicators
  const prevSkillScores = new Map<string, number>()
  if (assessments.length >= 2) {
    const prev = assessments[assessments.length - 2]
    for (const item of prev.items) {
      prevSkillScores.set(item.skill_name, item.score)
    }
  }

  const sorted = [...latest.items].sort((a, b) => b.score - a.score)

  return (
    <section>
      <SectionHeading>
        {t('playerProfile.latestAssessment')} {fmtDate(latest.assessment_date, displayLocale)}
      </SectionHeading>
      <Card>
        {latest.overall_comment && (
          <p className="mb-4 border-l-2 border-emerald-400 pl-3 text-sm text-cf-muted-foreground italic">
            "{latest.overall_comment}"
          </p>
        )}
        <div className="space-y-3">
          {sorted.map((item: AssessmentItem) => {
            const meta = CATEGORY_META[item.skill_category]
            const prevScore = prevSkillScores.get(item.skill_name)
            const delta = prevScore !== undefined ? item.score - prevScore : null

            return (
              <div key={item.id} className="flex items-center gap-3">
                <span className={cn('w-20 shrink-0 text-xs font-medium', meta.color)}>
                  {item.skill_name}
                </span>
                <div className="h-2 flex-1 rounded-full bg-cf-muted">
                  <div
                    className={cn('h-2 rounded-full', meta.bar)}
                    style={{ width: `${item.score}%` }}
                  />
                </div>
                <span className="w-8 shrink-0 text-right text-sm font-semibold text-cf-surface-foreground">
                  {item.score}
                </span>
                {delta !== null && (
                  <span className="flex w-5 shrink-0 items-center justify-end">
                    {delta > 0 ? (
                      <TrendingUp
                        size={14}
                        className="text-emerald-500"
                        aria-label={t('analytics.trendImproved')}
                      />
                    ) : delta < 0 ? (
                      <TrendingDown
                        size={14}
                        className="text-red-500"
                        aria-label={t('analytics.trendDeclined')}
                      />
                    ) : (
                      <Minus
                        size={14}
                        className="text-cf-muted-foreground"
                        aria-label={t('analytics.trendStable')}
                      />
                    )}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </Card>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Season Summary
// ---------------------------------------------------------------------------

function SeasonSummary({ summary }: { summary: MatchSummary | null }) {
  const { t } = useTranslation()
  if (!summary) return null
  const noMatches = summary.matches_played === 0

  return (
    <section>
      <SectionHeading>{t('playerProfile.seasonSummary')}</SectionHeading>
      <Card>
        {noMatches ? (
          <EmptyState icon={<Trophy size={28} />} title={t('playerProfile.empty.noMatches')} />
        ) : (
          <div className="grid grid-cols-3 gap-4 sm:grid-cols-6">
            {[
              { label: t('playerProfile.matches'),   value: String(summary.matches_played) },
              { label: t('playerProfile.starts'),    value: String(summary.starts) },
              { label: t('playerProfile.minutes'),   value: String(summary.total_minutes) },
              { label: t('playerProfile.goals'),     value: String(summary.goals) },
              { label: t('playerProfile.assists'),   value: String(summary.assists) },
              {
                label: t('playerProfile.avgRating'),
                value: summary.average_rating
                  ? parseFloat(summary.average_rating).toFixed(1)
                  : '—',
              },
            ].map(({ label, value }) => (
              <div key={label} className="text-center">
                <p className="text-2xl font-bold text-cf-surface-foreground">{value}</p>
                <p className="mt-0.5 text-xs text-cf-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Training Summary
// ---------------------------------------------------------------------------

function TrainingSummary({ sessions }: { sessions: TrainingSessionSummary[] }) {
  const { t, i18n } = useTranslation()
  const displayLocale = toDisplayLocale(i18n.language)
  const recent = sessions.slice(0, 6)
  const presentCount = sessions.filter((s) => s.attendance_status === 'PRESENT').length
  const lateCount    = sessions.filter((s) => s.attendance_status === 'LATE').length
  const countedAttended = presentCount + lateCount
  const attendanceRate =
    sessions.length > 0 ? Math.round((countedAttended / sessions.length) * 100) : null

  return (
    <section>
      <SectionHeading>{t('playerProfile.sectionTraining')}</SectionHeading>
      <Card>
        {sessions.length === 0 ? (
          <EmptyState icon={<Activity size={28} />} title={t('playerProfile.empty.noTraining')} />
        ) : (
          <>
            <div className="mb-4 flex items-center gap-6">
              <div>
                <p className="text-2xl font-bold text-cf-surface-foreground">{sessions.length}</p>
                <p className="text-xs text-cf-muted-foreground">{t('playerProfile.sessions')}</p>
              </div>
              {attendanceRate !== null && (
                <div>
                  <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                    {attendanceRate}%
                  </p>
                  <p className="text-xs text-cf-muted-foreground">
                    {t('playerProfile.attendancePct')}
                  </p>
                </div>
              )}
            </div>

            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-cf-muted-foreground">
              {t('playerProfile.recentSessions')}
            </p>
            <ul className="space-y-2">
              {recent.map((session) => (
                <li key={session.id} className="flex items-start gap-3">
                  {session.attendance_status ? (
                    <AttendanceIcon status={session.attendance_status} />
                  ) : (
                    <span className="mt-0.5 h-4 w-4 shrink-0 text-xs leading-4 text-cf-muted-foreground">
                      —
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-cf-surface-foreground">
                      {session.title}
                    </p>
                    <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5">
                      <span className="text-xs text-cf-muted-foreground">
                        {fmtShortDate(session.training_date, displayLocale)}
                      </span>
                      {session.focus_skills.length > 0 && (
                        <span className="text-xs text-cf-muted-foreground">
                          · {session.focus_skills.map((s) => s.name).join(', ')}
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Development Goals
// ---------------------------------------------------------------------------

const GOAL_STATUS_VARIANT: Record<DevelopmentGoal['status'], 'emerald' | 'amber' | 'default'> = {
  COMPLETED: 'emerald',
  ACTIVE:    'amber',
  CANCELLED: 'default',
}

function GoalsSection({ goals, playerId }: { goals: DevelopmentGoal[]; playerId: string }) {
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const displayLocale = toDisplayLocale(i18n.language)

  // Analytics summary — computed from goals array only
  const totalGoals     = goals.length
  const completedGoals = goals.filter((g) => g.status === 'COMPLETED').length
  const completionRate = totalGoals > 0 ? Math.round((completedGoals / totalGoals) * 100) : null

  // Overdue: status === 'ACTIVE', has target_date, and that date (local midnight) < today's local midnight
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const overdueGoals = goals.filter((g) => {
    if (g.status !== 'ACTIVE' || !g.target_date) return false
    const [year, month, day] = g.target_date.split('-').map(Number)
    const targetLocalMidnight = new Date(year, month - 1, day)
    return targetLocalMidnight < todayStart
  }).length

  // Average progress: active goals with a measurable progress value
  const activeMeasurableGoals = goals.filter((g) => g.status === 'ACTIVE' && goalProgress(g) !== null)
  const avgProgress =
    activeMeasurableGoals.length > 0
      ? Math.round(
          activeMeasurableGoals.reduce((sum, g) => sum + (goalProgress(g) as number), 0) /
            activeMeasurableGoals.length,
        )
      : null

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <SectionHeading>{t('playerProfile.sectionGoals')}</SectionHeading>
        <Button
          variant="primary"
          size="sm"
          onClick={() => navigate(`/players/${playerId}/goals/new`)}
        >
          {t('playerProfile.newGoal')}
        </Button>
      </div>
      {goals.length === 0 ? (
        <EmptyState
          icon={<Target size={28} />}
          title={t('playerProfile.empty.noGoals')}
          description={t('playerProfile.empty.noGoalsHint')}
        />
      ) : (
        <>
          {/* Analytics summary strip */}
          <Card className="mb-3">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-cf-surface-foreground">{totalGoals}</p>
                <p className="mt-0.5 text-xs text-cf-muted-foreground">{t('playerProfile.goalsTotal')}</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                  {completedGoals}
                  {completionRate !== null && (
                    <span className="ml-1 text-sm font-normal text-cf-muted-foreground">
                      ({completionRate}%)
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-cf-muted-foreground">{t('playerProfile.goalsCompleted')}</p>
              </div>
              <div className="text-center">
                <p className={cn(
                  'text-2xl font-bold',
                  overdueGoals > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-cf-surface-foreground',
                )}>
                  {overdueGoals}
                </p>
                <p className="mt-0.5 text-xs text-cf-muted-foreground">{t('playerProfile.goalsOverdue')}</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                  {avgProgress !== null ? `${avgProgress}%` : '—'}
                </p>
                <p className="mt-0.5 text-xs text-cf-muted-foreground">{t('playerProfile.goalsAvgProgress')}</p>
              </div>
            </div>
          </Card>

        <div className="grid gap-3 sm:grid-cols-2">
          {goals.map((goal) => {
            const progress = goalProgress(goal)
            return (
              <Card key={goal.id}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-cf-surface-foreground">{goal.title}</p>
                  </div>
                  <Badge variant={GOAL_STATUS_VARIANT[goal.status]}>
                    {goal.status.charAt(0) + goal.status.slice(1).toLowerCase()}
                  </Badge>
                </div>
                {goal.skill_name && (
                  <span className="mt-1.5 inline-block rounded-full bg-cf-muted px-2 py-0.5 text-xs text-cf-muted-foreground">
                    {goal.skill_name}
                  </span>
                )}
                {goal.description && (
                  <p className="mt-2 line-clamp-2 text-sm text-cf-muted-foreground">
                    {goal.description}
                  </p>
                )}
                {progress !== null && (
                  <div className="mt-3">
                    <div className="mb-1 flex justify-between text-xs text-cf-muted-foreground">
                      <span>
                        {goal.current_value} / {goal.target_value}
                      </span>
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                        {progress}%
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-cf-muted">
                      <div
                        className="h-1.5 rounded-full bg-emerald-500 transition-all"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                )}
                <div className="mt-3 flex items-center justify-between">
                  {goal.target_date ? (
                    <p className="text-xs text-cf-muted-foreground">
                      {t('playerProfile.target')} {fmtDate(goal.target_date, displayLocale)}
                    </p>
                  ) : (
                    <span />
                  )}
                  <button
                    onClick={() => navigate(`/players/${playerId}/goals/${goal.id}/edit`)}
                    className="text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline"
                  >
                    {t('playerProfile.editGoal')}
                  </button>
                </div>
              </Card>
            )
          })}
        </div>
        </>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Match History
// ---------------------------------------------------------------------------

const RESULT_VARIANT: Record<string, 'emerald' | 'amber' | 'red'> = {
  WIN:  'emerald',
  DRAW: 'amber',
  LOSS: 'red',
}

function MatchHistorySection({ matches }: { matches: PlayerMatchStats[] }) {
  const { t, i18n } = useTranslation()
  const displayLocale = toDisplayLocale(i18n.language)

  return (
    <section>
      <SectionHeading>{t('playerProfile.sectionMatchHistory')}</SectionHeading>
      {matches.length === 0 ? (
        <EmptyState
          icon={<Shield size={28} />}
          title={t('playerProfile.empty.noMatchesRecorded')}
        />
      ) : (
        <div className="overflow-hidden rounded-xl ring-1 bg-cf-surface ring-cf-border">
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-cf-border bg-cf-muted">
                  {[
                    t('playerProfile.tableDate'),
                    t('playerProfile.tableOpponent'),
                    t('playerProfile.tableResult'),
                    t('playerProfile.tableHomeAway'),
                    t('playerProfile.tableStart'),
                    t('playerProfile.tableMin'),
                    t('playerProfile.tableG'),
                    t('playerProfile.tableA'),
                    t('playerProfile.tableRating'),
                  ].map((h) => (
                    <th
                      key={h}
                      className="whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-cf-muted-foreground"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-cf-border">
                {matches.map((m) => (
                  <tr key={m.id} className="transition-colors hover:bg-cf-muted/50">
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-cf-muted-foreground">
                      {fmtShortDate(m.match_date, displayLocale)}
                    </td>
                    <td className="max-w-[10rem] truncate px-4 py-3 text-sm font-medium text-cf-surface-foreground">
                      {m.opponent}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {m.result ? (
                        <Badge variant={RESULT_VARIANT[m.result]}>
                          {m.score_display ?? m.result}
                        </Badge>
                      ) : (
                        <span className="text-xs text-cf-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-cf-muted-foreground">
                      {m.home_away}
                    </td>
                    <td className="px-4 py-3 text-center text-sm">
                      {m.started ? (
                        <CheckCircle2
                          size={14}
                          className="mx-auto text-emerald-500 dark:text-emerald-400"
                        />
                      ) : (
                        <span className="text-cf-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-cf-surface-foreground">
                      {m.minutes_played}'
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold text-cf-surface-foreground">
                      {m.goals}
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold text-cf-surface-foreground">
                      {m.assists}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      {m.rating ? (
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                          {parseFloat(m.rating).toFixed(1)}
                        </span>
                      ) : (
                        <span className="text-cf-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Development Timeline (assessment history)
// ---------------------------------------------------------------------------

function DevelopmentTimeline({ assessments }: { assessments: Assessment[] }) {
  const { t, i18n } = useTranslation()
  const displayLocale = toDisplayLocale(i18n.language)
  if (assessments.length === 0) return null

  return (
    <section>
      <SectionHeading>{t('playerProfile.sectionAssessmentHistory')}</SectionHeading>
      <Card>
        <ol className="space-y-4">
          {[...assessments].reverse().map((a, idx) => {
            const scores     = computeCategoryScores([a])
            const categories: SkillCategory[] = ['TECHNICAL', 'TACTICAL', 'PHYSICAL', 'MENTAL']
            return (
              <li key={a.id} className="flex items-start gap-3">
                {/* dot */}
                <div
                  className={cn(
                    'mt-1 h-2.5 w-2.5 shrink-0 rounded-full',
                    idx === 0 ? 'bg-emerald-500' : 'bg-cf-muted-foreground/30',
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-cf-surface-foreground">
                      {fmtDate(a.assessment_date, displayLocale)}
                    </p>
                    {idx === 0 && (
                      <Badge variant="emerald">{t('playerProfile.latestBadge')}</Badge>
                    )}
                    {a.coach_name && (
                      <span className="text-xs text-cf-muted-foreground">
                        {t('playerProfile.byCoach', { coach: a.coach_name })}
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
                    {categories.map((cat) => {
                      const data = scores[cat]
                      if (!data) return null
                      const meta = CATEGORY_META[cat]
                      return (
                        <div key={cat} className="flex items-center gap-1.5">
                          <span className={cn('text-xs font-medium', meta.color)}>
                            {t('skillCategories.' + cat)}
                          </span>
                          <span className="text-sm font-bold text-cf-surface-foreground">
                            {data.score}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      </Card>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Physical Measurements
// ---------------------------------------------------------------------------

function PhysicalMeasurementsSection({
  measurements,
  playerId,
}: {
  measurements: PhysicalMeasurement[]
  playerId: string
}) {
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const displayLocale = toDisplayLocale(i18n.language)

  const fields: { key: keyof PhysicalMeasurement; label: string; unit: string }[] = [
    { key: 'height_cm',          label: t('playerProfile.height'),   unit: 'cm' },
    { key: 'weight_kg',          label: t('playerProfile.weight'),   unit: 'kg' },
    { key: 'body_fat_percentage', label: t('playerProfile.bodyFat'), unit: '%'  },
    { key: 'sprint_time_seconds', label: t('playerProfile.sprint10m'), unit: 's' },
  ]

  const latest   = measurements.length > 0 ? measurements[measurements.length - 1] : null
  const previous = measurements.length > 1 ? measurements[measurements.length - 2] : null

  function delta(curr: string | null, prev: string | null): string | null {
    if (!curr || !prev) return null
    const d = parseFloat(curr) - parseFloat(prev)
    if (Math.abs(d) < 0.01) return null
    return d > 0 ? `+${d.toFixed(1)}` : d.toFixed(1)
  }

  const visibleFields = latest ? fields.filter((f) => latest[f.key] !== null) : []

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <SectionHeading>{t('playerProfile.sectionMeasurements')}</SectionHeading>
        <Button
          variant="primary"
          size="sm"
          onClick={() => navigate(`/players/${playerId}/measurements/new`)}
        >
          {t('playerProfile.newMeasurement')}
        </Button>
      </div>
      {!latest || visibleFields.length === 0 ? (
        <EmptyState
          icon={<Ruler size={28} />}
          title={t('playerProfile.empty.noMeasurements')}
          description={t('playerProfile.empty.noMeasurementsHint')}
        />
      ) : (
        <Card>
          <p className="mb-3 text-xs text-cf-muted-foreground">
            {t('playerProfile.latestPrefix')} {fmtDate(latest.measurement_date, displayLocale)}
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {visibleFields.map(({ key, label, unit }) => {
              const currVal = latest[key] as string | null
              const prevVal = previous ? (previous[key] as string | null) : null
              const d = delta(currVal, prevVal)
              return (
                <div key={key} className="rounded-xl bg-cf-muted p-3 text-center">
                  <p className="text-xs font-medium uppercase tracking-wide text-cf-muted-foreground">
                    {label}
                  </p>
                  <p className="mt-1 text-xl font-bold text-cf-surface-foreground">
                    {currVal ? parseFloat(currVal).toFixed(1) : '—'}
                  </p>
                  <p className="text-xs text-cf-muted-foreground">{unit}</p>
                  {d && (
                    <p
                      className={cn(
                        'mt-1 text-xs font-semibold',
                        d.startsWith('+') ? 'text-emerald-500' : 'text-red-500',
                      )}
                    >
                      {d}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
          {latest.notes && (
            <p className="mt-3 text-xs italic text-cf-muted-foreground">{latest.notes}</p>
          )}
        </Card>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Academy / Team Membership Timeline
// ---------------------------------------------------------------------------

function MembershipTimeline({
  academyHistory,
  teamHistory,
}: {
  academyHistory: AcademyMembership[]
  teamHistory: TeamMembership[]
}) {
  const { t, i18n } = useTranslation()
  const displayLocale = toDisplayLocale(i18n.language)

  return (
    <section>
      <SectionHeading>{t('playerProfile.sectionHistory')}</SectionHeading>
      <div className="grid gap-3 sm:grid-cols-2">
        {/* Academy history */}
        <Card>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-cf-muted-foreground">
            {t('playerProfile.academyHistory')}
          </p>
          {academyHistory.length === 0 ? (
            <p className="text-sm text-cf-muted-foreground">{t('playerProfile.noAcademyHistory')}</p>
          ) : (
            <ol className="space-y-3">
              {academyHistory.map((m: AcademyMembership) => (
                <li key={m.id} className="flex items-start gap-3">
                  <div className="mt-1 flex-shrink-0">
                    <div
                      className={cn(
                        'h-2.5 w-2.5 rounded-full',
                        m.status === 'active' ? 'bg-emerald-500' : 'bg-cf-muted-foreground/30',
                      )}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-cf-surface-foreground">
                      {m.academy.name}
                    </p>
                    <p className="text-xs text-cf-muted-foreground">
                      {t('playerProfile.joined')} {fmtDate(m.joined_at, displayLocale)} →{' '}
                      {m.left_at
                        ? fmtDate(m.left_at, displayLocale)
                        : t('playerProfile.presentLabel')}
                    </p>
                    {m.academy.city && (
                      <p className="text-xs text-cf-muted-foreground">
                        {m.academy.city}, {m.academy.country}
                      </p>
                    )}
                  </div>
                  {m.status === 'active' && (
                    <Badge variant="emerald">{t('playerProfile.activeBadge')}</Badge>
                  )}
                </li>
              ))}
            </ol>
          )}
        </Card>

        {/* Team history */}
        <Card>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-cf-muted-foreground">
            {t('playerProfile.teamHistory')}
          </p>
          {teamHistory.length === 0 ? (
            <p className="text-sm text-cf-muted-foreground">{t('playerProfile.noTeamHistory')}</p>
          ) : (
            <ol className="space-y-3">
              {teamHistory.map((m: TeamMembership) => (
                <li key={m.id} className="flex items-start gap-3">
                  <div className="mt-1 flex-shrink-0">
                    <div
                      className={cn(
                        'h-2.5 w-2.5 rounded-full',
                        m.status === 'active' ? 'bg-emerald-500' : 'bg-cf-muted-foreground/30',
                      )}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-cf-surface-foreground">{m.team.name}</p>
                    {m.team.age_group && (
                      <p className="text-xs text-sky-600 dark:text-sky-400">
                        {m.team.age_group}
                        {m.team.season ? ` · ${m.team.season}` : ''}
                      </p>
                    )}
                    <p className="text-xs text-cf-muted-foreground">
                      {t('playerProfile.joined')} {fmtDate(m.joined_at, displayLocale)} →{' '}
                      {m.left_at
                        ? fmtDate(m.left_at, displayLocale)
                        : t('playerProfile.presentLabel')}
                    </p>
                  </div>
                  {m.status === 'active' && (
                    <Badge variant="emerald">{t('playerProfile.activeBadge')}</Badge>
                  )}
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Main page entry point
// ---------------------------------------------------------------------------

export default function PlayerProfilePage() {
  const { playerId } = useParams<{ playerId: string }>()
  const { t } = useTranslation()

  if (!playerId) {
    return <div className="p-8 text-center text-cf-muted-foreground">{t('players.error.noId')}</div>
  }

  return <PlayerProfileContent playerId={playerId} />
}

function PlayerProfileContent({ playerId }: { playerId: string }) {
  const { t } = useTranslation()
  const {
    loading,
    error,
    player,
    history,
    timeline,
    matchHistory,
    matchSummary,
    trainingHistory,
  } = usePlayerProfile(playerId)

  if (loading) {
    return <LoadingSpinner />
  }

  if (error || !player) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <EmptyState
          icon={<AlertTriangle size={28} />}
          title={t('players.error.loadPlayerFailed')}
          description={error ?? t('players.error.notFound')}
        />
      </div>
    )
  }

  const assessments = timeline?.assessments  ?? []
  const goals       = timeline?.goals        ?? []
  const measurements= timeline?.measurements ?? []
  const matches     = matchHistory?.matches  ?? []
  const sessions    = trainingHistory?.sessions ?? []

  return (
    <div className="bg-cf-background">
      <PlayerHeader player={player} history={history} />

      <div className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
        <DevelopmentOverview assessments={assessments} playerId={playerId} />

        <div className="grid gap-6 lg:grid-cols-2">
          <SeasonSummary summary={matchSummary} />
          <TrainingSummary sessions={sessions} />
        </div>

        <GoalsSection goals={goals} playerId={playerId} />
        <MatchHistorySection matches={matches} />
        {assessments.length > 0 && (
          <AnalyticsSection assessments={assessments} />
        )}
        <LatestAssessmentItems assessments={assessments} />
        <DevelopmentTimeline assessments={assessments} />
        <PhysicalMeasurementsSection measurements={measurements} playerId={playerId} />

        {history && (
          <MembershipTimeline
            academyHistory={history.academy_history}
            teamHistory={history.team_history}
          />
        )}
      </div>
    </div>
  )
}
