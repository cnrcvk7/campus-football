import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppNav from '../components/ui/AppNav'
import EmptyState from '../components/ui/EmptyState'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import { trainingService } from '../services/trainingService'
import type { TrainingSession } from '../types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

const SKILL_CATEGORY_COLOR: Record<string, string> = {
  TECHNICAL: 'bg-blue-50 text-blue-600',
  TACTICAL: 'bg-purple-50 text-purple-600',
  PHYSICAL: 'bg-orange-50 text-orange-600',
  MENTAL: 'bg-teal-50 text-teal-600',
}

// ---------------------------------------------------------------------------
// Session card
// ---------------------------------------------------------------------------

function SessionCard({ session }: { session: TrainingSession }) {
  const navigate = useNavigate()
  return (
    <button
      onClick={() => navigate(`/coach/sessions/${session.id}`)}
      className="group w-full rounded-2xl bg-white p-5 text-left shadow-sm ring-1 ring-gray-100 transition hover:shadow-md hover:ring-brand-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
    >
      <div className="flex items-start gap-4">
        {/* Date block */}
        <div className="flex-shrink-0 w-14 rounded-xl bg-brand-50 px-1 py-2 text-center">
          <p className="text-xs font-medium text-brand-500 uppercase">
            {new Date(session.training_date).toLocaleDateString('en-GB', { month: 'short' })}
          </p>
          <p className="text-2xl font-bold leading-none text-brand-700">
            {new Date(session.training_date).getDate()}
          </p>
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-gray-900 truncate">{session.title}</p>
          <p className="mt-0.5 text-xs text-gray-400">
            {session.academy_name}
            {session.team_name && <> · {session.team_name}</>}
            {session.location && <> · {session.location}</>}
          </p>
          {session.focus_skills.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {session.focus_skills.slice(0, 4).map((s) => (
                <span
                  key={s.id}
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${SKILL_CATEGORY_COLOR[s.category] ?? 'bg-gray-100 text-gray-600'}`}
                >
                  {s.name}
                </span>
              ))}
              {session.focus_skills.length > 4 && (
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-400">
                  +{session.focus_skills.length - 4}
                </span>
              )}
            </div>
          )}
          <div className="mt-2 flex items-center gap-3">
            {session.duration_minutes && (
              <span className="text-xs text-gray-400">{session.duration_minutes} min</span>
            )}
            {session.session_exercises.length > 0 && (
              <span className="text-xs text-gray-400">
                {session.session_exercises.length} exercise{session.session_exercises.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>

        <span className="mt-1 flex-shrink-0 text-gray-300 transition group-hover:translate-x-0.5 group-hover:text-brand-400">
          →
        </span>
      </div>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CoachSessionsPage() {
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
        setError(err instanceof Error ? err.message : 'Failed to load sessions.')
        setLoading(false)
      })
  }, [myOnly, page])

  return (
    <div className="min-h-screen bg-gray-50">
      <AppNav label="Training Sessions" />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Training Sessions</h1>
            <p className="mt-1 text-sm text-gray-400">
              All training sessions — click a card to view exercises and attendance.
            </p>
          </div>
          <label className="flex flex-shrink-0 cursor-pointer items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 shadow-sm transition hover:border-brand-300">
            <input
              type="checkbox"
              checked={myOnly}
              onChange={(e) => setMyOnly(e.target.checked)}
              className="accent-brand-600"
            />
            My sessions only
          </label>
        </div>

        {loading && sessions.length === 0 && <LoadingSpinner />}

        {!loading && error && (
          <EmptyState icon="⚠️" title="Could not load sessions" description={error} />
        )}

        {(!loading || sessions.length > 0) && !error && (
          <>
            <div className="mb-4 text-sm text-gray-400">
              {loading ? (
                <span className="text-gray-300">Loading…</span>
              ) : (
                <>
                  <span className="font-semibold text-gray-700">{total}</span>{' '}
                  {total === 1 ? 'session' : 'sessions'}
                </>
              )}
            </div>

            {sessions.length === 0 && !loading ? (
              <EmptyState
                icon="🏃"
                title="No training sessions found"
                description={myOnly ? 'You have not created any sessions yet.' : 'No sessions have been created yet.'}
              />
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {sessions.map((s) => (
                  <SessionCard key={s.id} session={s} />
                ))}
              </div>
            )}

            {(hasNext || hasPrev) && (
              <div className="mt-8 flex items-center justify-between">
                <button
                  onClick={() => setPage((p) => p - 1)}
                  disabled={!hasPrev || loading}
                  className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  ← Previous
                </button>
                <p className="text-sm text-gray-400">
                  Page <span className="font-semibold text-gray-700">{page}</span>
                  {' '}of{' '}
                  <span className="font-semibold text-gray-700">{Math.ceil(total / 20)}</span>
                </p>
                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={!hasNext || loading}
                  className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
