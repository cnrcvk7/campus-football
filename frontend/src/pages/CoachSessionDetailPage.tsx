import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  CalendarDays,
  Clock,
  Edit2,
  MapPin,
  Plus,
  Users,
} from 'lucide-react'
import AppNav from '../components/ui/AppNav'
import EmptyState from '../components/ui/EmptyState'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import { trainingService } from '../services/trainingService'
import type { TrainingAttendance, TrainingSession } from '../types'
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

function isSessionPast(dateStr: string): boolean {
  return new Date(dateStr) < new Date()
}

const SKILL_CATEGORY_COLOR: Record<string, string> = {
  TECHNICAL: 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-950 dark:text-sky-400 dark:ring-sky-800',
  TACTICAL:  'bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-950 dark:text-violet-400 dark:ring-violet-800',
  PHYSICAL:  'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-400 dark:ring-emerald-800',
  MENTAL:    'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950 dark:text-amber-400 dark:ring-amber-800',
}

const EXERCISE_CATEGORY_COLOR: Record<string, string> = {
  TECHNICAL: 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-950 dark:text-sky-400 dark:ring-sky-800',
  TACTICAL:  'bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-950 dark:text-violet-400 dark:ring-violet-800',
  PHYSICAL:  'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-400 dark:ring-emerald-800',
  MENTAL:    'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950 dark:text-amber-400 dark:ring-amber-800',
  WARM_UP:   'bg-yellow-50 text-yellow-700 ring-yellow-200 dark:bg-yellow-950 dark:text-yellow-400 dark:ring-yellow-800',
  COOL_DOWN: 'bg-slate-50 text-slate-600 ring-slate-200 dark:bg-slate-900 dark:text-slate-400 dark:ring-slate-700',
}

