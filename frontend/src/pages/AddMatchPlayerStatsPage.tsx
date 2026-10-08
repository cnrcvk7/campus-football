import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import AppNav from '../components/ui/AppNav'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import { ApiError } from '../services/api'
import { matchService } from '../services/matchService'
import { teamService } from '../services/teamService'
import type { Match, MatchStats, Player } from '../types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function FieldLabel({ htmlFor, children }: { htmlFor: string; children: string }) {
  return (
    <label htmlFor={htmlFor} className="block text-xs font-medium text-gray-500 mb-1">
      {children}
    </label>
  )
}

const numInputCls =
  'block w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-center font-semibold text-gray-900 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20'

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
// Counter input — +/- buttons for counting stats
// ---------------------------------------------------------------------------

function Counter({
  id,
  label,
  value,
  onChange,
  max = 99,
}: {
  id: string
  label: string
  value: number
  onChange: (v: number) => void
  max?: number
}) {
  return (
    <div>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onChange(Math.max(0, value - 1))}
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-gray-200 text-gray-500 transition hover:bg-gray-50 active:bg-gray-100"
        >
          −
        </button>
        <input
          id={id}
          type="number"
          min={0}
          max={max}
          value={value}
          onChange={(e) => onChange(Math.min(max, Math.max(0, parseInt(e.target.value, 10) || 0)))}
          className={numInputCls}
        />
        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + 1))}
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-gray-200 text-gray-500 transition hover:bg-gray-50 active:bg-gray-100"
        >
          +
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Form state
// ---------------------------------------------------------------------------

interface FormState {
  player: string
  started: boolean
  minutes_played: number
  goals: number
  assists: number
  shots: number
  shots_on_target: number
  passes_attempted: number
  passes_completed: number
  key_passes: number
  dribbles: number
  tackles: number
  interceptions: number
  yellow_cards: number
  red_cards: number
  rating: string
  coach_comment: string
}

