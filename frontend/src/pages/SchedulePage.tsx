import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Info,
  MapPin,
  Plus,
} from 'lucide-react'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import EmptyState from '../components/ui/EmptyState'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import PageHeader from '../components/ui/PageHeader'
import Panel from '../components/ui/Panel'
import { RESULT_VARIANT, resultLabelKey } from '../constants/badgeVariants'
import { trainingService } from '../services/trainingService'
import { matchService } from '../services/matchService'
import type { Match, PaginatedResponse, TrainingSession } from '../types'
import { parseDateOnly, toIsoDate } from '../utils/dateOnly'
import { toDisplayLocale } from '../utils/localeDateFormatter'
import { cn } from '../lib/utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ScheduleEvent =
  | { kind: 'training'; id: string; date: string; session: TrainingSession }
  | { kind: 'match'; id: string; date: string; match: Match }

/** How much of a paginated source was actually loaded. */
interface SourceCoverage {
  loaded: number
  total: number
  /** Oldest date in the loaded page, when more (older) pages exist */
  truncatedAt: string | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function coverageOf<T>(data: PaginatedResponse<T>, dateOf: (item: T) => string): SourceCoverage {
  // Both endpoints are ordered newest-first, so a truncated response is
  // missing events on or before the oldest date it contains.
  const dates = data.results.map((r) => dateOf(r).substring(0, 10)).sort()
  return {
    loaded: data.results.length,
    total: data.count,
    truncatedAt: data.next !== null && dates.length > 0 ? dates[0] : null,
  }
}

function buildCalendarDays(year: number, month: number): (string | null)[] {
  // month is 0-indexed; weeks start on Monday
  const startDow = (new Date(year, month, 1).getDay() + 6) % 7   // Mon=0 .. Sun=6
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const cells: (string | null)[] = []
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(toIsoDate(new Date(year, month, d)))
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

function eventPath(ev: ScheduleEvent): string {
  return ev.kind === 'training' ? `/coach/sessions/${ev.id}` : `/coach/matches/${ev.id}`
}

const KIND_STYLES = {
  training: {
    dot: 'bg-emerald-500',
    bar: 'border-l-emerald-500',
    chip: 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300 dark:hover:bg-emerald-900',
  },
  match: {
    dot: 'bg-sky-500',
    bar: 'border-l-sky-500',
    chip: 'bg-sky-50 text-sky-800 hover:bg-sky-100 dark:bg-sky-950 dark:text-sky-300 dark:hover:bg-sky-900',
  },
} as const

// ---------------------------------------------------------------------------
// Event chip (inside a calendar cell, sm+)
// ---------------------------------------------------------------------------

function EventChip({ event }: { event: ScheduleEvent }) {
  const { t } = useTranslation()
  const label = event.kind === 'training'
    ? event.session.title
    : t('matches.vsOpponent', { opponent: event.match.opponent_name })
  const kindLabel = event.kind === 'training' ? t('schedule.trainingLabel') : t('schedule.matchLabel')

  return (
    <Link
      to={eventPath(event)}
      onClick={(e) => e.stopPropagation()}
      title={`${kindLabel}: ${label}`}
      className={cn(
        'block truncate rounded-sm border-l-2 px-1 py-0.5 text-[11px] font-medium leading-tight transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50',
        KIND_STYLES[event.kind].bar,
        KIND_STYLES[event.kind].chip,
      )}
    >
      <span className="sr-only">{kindLabel}: </span>
      {label}
    </Link>
  )
}

// ---------------------------------------------------------------------------
// Agenda item (side panel)
// ---------------------------------------------------------------------------

function AgendaItem({ event }: { event: ScheduleEvent }) {
  const { t } = useTranslation()
  const styles = KIND_STYLES[event.kind]

  let title: string
  let meta: (string | null)[]
  let time: string | null = null
  let trailing: React.ReactNode = null

  if (event.kind === 'training') {
    const s = event.session
    title = s.title
    time = s.start_time ? s.start_time.substring(0, 5) : null
    meta = [s.team_name, s.location || null]
  } else {
    const m = event.match
    title = t('matches.vsOpponent', { opponent: m.opponent_name })
    meta = [m.team_name, m.competition || null, m.home_away === 'HOME' ? t('matches.homeBadge') : t('matches.awayBadge')]
    trailing = (
      <div className="flex flex-col items-end gap-1">
        {m.score_display && (
          <span className="font-mono text-sm font-bold tabular-nums text-cf-surface-foreground">
            {m.score_display}
          </span>
        )}
        {m.result && <Badge variant={RESULT_VARIANT[m.result]}>{t(resultLabelKey(m.result))}</Badge>}
      </div>
    )
  }

  return (
    <Link
      to={eventPath(event)}
      className={cn(
        'flex items-start gap-3 border-l-2 px-4 py-2.5 transition-colors hover:bg-cf-muted/50',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-400/50',
        styles.bar,
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-cf-muted-foreground">
          {event.kind === 'training' ? t('schedule.trainingLabel') : t('schedule.matchLabel')}
          {time && (
            <span className="flex items-center gap-1 font-medium normal-case tracking-normal tabular-nums">
              <Clock size={10} />
              {time}
            </span>
          )}
        </p>
        <p className="mt-0.5 truncate text-sm font-medium text-cf-surface-foreground">{title}</p>
        {meta.some(Boolean) && (
          <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-cf-muted-foreground">
            {event.kind === 'training' && event.session.location && <MapPin size={10} className="shrink-0" />}
            {meta.filter(Boolean).join(' · ')}
          </p>
        )}
      </div>
      {trailing}
    </Link>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SchedulePage() {
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const locale = toDisplayLocale(i18n.language)

  // Calendar month state
  const today = new Date()
  const todayIso = toIsoDate(today)
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth()) // 0-indexed

  // Selected day
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  // Data
  const [events, setEvents] = useState<ScheduleEvent[]>([])
  const [coverage, setCoverage] = useState<{ sessions: SourceCoverage; matches: SourceCoverage } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    // NOTE: only the first page of each endpoint is loaded — the API has no
    // date-range filter yet. Missing data is surfaced via `coverage` below.
    Promise.all([
      trainingService.listSessions({ coach: 'me' }),
      matchService.listMatches(),
    ])
      .then(([sessionsData, matchesData]) => {
        const combined: ScheduleEvent[] = [
          ...sessionsData.results.map((s): ScheduleEvent => ({
            kind: 'training', id: s.id, date: s.training_date.substring(0, 10), session: s,
          })),
          ...matchesData.results.map((m): ScheduleEvent => ({
            kind: 'match', id: m.id, date: m.match_date.substring(0, 10), match: m,
          })),
        ].sort((a, b) => a.date.localeCompare(b.date))
        setEvents(combined)
        setCoverage({
          sessions: coverageOf(sessionsData, (s) => s.training_date),
          matches: coverageOf(matchesData, (m) => m.match_date),
        })
        setLoading(false)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : t('common.error.generic'))
        setLoading(false)
      })
  }, [t])

  // Month navigation
  function shiftMonth(delta: number) {
    const d = new Date(viewYear, viewMonth + delta, 1)
    setViewYear(d.getFullYear())
    setViewMonth(d.getMonth())
    setSelectedDay(null)
  }

  function goToToday() {
    setViewYear(today.getFullYear())
    setViewMonth(today.getMonth())
    setSelectedDay(todayIso)
  }

  const calendarCells = useMemo(
    () => buildCalendarDays(viewYear, viewMonth),
    [viewYear, viewMonth],
  )

  const eventsByDate = useMemo(() => {
    const map: Record<string, ScheduleEvent[]> = {}
    for (const ev of events) {
      if (!map[ev.date]) map[ev.date] = []
      map[ev.date].push(ev)
    }
    return map
  }, [events])

  const monthPrefix = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`
  const eventsThisMonth = useMemo(
    () => events.filter((ev) => ev.date.startsWith(monthPrefix)),
    [events, monthPrefix],
  )
  const monthCounts = {
    training: eventsThisMonth.filter((e) => e.kind === 'training').length,
    match: eventsThisMonth.filter((e) => e.kind === 'match').length,
  }

  // Latest date before which data may be incomplete (null = everything loaded)
  const truncatedAt = coverage
    ? [coverage.sessions.truncatedAt, coverage.matches.truncatedAt]
        .filter((d): d is string => d !== null)
        .sort()
        .pop() ?? null
    : null
  const monthMayBeIncomplete = truncatedAt !== null && `${monthPrefix}-01` <= truncatedAt

  const panelEvents = selectedDay ? (eventsByDate[selectedDay] ?? []) : eventsThisMonth
  const monthTitle = new Date(viewYear, viewMonth, 1).toLocaleDateString(locale, { month: 'long', year: 'numeric' })
  const formatDay = (iso: string, opts: Intl.DateTimeFormatOptions) =>
    parseDateOnly(iso).toLocaleDateString(locale, opts)

  // Month agenda grouped by day (already sorted ascending)
  const agendaGroups = useMemo(() => {
    const groups: { date: string; items: ScheduleEvent[] }[] = []
    for (const ev of panelEvents) {
      const last = groups[groups.length - 1]
      if (last && last.date === ev.date) last.items.push(ev)
      else groups.push({ date: ev.date, items: [ev] })
    }
    return groups
  }, [panelEvents])

  const WEEKDAYS = [
    t('schedule.weekdayMon'),
    t('schedule.weekdayTue'),
    t('schedule.weekdayWed'),
    t('schedule.weekdayThu'),
    t('schedule.weekdayFri'),
    t('schedule.weekdaySat'),
    t('schedule.weekdaySun'),
  ]

  if (loading) {
    return <LoadingSpinner />
  }

  if (error) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <EmptyState
          icon={<AlertTriangle size={20} />}
          title={t('common.error.generic')}
          description={error}
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        title={t('schedule.title')}
        subtitle={t('schedule.subtitle')}
        className="flex-wrap"
        action={
          <>
            <Button variant="secondary" onClick={() => navigate('/coach/matches/new')}>
              <Plus size={14} />
              {t('matches.newMatch')}
            </Button>
            <Button onClick={() => navigate('/coach/sessions/new')}>
              <Plus size={14} />
              {t('training.newSession')}
            </Button>
          </>
        }
      />

      {/* Partial-data notice */}
      {coverage && truncatedAt && monthMayBeIncomplete && (
        <div
          role="note"
          className="mb-4 flex items-start gap-2.5 rounded-lg bg-cf-muted px-3 py-2.5 text-cf-muted-foreground ring-1 ring-inset ring-cf-border"
        >
          <Info size={15} className="mt-0.5 shrink-0" />
          <div className="text-xs">
            <p className="font-semibold">{t('schedule.partialTitle')}</p>
            <p className="mt-0.5">
              {t('schedule.partialDesc', {
                sessionsLoaded: coverage.sessions.loaded,
                sessionsTotal: coverage.sessions.total,
                matchesLoaded: coverage.matches.loaded,
                matchesTotal: coverage.matches.total,
                date: formatDay(truncatedAt, { day: 'numeric', month: 'long', year: 'numeric' }),
              })}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Calendar */}
        <section className="overflow-hidden rounded-xl bg-cf-surface ring-1 ring-cf-border lg:col-span-2">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cf-border px-4 py-2.5">
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={() => shiftMonth(-1)} aria-label={t('schedule.navPrev')}>
                <ChevronLeft size={16} />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => shiftMonth(1)} aria-label={t('schedule.navNext')}>
                <ChevronRight size={16} />
              </Button>
              <h2 className="ml-1 text-sm font-semibold capitalize text-cf-surface-foreground" aria-live="polite">
                {monthTitle}
              </h2>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-3 text-xs text-cf-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className={cn('h-2 w-2 rounded-full', KIND_STYLES.training.dot)} />
                  {t('schedule.trainingLabel')}
                  <span className="tabular-nums text-cf-surface-foreground">{monthCounts.training}</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className={cn('h-2 w-2 rounded-full', KIND_STYLES.match.dot)} />
                  {t('schedule.matchLabel')}
                  <span className="tabular-nums text-cf-surface-foreground">{monthCounts.match}</span>
                </span>
              </div>
              <Button variant="secondary" size="sm" onClick={goToToday}>
                {t('schedule.today')}
              </Button>
            </div>
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7 border-b border-cf-border bg-cf-muted">
            {WEEKDAYS.map((wd) => (
              <div
                key={wd}
                className="py-1.5 text-center text-[11px] font-semibold uppercase tracking-wide text-cf-muted-foreground"
              >
                {wd}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7">
            {calendarCells.map((dateStr, i) => {
              const borders = cn('border-b border-cf-border', (i + 1) % 7 !== 0 && 'border-r')

              if (!dateStr) {
                return <div key={`empty-${i}`} className={cn('min-h-[3.25rem] bg-cf-muted/40 sm:min-h-[6rem]', borders)} />
              }

              const dayEvents = eventsByDate[dateStr] ?? []
              const isToday = dateStr === todayIso
              const isSelected = dateStr === selectedDay
              const visibleEvents = dayEvents.slice(0, 2)
              const moreCount = dayEvents.length - visibleEvents.length
              const select = () => setSelectedDay(isSelected ? null : dateStr)

              return (
                <div
                  key={dateStr}
                  role="gridcell"
                  tabIndex={0}
                  onClick={select}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      select()
                    }
                  }}
                  aria-pressed={isSelected}
                  aria-current={isToday ? 'date' : undefined}
                  aria-label={t('schedule.dayAria', {
                    count: dayEvents.length,
                    date: formatDay(dateStr, { weekday: 'long', day: 'numeric', month: 'long' }),
                  })}
                  className={cn(
                    'min-h-[3.25rem] cursor-pointer p-1 transition-colors sm:min-h-[6rem] sm:p-1.5',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-400/60',
                    borders,
                    isSelected ? 'bg-emerald-50/70 dark:bg-emerald-950/60' : 'hover:bg-cf-muted/50',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold tabular-nums',
                      isToday
                        ? 'bg-cf-brand text-cf-brand-foreground'
                        : isSelected
                          ? 'text-emerald-700 ring-1 ring-emerald-400 dark:text-emerald-300'
                          : 'text-cf-surface-foreground',
                    )}
                  >
                    {Number(dateStr.substring(8, 10))}
                  </span>

                  {/* Chips (sm+) */}
                  <div className="mt-1 hidden space-y-0.5 sm:block">
                    {visibleEvents.map((ev) => (
                      <EventChip key={`${ev.kind}-${ev.id}`} event={ev} />
                    ))}
                    {moreCount > 0 && (
                      <p className="px-1 text-[11px] text-cf-muted-foreground">
                        {t('schedule.moreEvents', { count: moreCount })}
                      </p>
                    )}
                  </div>

                  {/* Dots (mobile) */}
                  {dayEvents.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-0.5 px-0.5 sm:hidden" aria-hidden="true">
                      {dayEvents.slice(0, 4).map((ev) => (
                        <span key={`${ev.kind}-${ev.id}`} className={cn('h-1.5 w-1.5 rounded-full', KIND_STYLES[ev.kind].dot)} />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>

        {/* Agenda */}
        <Panel
          title={
            selectedDay
              ? formatDay(selectedDay, { weekday: 'long', day: 'numeric', month: 'long' })
              : t('schedule.allEventsThisMonth')
          }
          count={panelEvents.length}
          bodyClassName="p-0"
          className="self-start"
          action={
            selectedDay ? (
              <Button variant="link" size="sm" onClick={() => setSelectedDay(null)}>
                {t('schedule.showWholeMonth')}
              </Button>
            ) : undefined
          }
        >
          {panelEvents.length === 0 ? (
            <EmptyState
              icon={<CalendarDays size={18} />}
              title={selectedDay ? t('schedule.dayEmpty') : t('schedule.noEventsThisMonth')}
              description={selectedDay ? undefined : t('schedule.noEventsDesc')}
              className="rounded-none ring-0"
            />
          ) : (
            <div className="max-h-[36rem] divide-y divide-cf-border overflow-y-auto">
              {agendaGroups.map((group) => (
                <div key={group.date}>
                  {!selectedDay && (
                    <p
                      className={cn(
                        'sticky top-0 z-10 border-b border-cf-border bg-cf-muted px-4 py-1 text-[11px] font-semibold uppercase tracking-wide',
                        group.date === todayIso ? 'text-emerald-700 dark:text-emerald-400' : 'text-cf-muted-foreground',
                      )}
                    >
                      {formatDay(group.date, { weekday: 'short', day: 'numeric', month: 'short' })}
                      {group.date === todayIso && <> · {t('schedule.today')}</>}
                    </p>
                  )}
                  <div className="divide-y divide-cf-border">
                    {group.items.map((ev) => (
                      <AgendaItem key={`${ev.kind}-${ev.id}`} event={ev} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  )
}
