import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Trophy,
} from 'lucide-react'
import EmptyState from '../components/ui/EmptyState'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import { trainingService } from '../services/trainingService'
import { matchService } from '../services/matchService'
import type { Match, MatchResult, TrainingSession } from '../types'
import { cn } from '../lib/utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TrainingEvent = {
  kind: 'training'
  id: string
  date: string  // YYYY-MM-DD
  title: string
  team: string | null
  location: string
}

type MatchEvent = {
  kind: 'match'
  id: string
  date: string  // YYYY-MM-DD
  opponent: string
  team: string
  result: MatchResult | null
  score: string | null
}

type ScheduleEvent = TrainingEvent | MatchEvent

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isoDate(dateStr: string): string {
  return dateStr.substring(0, 10)
}

function toTrainingEvent(s: TrainingSession): TrainingEvent {
  return {
    kind: 'training',
    id: s.id,
    date: isoDate(s.training_date),
    title: s.title,
    team: s.team_name,
    location: s.location,
  }
}

function toMatchEvent(m: Match): MatchEvent {
  return {
    kind: 'match',
    id: m.id,
    date: isoDate(m.match_date),
    opponent: m.opponent_name,
    team: m.team_name,
    result: m.result,
    score: m.score_display,
  }
}

function buildCalendarDays(year: number, month: number): (string | null)[] {
  // month is 0-indexed
  const firstDay = new Date(year, month, 1)
  // Monday = 0 offset, shift so Mon = 0
  const startDow = (firstDay.getDay() + 6) % 7   // Mon=0 .. Sun=6
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const cells: (string | null)[] = []
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    cells.push(dateStr)
  }
  // Pad to complete last week
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

function formatMonthYear(year: number, month: number, locale: string): string {
  return new Date(year, month, 1).toLocaleDateString(locale, { month: 'long', year: 'numeric' })
}

function formatDayLabel(dateStr: string, locale: string): string {
  return new Date(dateStr).toLocaleDateString(locale, {
    weekday: 'long', day: 'numeric', month: 'long',
  })
}

const TODAY = isoDate(new Date().toISOString())

// ---------------------------------------------------------------------------
// Event chip
// ---------------------------------------------------------------------------

