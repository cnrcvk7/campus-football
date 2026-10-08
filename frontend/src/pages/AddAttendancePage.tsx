import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import AppNav from '../components/ui/AppNav'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import { ApiError } from '../services/api'
import { playerService } from '../services/playerService'
import { teamService } from '../services/teamService'
import { trainingService } from '../services/trainingService'
import type { AttendanceStatus, Player, TrainingAttendance, TrainingSession } from '../types'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_OPTIONS: { value: AttendanceStatus; label: string; style: string }[] = [
  { value: 'PRESENT', label: 'Present',  style: 'border-green-300 bg-green-50 text-green-700' },
  { value: 'ABSENT',  label: 'Absent',   style: 'border-red-300 bg-red-50 text-red-700' },
  { value: 'LATE',    label: 'Late',     style: 'border-yellow-300 bg-yellow-50 text-yellow-700' },
  { value: 'EXCUSED', label: 'Excused',  style: 'border-gray-300 bg-gray-50 text-gray-500' },
]

const INACTIVE_STYLE = 'border-gray-200 bg-white text-gray-400 hover:border-gray-300'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const inputCls =
  'mt-1 block w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20'

function parseDrfError(err: unknown): string {
  if (err instanceof ApiError) {
    try {
      const body = JSON.parse(err.message)
      return Object.entries(body)
        .map(([field, msgs]) =>
          field === 'non_field_errors' || field === 'detail'
            ? String(Array.isArray(msgs) ? msgs[0] : msgs)
            : `${field}: ${Array.isArray(msgs) ? msgs[0] : msgs}`
        )
        .join(' · ')
    } catch {
      return err.message
    }
  }
  return 'Unexpected error — please try again.'
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AddAttendancePage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()

  const [session, setSession] = useState<TrainingSession | null>(null)
  const [availablePlayers, setAvailablePlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Form state
  const [player, setPlayer] = useState('')
  const [status, setStatus] = useState<AttendanceStatus>('PRESENT')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [addAnother, setAddAnother] = useState(false)

  useEffect(() => {
    if (!sessionId) return
    Promise.all([
      trainingService.getSession(sessionId),
      trainingService.listAttendance(sessionId),
    ])
      .then(([s, existing]: [TrainingSession, TrainingAttendance[]]) => {
        setSession(s)
        const alreadyRecorded = new Set(existing.map((a) => a.player))

        // Use team roster if session has a team, else fall back to all players
        const playersFetch: Promise<Player[]> = s.team
          ? teamService.listPlayers(s.team)
          : playerService
              .list({ page: 1 })
              .then((r) => r.results)

        return playersFetch.then((players) => {
          setAvailablePlayers(players.filter((p) => !alreadyRecorded.has(p.id)))
          setLoading(false)
        })
      })
      .catch((err: unknown) => {
        setLoadError(err instanceof Error ? err.message : 'Failed to load data.')
        setLoading(false)
      })
  }, [sessionId])

  function resetForm() {
    setPlayer('')
    setStatus('PRESENT')
    setNotes('')
    setSubmitError(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!sessionId || !player) return
    setSubmitting(true)
    setSubmitError(null)

    try {
      await trainingService.addAttendance(sessionId, { player, status, notes: notes.trim() })

      if (addAnother) {
        setAvailablePlayers((prev) => prev.filter((p) => p.id !== player))
        resetForm()
        setSubmitting(false)
        setAddAnother(false)
      } else {
        navigate(`/coach/sessions/${sessionId}`)
      }
    } catch (err) {
      setSubmitError(parseDrfError(err))
      setSubmitting(false)
      setAddAnother(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Loading / error / empty states
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppNav label="Add Attendance" />
        <div className="flex min-h-[60vh] items-center justify-center">
          <LoadingSpinner />
        </div>
      </div>
    )
  }

  if (loadError || !session) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppNav label="Add Attendance" />
        <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
          <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
            {loadError ?? 'Session not found.'}
          </div>
        </main>
      </div>
    )
  }

  if (availablePlayers.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppNav label="Add Attendance" />
        <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
          <button
            onClick={() => navigate(`/coach/sessions/${sessionId}`)}
            className="mb-6 text-sm text-brand-600 hover:text-brand-700"
          >
            ← Back to session
          </button>
          <div className="rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-gray-100">
            <p className="text-3xl">✓</p>
            <p className="mt-3 font-semibold text-gray-900">All players recorded</p>
            <p className="mt-1 text-sm text-gray-400">
              Attendance has been recorded for every
              {session.team_name ? ` player on ${session.team_name}` : ' available player'}.
            </p>
            <button
              onClick={() => navigate(`/coach/sessions/${sessionId}`)}
              className="mt-5 rounded-xl bg-brand-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
            >
              Back to session
            </button>
          </div>
        </main>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Form
  // ---------------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-gray-50">
      <AppNav label="Add Attendance" />

      <main className="mx-auto max-w-xl px-4 py-10 sm:px-6 lg:px-8">
        <button
          onClick={() => navigate(`/coach/sessions/${sessionId}`)}
          className="mb-2 text-sm text-brand-600 hover:text-brand-700"
        >
          ← Back to session
        </button>
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Add Attendance</h1>
          <p className="mt-1 text-sm text-gray-400">
            {session.title} ·{' '}
            {new Date(session.training_date).toLocaleDateString('en-GB', {
              day: 'numeric', month: 'short', year: 'numeric',
            })}
          </p>
          {!session.team && (
            <p className="mt-1 text-xs text-yellow-600">
              This session has no team — showing up to the first 20 registered players.
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="space-y-5">

            {/* ── Player ── */}
            <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
              <div className="space-y-5">
                <div>
                  <label htmlFor="player" className="block text-sm font-medium text-gray-700">
                    Player <span className="text-red-500">*</span>
                    <span className="ml-2 text-xs font-normal text-gray-400">
                      ({availablePlayers.length} remaining)
                    </span>
                  </label>
                  <select
                    id="player"
                    required
                    value={player}
                    onChange={(e) => { setPlayer(e.target.value); setSubmitError(null) }}
                    className={`${inputCls} bg-white`}
                  >
                    <option value="">Select player…</option>
                    {availablePlayers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.first_name} {p.last_name}
                        {p.jersey_number !== null ? ` (#${p.jersey_number})` : ''}
                        {' · '}{p.football_id}
                      </option>
                    ))}
                  </select>
                </div>

                {/* ── Status ── */}
                <div>
                  <p className="block text-sm font-medium text-gray-700 mb-2">
                    Status <span className="text-red-500">*</span>
                  </p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {STATUS_OPTIONS.map((opt) => (
                      <label
                        key={opt.value}
                        className={`flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border py-2.5 text-sm font-medium transition ${
                          status === opt.value ? opt.style : INACTIVE_STYLE
                        }`}
                      >
                        <input
                          type="radio"
                          name="status"
                          value={opt.value}
                          checked={status === opt.value}
                          onChange={() => setStatus(opt.value)}
                          className="sr-only"
                        />
                        {opt.label}
                      </label>
                    ))}
                  </div>
                </div>

                {/* ── Notes ── */}
                <div>
                  <label htmlFor="notes" className="block text-sm font-medium text-gray-700">
                    Notes <span className="text-xs font-normal text-gray-400">(optional)</span>
                  </label>
                  <textarea
                    id="notes"
                    rows={2}
                    value={notes}
                    onChange={(e) => { setNotes(e.target.value); setSubmitError(null) }}
                    className={`${inputCls} resize-none`}
                    placeholder="e.g. Left early due to injury"
                  />
                </div>
              </div>
            </section>

            {/* ── Error ── */}
            {submitError && (
              <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
                {submitError}
              </div>
            )}

            {/* ── Actions ── */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => navigate(`/coach/sessions/${sessionId}`)}
                className="rounded-xl px-5 py-2 text-sm font-medium text-gray-500 transition hover:text-gray-800"
              >
                Cancel
              </button>
              <div className="flex flex-wrap gap-3">
                {availablePlayers.length > 1 && (
                  <button
                    type="submit"
                    disabled={submitting || !player}
                    onClick={() => setAddAnother(true)}
                    className="rounded-xl border border-brand-300 bg-white px-5 py-2 text-sm font-semibold text-brand-600 transition hover:bg-brand-50 disabled:opacity-60"
                  >
                    {submitting && addAnother ? 'Saving…' : 'Save & Add Another'}
                  </button>
                )}
                <button
                  type="submit"
                  disabled={submitting || !player}
                  onClick={() => setAddAnother(false)}
                  className="rounded-xl bg-brand-600 px-6 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
                >
                  {submitting && !addAnother ? 'Saving…' : 'Save Attendance'}
                </button>
              </div>
            </div>

          </div>
        </form>
      </main>
    </div>
  )
}