const ATTENDANCE_BADGE: Record<string, string> = {
  PRESENT: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-400 dark:ring-emerald-800',
  LATE:    'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950 dark:text-amber-400 dark:ring-amber-800',
  EXCUSED: 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-950 dark:text-sky-400 dark:ring-sky-800',
  ABSENT:  'bg-red-50 text-red-700 ring-red-200 dark:bg-red-950 dark:text-red-400 dark:ring-red-800',
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CoachSessionDetailPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const displayLocale = toDisplayLocale(i18n.language)

  const [session, setSession] = useState<TrainingSession | null>(null)
  const [attendance, setAttendance] = useState<TrainingAttendance[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!sessionId) return
    Promise.all([
      trainingService.getSession(sessionId),
      trainingService.listAttendance(sessionId),
    ])
      .then(([s, a]) => {
        setSession(s)
        setAttendance(a)
        setLoading(false)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : t('training.error.sessionLoadFailed'))
        setLoading(false)
      })
  }, [sessionId, t])

  if (loading) {
    return (
      <div className="min-h-screen bg-cf-background">
        <AppNav label={t('training.sessionNavLabel')} />
        <LoadingSpinner />
      </div>
    )
  }

  if (error || !session) {
    return (
      <div className="min-h-screen bg-cf-background">
        <AppNav label={t('training.sessionNavLabel')} />
        <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
          <EmptyState
            icon={<AlertTriangle size={24} />}
            title={t('training.error.sessionLoadFailed')}
            description={error ?? t('training.error.notFound')}
          />
        </main>
      </div>
    )
  }

  const isPast = isSessionPast(session.training_date)

  const attendanceCounts = attendance.reduce(
    (acc, a) => ({ ...acc, [a.status]: (acc[a.status] ?? 0) + 1 }),
    {} as Record<string, number>,
  )

  const sortedExercises = session.session_exercises.slice().sort((a, b) => a.order - b.order)

  return (
    <div className="min-h-screen bg-cf-background">
      <AppNav label={t('training.sessionNavLabel')} />

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        {/* Back link + actions */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={() => navigate('/coach/sessions')}
            className="inline-flex items-center gap-1.5 text-sm text-cf-muted-foreground hover:text-cf-surface-foreground transition-colors"
          >
            <ArrowLeft size={15} />
            {t('training.backToSessions')}
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate(`/coach/sessions/${session.id}/add-attendance`)}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium bg-cf-surface ring-1 ring-cf-border text-cf-surface-foreground hover:bg-cf-muted transition-colors"
            >
              <Plus size={15} />
              {t('training.addAttendance')}
            </button>
            <button
              onClick={() => navigate(`/coach/sessions/${session.id}/edit`)}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium bg-cf-surface ring-1 ring-cf-border text-cf-surface-foreground hover:bg-cf-muted transition-colors"
            >
              <Edit2 size={15} />
              {t('training.editSession')}
            </button>
          </div>
        </div>

        {/* Page header */}
        <div className="mb-6">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-cf-surface-foreground">{session.title}</h1>
            <span
              className={cn(
                'rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset',
                isPast
                  ? 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700'
                  : 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-400 dark:ring-emerald-800',
              )}
            >
              {isPast ? t('training.statusCompleted') : t('training.statusUpcoming')}
            </span>
          </div>
          <p className="mt-1 text-sm text-cf-muted-foreground flex items-center gap-1.5">
            <CalendarDays size={14} />
            {formatLongDate(session.training_date, displayLocale)}
          </p>
        </div>

        {/* Info grid */}
        <div className={cn('rounded-2xl p-6 ring-1 bg-cf-surface ring-cf-border', 'mb-6')}>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {session.academy_name && (
              <div className="flex items-start gap-3">
                <Building2 size={16} className="mt-0.5 shrink-0 text-cf-muted-foreground" />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-cf-muted-foreground">
                    {t('training.detailAcademy')}
                  </p>
                  <p className="mt-0.5 text-sm font-medium text-cf-surface-foreground">{session.academy_name}</p>
                </div>
              </div>
            )}
            {session.team_name && (
              <div className="flex items-start gap-3">
                <Users size={16} className="mt-0.5 shrink-0 text-cf-muted-foreground" />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-cf-muted-foreground">
                    {t('training.detailTeam')}
                  </p>
                  <p className="mt-0.5 text-sm font-medium text-cf-surface-foreground">{session.team_name}</p>
                </div>
              </div>
            )}
            <div className="flex items-start gap-3">
              <Users size={16} className="mt-0.5 shrink-0 text-cf-muted-foreground" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-cf-muted-foreground">
                  {t('training.detailCoach')}
                </p>
                <p className="mt-0.5 text-sm font-medium text-cf-surface-foreground">{session.coach_name}</p>
              </div>
            </div>
            {session.location && (
              <div className="flex items-start gap-3">
                <MapPin size={16} className="mt-0.5 shrink-0 text-cf-muted-foreground" />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-cf-muted-foreground">
                    {t('training.detailLocation')}
                  </p>
                  <p className="mt-0.5 text-sm font-medium text-cf-surface-foreground">{session.location}</p>
                </div>
              </div>
            )}
            {session.start_time && (
              <div className="flex items-start gap-3">
                <Clock size={16} className="mt-0.5 shrink-0 text-cf-muted-foreground" />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-cf-muted-foreground">
                    {t('training.detailStartTime')}
                  </p>
                  <p className="mt-0.5 text-sm font-medium text-cf-surface-foreground">{session.start_time}</p>
                </div>
              </div>
            )}
            {session.duration_minutes && (
              <div className="flex items-start gap-3">
                <Clock size={16} className="mt-0.5 shrink-0 text-cf-muted-foreground" />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-cf-muted-foreground">
                    {t('training.detailDuration')}
                  </p>
                  <p className="mt-0.5 text-sm font-medium text-cf-surface-foreground">
                    {t('training.durationMin', { n: session.duration_minutes })}
                  </p>
                </div>
              </div>
            )}
          </div>

          {session.description && (
            <p className="mt-5 text-sm text-cf-muted-foreground border-t border-cf-border pt-4">
              {session.description}
            </p>
          )}
        </div>

        {/* Focus skills */}
        {session.focus_skills.length > 0 && (
          <section className="mb-6">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-cf-muted-foreground">
              {t('training.detailFocusSkills')}
            </h2>
            <div className="flex flex-wrap gap-2">
              {session.focus_skills.map((s) => (
                <span
                  key={s.id}
                  className={cn(
                    'rounded-full px-3 py-1 text-sm font-medium ring-1 ring-inset',
                    SKILL_CATEGORY_COLOR[s.category] ?? 'bg-cf-muted text-cf-muted-foreground ring-cf-border',
                  )}
                >
                  {s.name}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Exercises */}
        <section className="mb-6">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-cf-muted-foreground">
            {t('training.exercises', { count: session.session_exercises.length })}
          </h2>
          {sortedExercises.length === 0 ? (
            <p className="text-sm text-cf-muted-foreground">{t('training.noExercises')}</p>
          ) : (
            <div className="overflow-hidden rounded-2xl ring-1 ring-cf-border">
              <table className="min-w-full divide-y divide-cf-border">
                <thead>
                  <tr className="bg-cf-muted">
                    <th className="py-3 pl-4 pr-3 text-left text-xs font-semibold uppercase tracking-wider text-cf-muted-foreground w-10">
                      {t('training.exerciseOrder')}
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-cf-muted-foreground">
                      {t('training.titleField')}
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-cf-muted-foreground">
                      {t('training.exerciseCategory')}
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-cf-muted-foreground">
                      {t('training.exerciseDuration')}
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-cf-muted-foreground">
                      {t('training.exerciseNotes')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cf-border bg-cf-surface">
                  {sortedExercises.map((ex, idx) => (
                    <tr key={ex.id} className="hover:bg-cf-muted/50">
                      <td className="py-3 pl-4 pr-3 text-sm text-cf-muted-foreground font-mono">
                        {idx + 1}
                      </td>
                      <td className="px-3 py-3 text-sm font-medium text-cf-surface-foreground">
                        {ex.exercise_name}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
                            EXERCISE_CATEGORY_COLOR[ex.exercise_category] ?? 'bg-cf-muted text-cf-muted-foreground ring-cf-border',
                          )}
                        >
                          {ex.exercise_category}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-sm text-cf-muted-foreground">
                        {ex.duration_minutes ? t('training.durationMin', { n: ex.duration_minutes }) : '—'}
                      </td>
                      <td className="px-3 py-3 text-sm text-cf-muted-foreground">
                        {ex.notes || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Attendance */}
        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-cf-muted-foreground">
              {t('training.attendanceSection', { count: attendance.length })}
            </h2>

            {/* Summary chips */}
            {attendance.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-cf-muted-foreground mr-1">
                  {t('training.attendanceSummary')}:
                </span>
                {(['PRESENT', 'LATE', 'EXCUSED', 'ABSENT'] as const).map((s) =>
                  attendanceCounts[s] ? (
                    <span
                      key={s}
                      className={cn(
                        'rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
                        ATTENDANCE_BADGE[s],
                      )}
                    >
                      {attendanceCounts[s]} {s.toLowerCase()}
                    </span>
                  ) : null,
                )}
              </div>
            )}
          </div>

          {attendance.length === 0 ? (
            <p className="text-sm text-cf-muted-foreground">{t('training.noAttendance')}</p>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block overflow-hidden rounded-2xl ring-1 ring-cf-border">
                <table className="min-w-full divide-y divide-cf-border">
                  <thead>
                    <tr className="bg-cf-muted">
                      <th className="py-3 pl-4 pr-3 text-left text-xs font-semibold uppercase tracking-wider text-cf-muted-foreground">
                        {t('playerProfile.tablePlayer')}
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-cf-muted-foreground">
                        {t('playerProfile.tableId')}
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-cf-muted-foreground">
                        {t('playerProfile.tableStatus')}
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-cf-muted-foreground">
                        {t('playerProfile.tableNotes')}
                      </th>
                      <th className="pl-3 pr-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-cf-border bg-cf-surface">
                    {attendance.map((a) => (
                      <tr key={a.id} className="hover:bg-cf-muted/50">
                        <td className="py-3 pl-4 pr-3 text-sm font-medium text-cf-surface-foreground">
                          {a.player_name}
                        </td>
                        <td className="px-3 py-3 font-mono text-xs text-emerald-600 dark:text-emerald-400">
                          {a.football_id}
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={cn(
                              'rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
                              ATTENDANCE_BADGE[a.status] ?? 'bg-cf-muted text-cf-muted-foreground ring-cf-border',
                            )}
                          >
                            {a.status}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-xs text-cf-muted-foreground">{a.notes || '—'}</td>
                        <td className="pl-3 pr-4 py-3 text-right whitespace-nowrap">
                          <button
                            onClick={() => navigate(`/coach/sessions/${session.id}/edit-attendance/${a.id}`)}
                            className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 transition-colors"
                          >
                            <Edit2 size={12} />
                            {t('playerProfile.editGoal')}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden space-y-2">
                {attendance.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between rounded-xl p-3 ring-1 bg-cf-surface ring-cf-border"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-cf-surface-foreground">{a.player_name}</p>
                      {a.notes && <p className="text-xs text-cf-muted-foreground mt-0.5">{a.notes}</p>}
                    </div>
                    <div className="flex items-center gap-2 ml-3 shrink-0">
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
                          ATTENDANCE_BADGE[a.status] ?? 'bg-cf-muted text-cf-muted-foreground ring-cf-border',
                        )}
                      >
                        {a.status}
                      </span>
                      <button
                        onClick={() => navigate(`/coach/sessions/${session.id}/edit-attendance/${a.id}`)}
                        className="text-cf-muted-foreground hover:text-cf-surface-foreground transition-colors"
                      >
                        <Edit2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  )
}
