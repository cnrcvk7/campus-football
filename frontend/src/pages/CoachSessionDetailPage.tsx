import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  ClipboardList,
  Edit2,
  Plus,
  UserCheck,
} from 'lucide-react'
import Badge, { type BadgeVariant } from '../components/ui/Badge'
import Button from '../components/ui/Button'
import DataTable, { type Column } from '../components/ui/DataTable'
import DescriptionList from '../components/ui/DescriptionList'
import EmptyState from '../components/ui/EmptyState'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import Panel from '../components/ui/Panel'
import { ATTENDANCE_VARIANT, CATEGORY_VARIANT } from '../constants/badgeVariants'
import { trainingService } from '../services/trainingService'
import type { AttendanceStatus, TrainingAttendance, TrainingSession } from '../types'
import { parseDateOnly, relativeToToday, type DayRelation } from '../utils/dateOnly'
import { toDisplayLocale } from '../utils/localeDateFormatter'
import { cn } from '../lib/utils'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ATTENDANCE_ORDER: AttendanceStatus[] = ['PRESENT', 'LATE', 'EXCUSED', 'ABSENT']

const ATTENDANCE_DOT: Record<AttendanceStatus, string> = {
  PRESENT: 'bg-emerald-500',
  LATE: 'bg-amber-500',
  EXCUSED: 'bg-sky-500',
  ABSENT: 'bg-red-500',
}

const STATUS_VARIANT: Record<DayRelation, BadgeVariant> = {
  past: 'default',
  today: 'sky',
  future: 'emerald',
}