function EventChip({
  event,
  onClick,
}: {
  event: ScheduleEvent
  onClick: () => void
}) {
  const { t } = useTranslation()
  const label =
    event.kind === 'training'
      ? event.title
      : `vs ${event.opponent}`

  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      title={label}
      className={cn(
        'w-full truncate rounded px-1 py-0.5 text-left text-xs font-medium transition',
        event.kind === 'training'
          ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-400 dark:hover:bg-emerald-900'
          : 'bg-sky-50 text-sky-700 hover:bg-sky-100 dark:bg-sky-950 dark:text-sky-400 dark:hover:bg-sky-900',
      )}
    >
      <span className="mr-1">
        {event.kind === 'training' ? t('schedule.trainingLabel') : t('schedule.matchLabel')}
      </span>
      {label}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Event list item
// ---------------------------------------------------------------------------

function EventListItem({ event, onNavigate }: { event: ScheduleEvent; onNavigate: () => void }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language

  const dateLabel = new Date(event.date).toLocaleDateString(locale, {
    weekday: 'short', day: 'numeric', month: 'short',
  })

  return (
    <button
      onClick={onNavigate}
      className={cn(
        'w-full text-left flex items-start gap-3 rounded-xl p-3 ring-1 bg-cf-surface ring-cf-border transition',
        'hover:ring-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400',
      )}
    >
      <div
        className={cn(
          'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
          event.kind === 'training'
            ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400'
            : 'bg-sky-50 text-sky-600 dark:bg-sky-950 dark:text-sky-400',
        )}
      >
        {event.kind === 'training' ? <CalendarDays size={16} /> : <Trophy size={16} />}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-cf-muted-foreground">{dateLabel}</span>
          <span
            className={cn(
              'rounded-full px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset',
              event.kind === 'training'
                ? 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-400 dark:ring-emerald-800'
                : 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-950 dark:text-sky-400 dark:ring-sky-800',
            )}
          >
            {event.kind === 'training' ? t('schedule.trainingLabel') : t('schedule.matchLabel')}
          </span>
        </div>
        <p className="mt-0.5 text-sm font-medium text-cf-surface-foreground truncate">
          {event.kind === 'training' ? event.title : `vs ${event.opponent}`}
        </p>
        <p className="text-xs text-cf-muted-foreground mt-0.5">
          {event.kind === 'training' ? (event.team ?? '') : event.team}
        </p>
      </div>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SchedulePage() {
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const locale = i18n.language

  // Calendar month state
  const today = new Date()
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth()) // 0-indexed

  // Selected day
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  // Data
  const [events, setEvents] = useState<ScheduleEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    Promise.all([
      trainingService.listSessions({ coach: 'me' }),
      matchService.listMatches(),
    ])
      .then(([sessionsData, matchesData]) => {
        const trainingEvents: ScheduleEvent[] = sessionsData.results.map(toTrainingEvent)
        const matchEvents: ScheduleEvent[] = matchesData.results.map(toMatchEvent)
        const combined = [...trainingEvents, ...matchEvents].sort((a, b) =>
          a.date.localeCompare(b.date),
        )
        setEvents(combined)
        setLoading(false)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : t('common.error.generic'))
        setLoading(false)
      })
  }, [t])

  // Month navigation
  function prevMonth() {
    if (viewMonth === 0) {
      setViewYear((y) => y - 1)
      setViewMonth(11)
    } else {
      setViewMonth((m) => m - 1)
    }
    setSelectedDay(null)
  }

  function nextMonth() {
    if (viewMonth === 11) {
      setViewYear((y) => y + 1)
      setViewMonth(0)
    } else {
      setViewMonth((m) => m + 1)
    }
    setSelectedDay(null)
  }

  // Calendar cells
  const calendarCells = useMemo(
    () => buildCalendarDays(viewYear, viewMonth),
    [viewYear, viewMonth],
  )

  // Events grouped by date
  const eventsByDate = useMemo(() => {
    const map: Record<string, ScheduleEvent[]> = {}
    for (const ev of events) {
      if (!map[ev.date]) map[ev.date] = []
      map[ev.date].push(ev)
    }
    return map
  }, [events])

  // Events for the current month (for the list panel)
  const monthPrefix = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`
  const eventsThisMonth = useMemo(
    () => events.filter((ev) => ev.date.startsWith(monthPrefix)),
    [events, monthPrefix],
  )

  // Events shown in the side panel
  const panelEvents = selectedDay
    ? (eventsByDate[selectedDay] ?? [])
    : eventsThisMonth

  const panelTitle = selectedDay
    ? t('schedule.eventsFor', { date: formatDayLabel(selectedDay, locale) })
    : t('schedule.allEventsThisMonth')

  const WEEKDAYS = [
    t('schedule.weekdayMon'),
    t('schedule.weekdayTue'),
    t('schedule.weekdayWed'),
    t('schedule.weekdayThu'),
    t('schedule.weekdayFri'),
    t('schedule.weekdaySat'),
    t('schedule.weekdaySun'),
  ]

  function navigateEvent(ev: ScheduleEvent) {
    if (ev.kind === 'training') navigate(`/coach/sessions/${ev.id}`)
    else navigate(`/coach/matches/${ev.id}`)
  }

  if (loading) {
    return <LoadingSpinner />
  }

  if (error) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <EmptyState
          icon={<AlertTriangle size={24} />}
          title={t('common.error.generic')}
          description={error}
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Page header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-cf-surface-foreground">{t('schedule.title')}</h1>
          <p className="mt-1 text-sm text-cf-muted-foreground">{t('schedule.subtitle')}</p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Calendar (2/3 width on lg) */}
          <div className="lg:col-span-2">
            <div className="rounded-2xl ring-1 bg-cf-surface ring-cf-border overflow-hidden">
              {/* Month navigation */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-cf-border">
                <button
                  onClick={prevMonth}
                  aria-label={t('schedule.navPrev')}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-cf-muted-foreground hover:bg-cf-muted hover:text-cf-surface-foreground transition-colors"
                >
                  <ChevronLeft size={18} />
                </button>
                <h2 className="text-sm font-semibold text-cf-surface-foreground capitalize">
                  {formatMonthYear(viewYear, viewMonth, locale)}
                </h2>
                <button
                  onClick={nextMonth}
                  aria-label={t('schedule.navNext')}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-cf-muted-foreground hover:bg-cf-muted hover:text-cf-surface-foreground transition-colors"
                >
                  <ChevronRight size={18} />
                </button>
              </div>

              {/* Weekday headers */}
              <div className="grid grid-cols-7 border-b border-cf-border">
                {WEEKDAYS.map((wd) => (
                  <div
                    key={wd}
                    className="py-2 text-center text-xs font-semibold uppercase tracking-wider text-cf-muted-foreground"
                  >
                    {wd}
                  </div>
                ))}
              </div>

              {/* Day cells */}
              <div className="grid grid-cols-7">
                {calendarCells.map((dateStr, i) => {
                  if (!dateStr) {
                    return (
                      <div
                        key={`empty-${i}`}
                        className="min-h-[80px] border-b border-r border-cf-border last:border-r-0 bg-cf-muted/30"
                      />
                    )
                  }

                  const dayEvents = eventsByDate[dateStr] ?? []
                  const isToday = dateStr === TODAY
                  const isSelected = dateStr === selectedDay
                  const visibleEvents = dayEvents.slice(0, 2)
                  const moreCount = dayEvents.length - 2

                  return (
                    <button
                      key={dateStr}
                      onClick={() => setSelectedDay(isSelected ? null : dateStr)}
                      className={cn(
                        'min-h-[80px] border-b border-r border-cf-border last:border-r-0 p-1.5 text-left transition-colors',
                        'focus:outline-none focus:ring-inset focus:ring-2 focus:ring-emerald-400',
                        isSelected
                          ? 'bg-emerald-50 dark:bg-emerald-950'
                          : 'hover:bg-cf-muted/50',
                      )}
                    >
                      <div
                        className={cn(
                          'mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold',
                          isToday
                            ? 'bg-emerald-500 text-white'
                            : 'text-cf-surface-foreground',
                        )}
                      >
                        {new Date(dateStr).getDate()}
                      </div>

                      <div className="space-y-0.5">
                        {visibleEvents.map((ev) => (
                          <EventChip
                            key={ev.id}
                            event={ev}
                            onClick={() => navigateEvent(ev)}
                          />
                        ))}
                        {moreCount > 0 && (
                          <p className="px-1 text-xs text-cf-muted-foreground">
                            {t('schedule.moreEvents', { count: moreCount })}
                          </p>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Side panel (1/3 width on lg) */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-cf-muted-foreground">
              {panelTitle}
            </h3>

            {panelEvents.length === 0 ? (
              <EmptyState
                icon={<CalendarDays size={20} />}
                title={t('schedule.noEventsThisMonth')}
                description={
                  selectedDay ? undefined : t('schedule.noEventsDesc')
                }
                className="py-8"
              />
            ) : (
              <div className="space-y-2">
                {panelEvents.map((ev) => (
                  <EventListItem
                    key={ev.id}
                    event={ev}
                    onNavigate={() => navigateEvent(ev)}
                  />
                ))}
              </div>
            )}

            {selectedDay && (
              <button
                onClick={() => setSelectedDay(null)}
                className="text-xs text-cf-muted-foreground hover:text-cf-surface-foreground transition-colors"
              >
                {t('schedule.allEventsThisMonth')} →
              </button>
            )}
          </div>
        </div>
    </div>
  )
}
