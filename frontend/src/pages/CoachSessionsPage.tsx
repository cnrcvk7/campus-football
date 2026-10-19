import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangle,
  CalendarDays,
  Clock,
  Eye,
  MapPin,
  Plus,
  Search,
} from 'lucide-react'
import AppNav from '../components/ui/AppNav'
import EmptyState from '../components/ui/EmptyState'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import { trainingService } from '../services/trainingService'
import type { TrainingSession } from '../types'
import { toDisplayLocale } from '../utils/localeDateFormatter'
import { cn } from '../lib/utils'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SKILL_CATEGORY_COLOR: Record<string, string> = {
  TECHNICAL: 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-950 dark:text-sky-400 dark:ring-sky-800',
  TACTICAL:  'bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-950 dark:text-violet-400 dark:ring-violet-800',
  PHYSICAL:  'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-400 dark:ring-emerald-800',
  MENTAL:    'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950 dark:text-amber-400 dark:ring-amber-800',
}

function formatShortDate(d: string, locale: string): string {
  const date = new Date(d)
  const day = date.getDate().toString().padStart(2, '0')
  const month = date.toLocaleDateString(locale, { month: 'short' })
  const year = date.getFullYear()
  return `${day} ${month} ${year}`
}

// ---------------------------------------------------------------------------
// Desktop table row
// ---------------------------------------------------------------------------

function SessionTableRow({ session, onView }: { session: TrainingSession; onView: () => void }) {
  const { i18n, t } = useTranslation()
  const displayLocale = toDisplayLocale(i18n.language)
  const skills = session.focus_skills
  const visibleSkills = skills.slice(0, 2)
  const extraCount = skills.length - 2

  return (
    <tr className="hover:bg-cf-muted/50 transition-colors">
      <td className="py-3 pl-4 pr-3 whitespace-nowrap">
        <div className="flex items-center gap-2 text-sm text-cf-muted-foreground">
          <CalendarDays size={14} className="shrink-0" />
          {formatShortDate(session.training_date, displayLocale)}
        </div>
      </td>
      <td className="px-3 py-3">
        <p className="text-sm font-semibold text-cf-surface-foreground">{session.title}</p>
      </td>
      <td className="px-3 py-3 text-sm text-cf-muted-foreground">
        {session.team_name ?? '—'}
      </td>
      <td className="px-3 py-3">
        {session.location ? (
          <span className="flex items-center gap-1.5 text-sm text-cf-muted-foreground">
            <MapPin size={12} className="shrink-0" />
            {session.location}
          </span>
        ) : (
          <span className="text-sm text-cf-muted-foreground">—</span>
        )}
      </td>
      <td className="px-3 py-3 whitespace-nowrap">
        {session.duration_minutes ? (
          <span className="flex items-center gap-1.5 text-sm text-cf-muted-foreground">
            <Clock size={12} className="shrink-0" />
            {t('training.durationMin', { n: session.duration_minutes })}
          </span>
        ) : (
          <span className="text-sm text-cf-muted-foreground">—</span>
        )}
      </td>
      <td className="px-3 py-3">
        <div className="flex flex-wrap gap-1">
          {visibleSkills.map((s) => (
            <span
              key={s.id}
              className={cn(
                'rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
                SKILL_CATEGORY_COLOR[s.category] ?? 'bg-cf-muted text-cf-muted-foreground ring-cf-border',
              )}
            >
              {s.name}
            </span>
          ))}
          {extraCount > 0 && (
            <span className="rounded-full px-2 py-0.5 text-xs text-cf-muted-foreground ring-1 ring-inset ring-cf-border bg-cf-muted">
              +{extraCount}
            </span>
          )}
        </div>
      </td>
      <td className="pl-3 pr-4 py-3 text-right">
        <button
          onClick={onView}
          aria-label="View session"
          className={cn(
            'inline-flex items-center justify-center h-8 w-8 rounded-lg transition',
            'text-cf-muted-foreground hover:text-cf-surface-foreground hover:bg-cf-muted',
          )}
        >
          <Eye size={16} />
        </button>
      </td>
    </tr>
  )
}

// ---------------------------------------------------------------------------
// Mobile card
// ---------------------------------------------------------------------------

