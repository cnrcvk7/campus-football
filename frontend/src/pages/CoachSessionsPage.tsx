import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangle,
  CalendarDays,
  ChevronRight,
  Clock,
  MapPin,
  Plus,
  Search,
} from 'lucide-react'
import Badge, { type BadgeVariant } from '../components/ui/Badge'
import Button from '../components/ui/Button'
import DataTable, { type Column } from '../components/ui/DataTable'
import EmptyState from '../components/ui/EmptyState'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import PageHeader from '../components/ui/PageHeader'
import Pagination from '../components/ui/Pagination'
import { CATEGORY_VARIANT } from '../constants/badgeVariants'
import { trainingService } from '../services/trainingService'
import type { TrainingSession } from '../types'
import { parseDateOnly, relativeToToday, type DayRelation } from '../utils/dateOnly'
import { toDisplayLocale } from '../utils/localeDateFormatter'
import { cn } from '../lib/utils'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20

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

/** "HH:MM:SS" → "HH:MM" */
function shortTime(time: string | null): string | null {
  return time ? time.substring(0, 5) : null
}

function FocusSkillBadges({ session, max = 2 }: { session: TrainingSession; max?: number }) {
  const skills = session.focus_skills
  if (skills.length === 0) return <span className="text-cf-muted-foreground">—</span>
  const extra = skills.length - max

  return (
    <div className="flex flex-wrap gap-1">
      {skills.slice(0, max).map((s) => (
        <Badge key={s.id} variant={CATEGORY_VARIANT[s.category] ?? 'default'}>
          {s.name}
        </Badge>
      ))}
      {extra > 0 && (
        <span title={skills.slice(max).map((s) => s.name).join(', ')}>
          <Badge>+{extra}</Badge>
        </span>
      )}
    </div>
  )
}

function StatusBadge({ date }: { date: string }) {
  const { t } = useTranslation()
  const relation = relativeToToday(date)
  return <Badge variant={STATUS_VARIANT[relation]}>{t(STATUS_KEY[relation])}</Badge>
}

// ---------------------------------------------------------------------------
// Mobile card
// ---------------------------------------------------------------------------

