import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import AppNav from '../components/ui/AppNav'
import EmptyState from '../components/ui/EmptyState'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import { trainingService } from '../services/trainingService'
import type { TrainingAttendance, TrainingSession } from '../types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

const SKILL_CATEGORY_COLOR: Record<string, string> = {
  TECHNICAL: 'bg-blue-50 text-blue-600',
  TACTICAL: 'bg-purple-50 text-purple-600',
  PHYSICAL: 'bg-orange-50 text-orange-600',
  MENTAL: 'bg-teal-50 text-teal-600',
}

const EXERCISE_CATEGORY_BADGE: Record<string, string> = {
  TECHNICAL: 'bg-blue-50 text-blue-600',
  TACTICAL: 'bg-purple-50 text-purple-600',
  PHYSICAL: 'bg-orange-50 text-orange-600',
  MENTAL: 'bg-teal-50 text-teal-600',
  WARM_UP: 'bg-yellow-50 text-yellow-600',
  COOL_DOWN: 'bg-gray-100 text-gray-500',
}

const ATTENDANCE_BADGE: Record<string, string> = {
  PRESENT: 'bg-green-100 text-green-700',
  ABSENT: 'bg-red-100 text-red-700',
  LATE: 'bg-yellow-100 text-yellow-700',
  EXCUSED: 'bg-gray-100 text-gray-500',
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CoachSessionDetailPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()

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
        setError(err instanceof Error ? err.message : 'Failed to load session.')
        setLoading(false)
      })
  }, [sessionId])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppNav label="Training Session" />
        <div className="flex min-h-[60vh] items-center justify-center">
          <LoadingSpinner />
        </div>
      </div>
    )
  }

  if (error || !session) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppNav label="Training Session" />
        <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
          <EmptyState icon="⚠️" title="Could not load session" description={error ?? 'Session not found.'} />
        </main>
      </div>
    )
  }

  const attendanceCounts = attendance.reduce(
    (acc, a) => ({ ...acc, [a.status]: (acc[a.status] ?? 0) + 1 }),
    {} as Record<string, number>,
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <AppNav label="Training Session" />

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        {/* Back */}
        <button
          onClick={() => navigate('/coach/sessions')}
          className="mb-6 text-sm text-brand-600 hover:text-brand-700"
        >
          ← All sessions
        </button>

        {/* Header */}
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
          <h1 className="text-2xl font-bold text-gray-900">{session.title}</h1>
          <p className="mt-1 text-sm text-gray-400">{formatDate(session.training_date)}</p>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {session.academy_name && (
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide">Academy</p>
                <p className="mt-0.5 text-sm font-medium text-gray-700">{session.academy_name}</p>
              </div>
            )}
            {session.team_name && (
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide">Team</p>
                <p className="mt-0.5 text-sm font-medium text-gray-700">{session.team_name}</p>
              </div>
            )}
            {session.location && (
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide">Location</p>
                <p className="mt-0.5 text-sm font-medium text-gray-700">{session.location}</p>
              </div>
            )}
            {session.start_time && (
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide">Start time</p>
                <p className="mt-0.5 text-sm font-medium text-gray-700">{session.start_time}</p>
              </div>
            )}
            {session.duration_minutes && (
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide">Duration</p>
                <p className="mt-0.5 text-sm font-medium text-gray-700">{session.duration_minutes} min</p>
              </div>
            )}
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide">Coach</p>
              <p className="mt-0.5 text-sm font-medium text-gray-700">{session.coach_name}</p>
            </div>
          </div>

          {session.description && (
            <p className="mt-4 text-sm text-gray-500">{session.description}</p>
          )}

          {session.focus_skills.length > 0 && (
            <div className="mt-4">
              <p className="mb-1.5 text-xs font-medium text-gray-400 uppercase tracking-wide">Focus skills</p>
              <div className="flex flex-wrap gap-1.5">
                {session.focus_skills.map((s) => (
                  <span
                    key={s.id}
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${SKILL_CATEGORY_COLOR[s.category] ?? 'bg-gray-100 text-gray-600'}`}
                  >
                    {s.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Exercises */}
        <section className="mt-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">
            Exercises ({session.session_exercises.length})
          </h2>
          {session.session_exercises.length === 0 ? (
            <p className="text-sm text-gray-400">No exercises added to this session.</p>
          ) : (
            <div className="space-y-2">
              {session.session_exercises
                .slice()
                .sort((a, b) => a.order - b.order)
                .map((ex, idx) => (
                  <div
                    key={ex.id}
                    className="flex items-start gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-100"
                  >
                    <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-gray-100 text-xs font-bold text-gray-500">
                      {idx + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-gray-900 text-sm">{ex.exercise_name}</p>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${EXERCISE_CATEGORY_BADGE[ex.exercise_category] ?? 'bg-gray-100 text-gray-600'}`}>
                          {ex.exercise_category}
                        </span>
                        {ex.duration_minutes && (
                          <span className="text-xs text-gray-400">{ex.duration_minutes} min</span>
                        )}
                      </div>
                      {ex.notes && <p className="mt-0.5 text-xs text-gray-400">{ex.notes}</p>}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </section>

        {/* Attendance */}
        <section className="mt-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">
              Attendance ({attendance.length})
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              {attendance.length > 0 && (
                <div className="flex gap-2">
                  {(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'] as const).map((s) =>
                    attendanceCounts[s] ? (
                      <span key={s} className={`rounded-full px-2 py-0.5 text-xs font-medium ${ATTENDANCE_BADGE[s]}`}>
                        {attendanceCounts[s]} {s.toLowerCase()}
                      </span>
                    ) : null
                  )}
                </div>
              )}
              <button
                onClick={() => navigate(`/coach/sessions/${session.id}/add-attendance`)}
                className="rounded-xl bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-700"
              >
                + Add Attendance
              </button>
            </div>
          </div>

          {attendance.length === 0 ? (
            <p className="text-sm text-gray-400">No attendance recorded for this session.</p>
          ) : (
            <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-100">
              <table className="min-w-full divide-y divide-gray-100">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="py-3 pl-4 pr-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">Player</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">ID</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">Status</th>
                    <th className="pl-3 pr-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {attendance.map((a) => (
                    <tr key={a.id} className="hover:bg-gray-50/50">
                      <td className="py-3 pl-4 pr-3 text-sm font-medium text-gray-900">{a.player_name}</td>
                      <td className="px-3 py-3 font-mono text-xs text-brand-500">{a.football_id}</td>
                      <td className="px-3 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ATTENDANCE_BADGE[a.status] ?? 'bg-gray-100 text-gray-600'}`}>
                          {a.status}
                        </span>
                      </td>
                      <td className="pl-3 pr-4 py-3 text-xs text-gray-400">{a.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