const EMPTY: FormState = {
  player: '',
  started: false,
  minutes_played: 0,
  goals: 0,
  assists: 0,
  shots: 0,
  shots_on_target: 0,
  passes_attempted: 0,
  passes_completed: 0,
  key_passes: 0,
  dribbles: 0,
  tackles: 0,
  interceptions: 0,
  yellow_cards: 0,
  red_cards: 0,
  rating: '',
  coach_comment: '',
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AddMatchPlayerStatsPage() {
  const { matchId } = useParams<{ matchId: string }>()
  const navigate = useNavigate()

  const [match, setMatch] = useState<Match | null>(null)
  const [availablePlayers, setAvailablePlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [form, setForm] = useState<FormState>(EMPTY)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [addAnother, setAddAnother] = useState(false)

  useEffect(() => {
    if (!matchId) return
    // Fetch match + existing stats in parallel, then load team players
    Promise.all([
      matchService.getMatch(matchId),
      matchService.listPlayerStats(matchId),
    ])
      .then(([m, existingStats]: [Match, MatchStats[]]) => {
        setMatch(m)
        const alreadyAdded = new Set(existingStats.map((s) => s.player))
        return teamService.listPlayers(m.team).then((players: Player[]) => {
          setAvailablePlayers(players.filter((p) => !alreadyAdded.has(p.id)))
          setLoading(false)
        })
      })
      .catch((err: unknown) => {
        setLoadError(err instanceof Error ? err.message : 'Failed to load data.')
        setLoading(false)
      })
  }, [matchId])

  function setNum(field: keyof FormState, value: number) {
    setForm((prev) => ({ ...prev, [field]: value }))
    setSubmitError(null)
  }

  function setStr(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
    setSubmitError(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!matchId) return
    setSubmitting(true)
    setSubmitError(null)

    // Validate shots_on_target <= shots
    if (form.shots_on_target > form.shots) {
      setSubmitError('Shots on target cannot exceed total shots.')
      setSubmitting(false)
      return
    }
    // Validate passes_completed <= passes_attempted
    if (form.passes_completed > form.passes_attempted) {
      setSubmitError('Passes completed cannot exceed passes attempted.')
      setSubmitting(false)
      return
    }

    const ratingVal = form.rating.trim()
    if (ratingVal !== '') {
      const r = parseFloat(ratingVal)
      if (isNaN(r) || r < 0 || r > 10) {
        setSubmitError('Rating must be a number between 0 and 10.')
        setSubmitting(false)
        return
      }
    }

    try {
      await matchService.addPlayerStats(matchId, {
        player: form.player,
        started: form.started,
        minutes_played: form.minutes_played,
        goals: form.goals,
        assists: form.assists,
        shots: form.shots,
        shots_on_target: form.shots_on_target,
        passes_attempted: form.passes_attempted,
        passes_completed: form.passes_completed,
        key_passes: form.key_passes,
        dribbles: form.dribbles,
        tackles: form.tackles,
        interceptions: form.interceptions,
        yellow_cards: form.yellow_cards,
        red_cards: form.red_cards,
        rating: ratingVal !== '' ? parseFloat(ratingVal).toFixed(2) : null,
        coach_comment: form.coach_comment.trim(),
      })

      if (addAnother) {
        // Remove saved player from the available list and reset the form
        setAvailablePlayers((prev) => prev.filter((p) => p.id !== form.player))
        setForm(EMPTY)
        setSubmitting(false)
        setAddAnother(false)
      } else {
        navigate(`/coach/matches/${matchId}`)
      }
    } catch (err) {
      setSubmitError(parseDrfError(err))
      setSubmitting(false)
      setAddAnother(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Loading / error states
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppNav label="Add Player Stats" />
        <div className="flex min-h-[60vh] items-center justify-center">
          <LoadingSpinner />
        </div>
      </div>
    )
  }

  if (loadError || !match) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppNav label="Add Player Stats" />
        <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
          <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
            {loadError ?? 'Match not found.'}
          </div>
        </main>
      </div>
    )
  }

  if (availablePlayers.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppNav label="Add Player Stats" />
        <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
          <button
            onClick={() => navigate(`/coach/matches/${matchId}`)}
            className="mb-6 text-sm text-brand-600 hover:text-brand-700"
          >
            ← Back to match
          </button>
          <div className="rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-gray-100">
            <p className="text-3xl">✓</p>
            <p className="mt-3 font-semibold text-gray-900">All players added</p>
            <p className="mt-1 text-sm text-gray-400">
              Stats have been recorded for every active player on {match.team_name}.
            </p>
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
      <AppNav label="Add Player Stats" />

      <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6 lg:px-8">
        {/* Context header */}
        <button
          onClick={() => navigate(`/coach/matches/${matchId}`)}
          className="mb-2 text-sm text-brand-600 hover:text-brand-700"
        >
          ← Back to match
        </button>
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Add Player Stats</h1>
          <p className="mt-1 text-sm text-gray-400">
            vs {match.opponent_name} · {new Date(match.match_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="space-y-6">

            {/* ── Player + participation ── */}
            <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
              <h2 className="mb-5 text-sm font-semibold uppercase tracking-widest text-gray-400">
                Player
              </h2>

              <div className="space-y-5">
                <div>
                  <label htmlFor="player" className="block text-sm font-medium text-gray-700">
                    Player <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="player"
                    required
                    value={form.player}
                    onChange={(e) => setStr('player', e.target.value)}
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

                <div className="grid grid-cols-2 gap-4">
                  {/* Started toggle */}
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-1">Started</p>
                    <button
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, started: !prev.started }))}
                      className={`w-full rounded-xl border py-2.5 text-sm font-medium transition ${
                        form.started
                          ? 'border-brand-400 bg-brand-50 text-brand-700'
                          : 'border-gray-200 bg-white text-gray-400 hover:border-gray-300'
                      }`}
                    >
                      {form.started ? '✓ Starter' : 'Sub / Did not start'}
                    </button>
                  </div>

                  <Counter
                    id="minutes_played"
                    label="Minutes played"
                    value={form.minutes_played}
                    onChange={(v) => setNum('minutes_played', v)}
                    max={120}
                  />
                </div>
              </div>
            </section>

            {/* ── Attacking ── */}
            <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
              <h2 className="mb-5 text-sm font-semibold uppercase tracking-widest text-gray-400">
                Attacking
              </h2>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Counter id="goals"           label="Goals"           value={form.goals}           onChange={(v) => setNum('goals', v)} />
                <Counter id="assists"         label="Assists"         value={form.assists}         onChange={(v) => setNum('assists', v)} />
                <Counter id="shots"           label="Shots"           value={form.shots}           onChange={(v) => setNum('shots', v)} />
                <Counter id="shots_on_target" label="On target"       value={form.shots_on_target} onChange={(v) => setNum('shots_on_target', v)} />
              </div>
            </section>

            {/* ── Passing ── */}
            <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
              <h2 className="mb-5 text-sm font-semibold uppercase tracking-widest text-gray-400">
                Passing
              </h2>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <Counter id="passes_attempted"  label="Attempted"  value={form.passes_attempted}  onChange={(v) => setNum('passes_attempted', v)} />
                <Counter id="passes_completed"  label="Completed"  value={form.passes_completed}  onChange={(v) => setNum('passes_completed', v)} />
                <Counter id="key_passes"        label="Key passes" value={form.key_passes}        onChange={(v) => setNum('key_passes', v)} />
              </div>
            </section>

            {/* ── Defensive ── */}
            <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
              <h2 className="mb-5 text-sm font-semibold uppercase tracking-widest text-gray-400">
                Defensive
              </h2>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <Counter id="dribbles"      label="Dribbles"      value={form.dribbles}      onChange={(v) => setNum('dribbles', v)} />
                <Counter id="tackles"       label="Tackles"       value={form.tackles}       onChange={(v) => setNum('tackles', v)} />
                <Counter id="interceptions" label="Interceptions" value={form.interceptions} onChange={(v) => setNum('interceptions', v)} />
              </div>
            </section>

            {/* ── Discipline ── */}
            <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
              <h2 className="mb-5 text-sm font-semibold uppercase tracking-widest text-gray-400">
                Discipline
              </h2>
              <div className="grid grid-cols-2 gap-4">
                <Counter id="yellow_cards" label="Yellow cards" value={form.yellow_cards} onChange={(v) => setNum('yellow_cards', v)} max={2} />
                <Counter id="red_cards"    label="Red cards"    value={form.red_cards}    onChange={(v) => setNum('red_cards', v)}    max={1} />
              </div>
            </section>

            {/* ── Coach evaluation ── */}
            <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
              <h2 className="mb-5 text-sm font-semibold uppercase tracking-widest text-gray-400">
                Coach Evaluation
              </h2>
              <div className="space-y-4">
                <div>
                  <label htmlFor="rating" className="block text-sm font-medium text-gray-700">
                    Rating <span className="text-gray-400 font-normal">(0–10, optional)</span>
                  </label>
                  <input
                    id="rating"
                    type="number"
                    min={0}
                    max={10}
                    step={0.1}
                    value={form.rating}
                    onChange={(e) => setStr('rating', e.target.value)}
                    className={`${inputCls} max-w-[120px]`}
                    placeholder="e.g. 7.5"
                  />
                </div>
                <div>
                  <label htmlFor="coach_comment" className="block text-sm font-medium text-gray-700">
                    Comment
                  </label>
                  <textarea
                    id="coach_comment"
                    rows={3}
                    value={form.coach_comment}
                    onChange={(e) => setStr('coach_comment', e.target.value)}
                    className={`${inputCls} resize-none`}
                    placeholder="Optional notes on this player's performance…"
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
                onClick={() => navigate(`/coach/matches/${matchId}`)}
                className="rounded-xl px-5 py-2 text-sm font-medium text-gray-500 transition hover:text-gray-800"
              >
                Cancel
              </button>
              <div className="flex flex-wrap gap-3">
                {availablePlayers.length > 1 && (
                  <button
                    type="submit"
                    disabled={submitting || !form.player}
                    onClick={() => setAddAnother(true)}
                    className="rounded-xl border border-brand-300 bg-white px-5 py-2 text-sm font-semibold text-brand-600 transition hover:bg-brand-50 disabled:opacity-60"
                  >
                    {submitting && addAnother ? 'Saving…' : 'Save & Add Another'}
                  </button>
                )}
                <button
                  type="submit"
                  disabled={submitting || !form.player}
                  onClick={() => setAddAnother(false)}
                  className="rounded-xl bg-brand-600 px-6 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
                >
                  {submitting && !addAnother ? 'Saving…' : 'Save Stats'}
                </button>
              </div>
            </div>

          </div>
        </form>
      </main>
    </div>
  )
}