function SessionMobileCard({ session, onView }: { session: TrainingSession; onView: () => void }) {
  const { i18n, t } = useTranslation()
  const displayLocale = toDisplayLocale(i18n.language)
  const date = parseDateOnly(session.training_date)
  const time = shortTime(session.start_time)

  return (
    <button
      onClick={onView}
      className={cn(
        'w-full rounded-xl p-3 text-left ring-1 transition',
        'bg-cf-surface ring-cf-border hover:ring-emerald-400',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400',
      )}
    >
      <div className="flex items-start gap-3">
        {/* Date block */}
        <div className="w-11 flex-shrink-0 rounded-lg bg-cf-muted py-1.5 text-center ring-1 ring-cf-border">
          <p className="text-[10px] font-semibold uppercase leading-none text-cf-muted-foreground">
            {date.toLocaleDateString(displayLocale, { month: 'short' })}
          </p>
          <p className="mt-1 text-lg font-bold leading-none text-cf-surface-foreground">
            {date.getDate()}
          </p>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate text-sm font-semibold text-cf-surface-foreground">{session.title}</p>
            <StatusBadge date={session.training_date} />
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-cf-muted-foreground">
            {session.team_name && <span>{session.team_name}</span>}
            {time && (
              <span className="flex items-center gap-1">
                <Clock size={11} />
                {time}
              </span>
            )}
            {session.duration_minutes && (
              <span>{t('training.durationMin', { n: session.duration_minutes })}</span>
            )}
            {session.location && (
              <span className="flex items-center gap-1">
                <MapPin size={11} />
                {session.location}
              </span>
            )}
          </div>
          {session.focus_skills.length > 0 && (
            <div className="mt-2">
              <FocusSkillBadges session={session} />
            </div>
          )}
        </div>
      </div>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Ownership filter (segmented control)
// ---------------------------------------------------------------------------

function OwnershipFilter({ myOnly, onChange }: { myOnly: boolean; onChange: (v: boolean) => void }) {
  const { t } = useTranslation()
  const options = [
    { value: false, label: t('training.allSessions') },
    { value: true, label: t('training.filterMine') },
  ]

  return (
    <div
      role="group"
      aria-label={t('training.filterLabel')}
      className="inline-flex rounded-md bg-cf-muted p-0.5 ring-1 ring-cf-border"
    >
      {options.map((opt) => {
        const active = myOnly === opt.value
        return (
          <button
            key={String(opt.value)}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              'h-7 rounded px-3 text-xs font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50',
              active
                ? 'bg-cf-surface text-cf-surface-foreground shadow-sm ring-1 ring-cf-border'
                : 'text-cf-muted-foreground hover:text-cf-surface-foreground',
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CoachSessionsPage() {
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const displayLocale = toDisplayLocale(i18n.language)
  const [sessions, setSessions] = useState<TrainingSession[]>([])
  const [total, setTotal] = useState(0)
  const [hasNext, setHasNext] = useState(false)
  const [hasPrev, setHasPrev] = useState(false)
  const [page, setPage] = useState(1)
  const [myOnly, setMyOnly] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setPage(1)
  }, [myOnly])

  useEffect(() => {
    setLoading(true)
    setError(null)
    trainingService
      .listSessions({ coach: myOnly ? 'me' : undefined, page })
      .then((data) => {
        setSessions(data.results)
        setTotal(data.count)
        setHasNext(data.next !== null)
        setHasPrev(data.previous !== null)
        setLoading(false)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : t('training.error.loadFailed'))
        setLoading(false)
      })
  }, [myOnly, page, t])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const openSession = (s: TrainingSession) => navigate(`/coach/sessions/${s.id}`)

  // Inside the table the EmptyState drops its own frame (the table provides one)
  const renderEmpty = (inTable: boolean) => (
    <EmptyState
      icon={myOnly ? <Search size={20} /> : <CalendarDays size={20} />}
      title={myOnly ? t('training.noResultsTitle') : t('training.emptyTitle')}
      description={myOnly ? t('training.noResultsDesc') : t('training.emptyDesc')}
      className={inTable ? 'rounded-none ring-0' : undefined}
    />
  )

  const columns: Column<TrainingSession>[] = [
    {
      key: 'date',
      header: t('training.date'),
      cellClassName: 'whitespace-nowrap',
      render: (s) => {
        const date = parseDateOnly(s.training_date)
        return (
          <div>
            <p className="font-medium tabular-nums text-cf-surface-foreground">
              {date.toLocaleDateString(displayLocale, { day: '2-digit', month: 'short', year: 'numeric' })}
            </p>
            <p className="text-xs text-cf-muted-foreground">
              {date.toLocaleDateString(displayLocale, { weekday: 'short' })}
              {s.start_time && <> · <span className="tabular-nums">{shortTime(s.start_time)}</span></>}
            </p>
          </div>
        )
      },
    },
    {
      key: 'title',
      header: t('training.titleField'),
      render: (s) => (
        <div className="min-w-0">
          <Link
            to={`/coach/sessions/${s.id}`}
            onClick={(e) => e.stopPropagation()}
            className="font-semibold text-cf-surface-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50 rounded-sm"
          >
            {s.title}
          </Link>
          {s.team_name && <p className="text-xs text-cf-muted-foreground">{s.team_name}</p>}
        </div>
      ),
    },
    {
      key: 'location',
      header: t('training.detailLocation'),
      cellClassName: 'text-cf-muted-foreground',
      render: (s) =>
        s.location ? (
          <span className="flex items-center gap-1.5">
            <MapPin size={12} className="shrink-0" />
            {s.location}
          </span>
        ) : '—',
    },
    {
      key: 'duration',
      header: t('training.detailDuration'),
      cellClassName: 'whitespace-nowrap text-cf-muted-foreground tabular-nums',
      render: (s) => (s.duration_minutes ? t('training.durationMin', { n: s.duration_minutes }) : '—'),
    },
    {
      key: 'skills',
      header: t('training.sectionFocusSkills'),
      render: (s) => <FocusSkillBadges session={s} />,
    },
    {
      key: 'status',
      header: t('training.tableStatus'),
      render: (s) => <StatusBadge date={s.training_date} />,
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
        title={t('training.listTitle')}
        subtitle={t('training.pageSubtitle')}
        action={
          <Button onClick={() => navigate('/coach/sessions/new')}>
            <Plus size={14} />
            {t('training.newSession')}
          </Button>
        }
      />

      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <OwnershipFilter myOnly={myOnly} onChange={setMyOnly} />
        {!loading && !error && (
          <p className="text-xs text-cf-muted-foreground">
            {t('training.sessionCount', { count: total })}
          </p>
        )}
      </div>

      {/* Initial loading */}
      {loading && sessions.length === 0 && <LoadingSpinner />}

      {/* Error */}
      {!loading && error && (
        <EmptyState
          icon={<AlertTriangle size={20} />}
          title={t('training.error.loadFailed')}
          description={error}
        />
      )}

      {/* Content */}
      {(!loading || sessions.length > 0) && !error && (
        <>
          {/* Desktop table (md+) */}
          <div className={cn('hidden md:block', loading && 'opacity-60')}>
            <DataTable
              columns={columns}
              rows={sessions}
              rowKey={(s) => s.id}
              onRowClick={openSession}
              empty={renderEmpty(true)}
            />
          </div>

          {/* Mobile cards (< md) */}
          <div className={cn('md:hidden', loading && 'opacity-60')}>
            {sessions.length === 0 ? (
              renderEmpty(false)
            ) : (
              <div className="space-y-2">
                {sessions.map((s) => (
                  <SessionMobileCard key={s.id} session={s} onView={() => openSession(s)} />
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