function SessionMobileCard({ session, onView }: { session: TrainingSession; onView: () => void }) {
  const { i18n, t } = useTranslation()
  const displayLocale = toDisplayLocale(i18n.language)
  const skills = session.focus_skills
  const visibleSkills = skills.slice(0, 2)
  const extraCount = skills.length - 2
  const date = new Date(session.training_date)

  return (
    <button
      onClick={onView}
      className={cn(
        'w-full text-left rounded-2xl p-4 ring-1 bg-cf-surface ring-cf-border transition',
        'hover:ring-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400',
      )}
    >
      <div className="flex items-start gap-3">
        {/* Date block */}
        <div className="flex-shrink-0 w-12 rounded-xl bg-emerald-50 dark:bg-emerald-950 px-1 py-2 text-center">
          <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400 uppercase">
            {date.toLocaleDateString(displayLocale, { month: 'short' })}
          </p>
          <p className="text-xl font-bold leading-none text-emerald-700 dark:text-emerald-300">
            {date.getDate()}
          </p>
        </div>

        <div className="min-w-0 flex-1">
          <p className="font-semibold text-cf-surface-foreground truncate">{session.title}</p>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-cf-muted-foreground">
            {session.team_name && <span>{session.team_name}</span>}
            {session.location && (
              <span className="flex items-center gap-1">
                <MapPin size={10} />
                {session.location}
              </span>
            )}
            {session.duration_minutes && (
              <span className="flex items-center gap-1">
                <Clock size={10} />
                {t('training.durationMin', { n: session.duration_minutes })}
              </span>
            )}
          </div>
          {visibleSkills.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {visibleSkills.map((s) => (
                <span
                  key={s.id}
                  className={cn(
                    'rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
                    SKILL_CATEGORY_COLOR[s.category] ?? 'bg-cf-muted text-cf-muted-foreground ring-cf-border',
                  )}
                >
                  {s.name}
                </span>
              ))}
              {extraCount > 0 && (
                <span className="rounded-full px-2 py-0.5 text-xs text-cf-muted-foreground ring-1 ring-inset ring-cf-border bg-cf-muted">
                  +{extraCount}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CoachSessionsPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
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

  const totalPages = Math.max(1, Math.ceil(total / 20))

  return (
    <div className="min-h-screen bg-cf-background">
      <AppNav label={t('training.sessionsNavLabel')} />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-cf-surface-foreground">{t('training.listTitle')}</h1>
            <p className="mt-1 text-sm text-cf-muted-foreground">
              {!loading && t('training.sessionCount', { count: total })}
            </p>
          </div>

          <div className="flex flex-shrink-0 flex-wrap items-center gap-3">
            {/* My sessions toggle */}
            <label
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium ring-1 transition',
                myOnly
                  ? 'bg-emerald-500 text-white ring-emerald-500'
                  : 'bg-cf-surface text-cf-surface-foreground ring-cf-border hover:bg-cf-muted',
              )}
            >
              <input
                type="checkbox"
                checked={myOnly}
                onChange={(e) => setMyOnly(e.target.checked)}
                className="sr-only"
              />
              {t('training.mySessionsOnly')}
            </label>

            <button
              onClick={() => navigate('/coach/sessions/new')}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium bg-emerald-500 hover:bg-emerald-600 text-white transition-colors"
            >
              <Plus size={16} />
              {t('training.addButton')}
            </button>
          </div>
        </div>

        {/* Loading */}
        {loading && sessions.length === 0 && <LoadingSpinner />}

        {/* Error */}
        {!loading && error && (
          <EmptyState
            icon={<AlertTriangle size={24} />}
            title={t('training.error.loadFailed')}
            description={error}
          />
        )}

        {/* Content */}
        {(!loading || sessions.length > 0) && !error && (
          <>
            {sessions.length === 0 && !loading ? (
              myOnly ? (
                <EmptyState
                  icon={<Search size={24} />}
                  title={t('training.noResultsTitle')}
                  description={t('training.noResultsDesc')}
                />
              ) : (
                <EmptyState
                  icon={<CalendarDays size={24} />}
                  title={t('training.emptyTitle')}
                  description={t('training.emptyDesc')}
                />
              )
            ) : (
              <>
                {/* Desktop table */}
                <div className="hidden md:block overflow-hidden rounded-2xl ring-1 ring-cf-border">
                  <table className="min-w-full divide-y divide-cf-border">
                    <thead>
                      <tr className="bg-cf-muted">
                        <th className="py-3 pl-4 pr-3 text-left text-xs font-semibold uppercase tracking-wider text-cf-muted-foreground">
                          {t('training.date', 'Date')}
                        </th>
                        <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-cf-muted-foreground">
                          {t('training.titleField')}
                        </th>
                        <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-cf-muted-foreground">
                          {t('training.detailTeam')}
                        </th>
                        <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-cf-muted-foreground">
                          {t('training.detailLocation')}
                        </th>
                        <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-cf-muted-foreground">
                          {t('training.detailDuration')}
                        </th>
                        <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-cf-muted-foreground">
                          {t('training.sectionFocusSkills')}
                        </th>
                        <th className="pl-3 pr-4 py-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-cf-border bg-cf-surface">
                      {sessions.map((s) => (
                        <SessionTableRow
                          key={s.id}
                          session={s}
                          onView={() => navigate(`/coach/sessions/${s.id}`)}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile cards */}
                <div className="md:hidden space-y-3">
                  {sessions.map((s) => (
                    <SessionMobileCard
                      key={s.id}
                      session={s}
                      onView={() => navigate(`/coach/sessions/${s.id}`)}
                    />
                  ))}
                </div>
              </>
            )}

            {/* Pagination */}
            {(hasNext || hasPrev) && (
              <div className="mt-8 flex items-center justify-between">
                <button
                  onClick={() => setPage((p) => p - 1)}
                  disabled={!hasPrev || loading}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium bg-cf-surface ring-1 ring-cf-border text-cf-surface-foreground hover:bg-cf-muted transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {t('pagination.previous')}
                </button>
                <p className="text-sm text-cf-muted-foreground">
                  {t('pagination.page')}{' '}
                  <span className="font-semibold text-cf-surface-foreground">{page}</span>
                  {' '}{t('pagination.of')}{' '}
                  <span className="font-semibold text-cf-surface-foreground">{totalPages}</span>
                </p>
                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={!hasNext || loading}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium bg-cf-surface ring-1 ring-cf-border text-cf-surface-foreground hover:bg-cf-muted transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {t('pagination.next')}
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