const STATUS_KEY: Record<DayRelation, string> = {
  past: 'training.statusCompleted',
  today: 'training.statusToday',
  future: 'training.statusUpcoming',
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
    return <LoadingSpinner />
  }

  if (error || !session) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <EmptyState
          icon={<AlertTriangle size={20} />}
          title={t('training.error.sessionLoadFailed')}
          description={error ?? t('training.error.notFound')}
        />
      </div>
    )
  }

  const relation = relativeToToday(session.training_date)
  const longDate = parseDateOnly(session.training_date).toLocaleDateString(displayLocale, {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
  const startTime = session.start_time ? session.start_time.substring(0, 5) : null

  const attendanceCounts = attendance.reduce(
    (acc, a) => ({ ...acc, [a.status]: (acc[a.status] ?? 0) + 1 }),
    {} as Partial<Record<AttendanceStatus, number>>,
  )

  const sortedExercises = session.session_exercises.slice().sort((a, b) => a.order - b.order)

  const editAttendancePath = (a: TrainingAttendance) =>
    `/coach/sessions/${session.id}/edit-attendance/${a.id}`

  const attendanceStatusLabel = (status: AttendanceStatus) =>
    t(`training.attendanceStatus.${status}`, status)

  const attendanceColumns: Column<TrainingAttendance>[] = [
    {
      key: 'player',
      header: t('playerProfile.tablePlayer'),
      render: (a) => (
        <div>
          <p className="font-medium text-cf-surface-foreground">{a.player_name}</p>
          <p className="font-mono text-xs text-emerald-600 dark:text-emerald-400">{a.football_id}</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: t('playerProfile.tableStatus'),
      render: (a) => (
        <Badge variant={ATTENDANCE_VARIANT[a.status] ?? 'default'}>{attendanceStatusLabel(a.status)}</Badge>
      ),
    },
    {
      key: 'notes',
      header: t('playerProfile.tableNotes'),
      cellClassName: 'text-xs text-cf-muted-foreground',
      render: (a) => a.notes || '—',
    },
    {
      key: 'actions',
      header: '',
      cellClassName: 'text-right whitespace-nowrap',
      render: (a) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(editAttendancePath(a))}
          aria-label={`${t('training.editAction')} — ${a.player_name}`}
        >
          <Edit2 size={12} />
          {t('training.editAction')}
        </Button>
      ),
    },
  ]

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Back link */}
      <Link
        to="/coach/sessions"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-cf-muted-foreground transition-colors hover:text-cf-surface-foreground"
      >
        <ArrowLeft size={14} />
        {t('training.allSessions')}
      </Link>

      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold leading-tight text-cf-surface-foreground">
              {session.title}
            </h1>
            <Badge variant={STATUS_VARIANT[relation]}>{t(STATUS_KEY[relation])}</Badge>
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-cf-muted-foreground">
            <CalendarDays size={14} className="shrink-0" />
            <span className="first-letter:uppercase">{longDate}</span>
            {startTime && <span className="tabular-nums">· {startTime}</span>}
            {session.team_name && <span>· {session.team_name}</span>}
          </p>
        </div>

        <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => navigate(`/coach/sessions/${session.id}/edit`)}>
            <Edit2 size={14} />
            {t('training.editSession')}
          </Button>
          <Button onClick={() => navigate(`/coach/sessions/${session.id}/add-attendance`)}>
            <Plus size={14} />
            {t('training.recordAttendance')}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Main column */}
        <div className="space-y-5 lg:col-span-2">
          {/* Exercises */}
          <Panel
            title={t('training.exercisesTitle')}
            count={sortedExercises.length}
            bodyClassName="p-0"
          >
            {sortedExercises.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-cf-muted-foreground">
                {t('training.noExercises')}
              </p>
            ) : (
              <ol className="divide-y divide-cf-border">
                {sortedExercises.map((ex, idx) => (
                  <li key={ex.id} className="flex items-start gap-3 px-4 py-3">
                    <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-cf-muted text-xs font-semibold tabular-nums text-cf-muted-foreground ring-1 ring-cf-border">
                      {idx + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-cf-surface-foreground">{ex.exercise_name}</p>
                        <Badge variant={CATEGORY_VARIANT[ex.exercise_category] ?? 'default'}>
                          {t(`training.exerciseCategoryLabel.${ex.exercise_category}`, ex.exercise_category)}
                        </Badge>
                      </div>
                      {ex.notes && <p className="mt-0.5 text-xs text-cf-muted-foreground">{ex.notes}</p>}
                    </div>
                    <span className="flex-shrink-0 text-xs tabular-nums text-cf-muted-foreground">
                      {ex.duration_minutes ? t('training.durationMin', { n: ex.duration_minutes }) : '—'}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Panel>

          {/* Attendance */}
          <Panel
            title={t('training.attendanceTitle')}
            count={attendance.length}
            bodyClassName="p-0"
          >
            {attendance.length === 0 ? (
              <div className="px-4 py-6 text-center">
                <UserCheck size={18} className="mx-auto text-cf-muted-foreground" />
                <p className="mt-2 text-sm text-cf-muted-foreground">{t('training.noAttendance')}</p>
              </div>
            ) : (
              <>
                {/* Status counts */}
                <div className="grid grid-cols-2 border-b border-cf-border sm:grid-cols-4">
                  {ATTENDANCE_ORDER.map((status, i) => (
                    <div
                      key={status}
                      className={cn(
                        'px-4 py-2.5',
                        i > 0 && 'sm:border-l sm:border-cf-border',
                        i % 2 === 1 && 'border-l border-cf-border',
                        i >= 2 && 'border-t border-cf-border sm:border-t-0',
                      )}
                    >
                      <p className="flex items-center gap-1.5 text-xs text-cf-muted-foreground">
                        <span className={cn('h-2 w-2 rounded-full', ATTENDANCE_DOT[status])} />
                        {attendanceStatusLabel(status)}
                      </p>
                      <p className="mt-0.5 text-lg font-semibold tabular-nums text-cf-surface-foreground">
                        {attendanceCounts[status] ?? 0}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Desktop table */}
                <div className="hidden md:block">
                  <DataTable
                    columns={attendanceColumns}
                    rows={attendance}
                    rowKey={(a) => a.id}
                    className="rounded-none ring-0"
                  />
                </div>

                {/* Mobile list */}
                <ul className="divide-y divide-cf-border md:hidden">
                  {attendance.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-cf-surface-foreground">{a.player_name}</p>
                        <p className="font-mono text-xs text-emerald-600 dark:text-emerald-400">{a.football_id}</p>
                        {a.notes && <p className="mt-0.5 text-xs text-cf-muted-foreground">{a.notes}</p>}
                      </div>
                      <div className="flex flex-shrink-0 items-center gap-1">
                        <Badge variant={ATTENDANCE_VARIANT[a.status] ?? 'default'}>
                          {attendanceStatusLabel(a.status)}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(editAttendancePath(a))}
                          aria-label={`${t('training.editAction')} — ${a.player_name}`}
                        >
                          <Edit2 size={13} />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Panel>
        </div>

        {/* Side column */}
        <div className="space-y-5">
          <Panel title={t('training.sectionDetails')}>
            <DescriptionList
              items={[
                { label: t('training.detailAcademy'), value: session.academy_name },
                { label: t('training.detailTeam'), value: session.team_name },
                { label: t('training.detailCoach'), value: session.coach_name },
                { label: t('training.detailLocation'), value: session.location },
                { label: t('training.detailStartTime'), value: startTime },
                {
                  label: t('training.detailDuration'),
                  value: session.duration_minutes
                    ? t('training.durationMin', { n: session.duration_minutes })
                    : null,
                },
              ]}
            />
          </Panel>

          <Panel title={t('training.sectionFocusSkills')} count={session.focus_skills.length}>
            {session.focus_skills.length === 0 ? (
              <p className="text-sm text-cf-muted-foreground">—</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {session.focus_skills.map((s) => (
                  <Badge key={s.id} variant={CATEGORY_VARIANT[s.category] ?? 'default'}>
                    {s.name}
                  </Badge>
                ))}
              </div>
            )}
          </Panel>

          {session.description && (
            <Panel title={t('training.sectionDescription')}>
              <p className="flex gap-2 whitespace-pre-line text-sm text-cf-muted-foreground">
                <ClipboardList size={14} className="mt-0.5 shrink-0" />
                {session.description}
              </p>
            </Panel>
          )}
        </div>
      </div>
    </div>
  )
}
