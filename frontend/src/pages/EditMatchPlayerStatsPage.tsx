import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import LoadingSpinner from '../components/ui/LoadingSpinner'
import { ApiError } from '../services/api'
import { matchService } from '../services/matchService'
import type { Match, MatchStats } from '../types'
import { toDisplayLocale } from '../utils/localeDateFormatter'

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

function parseDrfError(err: unknown, fallback: string): string {
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
  return fallback
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

function statsToForm(s: MatchStats): FormState {
  return {
    started: s.started,
    minutes_played: s.minutes_played,
    goals: s.goals,
    assists: s.assists,
    shots: s.shots,
    shots_on_target: s.shots_on_target,
    passes_attempted: s.passes_attempted,
    passes_completed: s.passes_completed,
    key_passes: s.key_passes,
    dribbles: s.dribbles,
    tackles: s.tackles,
    interceptions: s.interceptions,
    yellow_cards: s.yellow_cards,
    red_cards: s.red_cards,
    rating: s.rating !== null ? String(parseFloat(s.rating)) : '',
    coach_comment: s.coach_comment,
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function EditMatchPlayerStatsPage() {
  const { matchId, statsId } = useParams<{ matchId: string; statsId: string }>()
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const displayLocale = toDisplayLocale(i18n.language)

  const [match, setMatch] = useState<Match | null>(null)
  const [stats, setStats] = useState<MatchStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [form, setForm] = useState<FormState | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    if (!matchId || !statsId) return
    Promise.all([
      matchService.getMatch(matchId),
      matchService.getPlayerStats(matchId, statsId),
    ])
      .then(([m, s]) => {
        setMatch(m)
        setStats(s)
        setForm(statsToForm(s))
        setLoading(false)
      })
      .catch((err: unknown) => {
        setLoadError(err instanceof Error ? err.message : t('matchStats.error.statsFailed'))
        setLoading(false)
      })
  }, [matchId, statsId, t])

  function setNum(field: keyof FormState, value: number) {
    setForm((prev) => prev ? { ...prev, [field]: value } : prev)
    setSubmitError(null)
  }

  function setStr(field: keyof FormState, value: string) {
    setForm((prev) => prev ? { ...prev, [field]: value } : prev)
    setSubmitError(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form || !matchId || !statsId) return
    setSubmitting(true)
    setSubmitError(null)

    if (form.shots_on_target > form.shots) {
      setSubmitError(t('matchStats.errorShotsOnTarget'))
      setSubmitting(false)
      return
    }
    if (form.passes_completed > form.passes_attempted) {
      setSubmitError(t('matchStats.errorPassCompleted'))
      setSubmitting(false)
      return
    }

    const ratingVal = form.rating.trim()
    if (ratingVal !== '') {
      const r = parseFloat(ratingVal)
      if (isNaN(r) || r < 0 || r > 10) {
        setSubmitError(t('matchStats.errorRating'))
        setSubmitting(false)
        return
      }
    }

    try {
      await matchService.updatePlayerStats(matchId, statsId, {
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
      navigate(`/coach/matches/${matchId}`)
    } catch (err) {
      setSubmitError(parseDrfError(err, t('common.error.generic')))
      setSubmitting(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Loading / error states
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <LoadingSpinner />
      </div>
    )
  }

  if (loadError || !match || !stats || !form) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          {loadError ?? t('matchStats.error.statsNotFound')}
        </div>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Form
  // ---------------------------------------------------------------------------

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 lg:px-8">
        <button
          onClick={() => navigate(`/coach/matches/${matchId}`)}
          className="mb-2 text-sm text-brand-600 hover:text-brand-700"
        >
          {t('matchStats.backToMatch')}
        </button>
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">{t('matchStats.editTitle')}</h1>
          <p className="mt-1 text-sm text-gray-400">
            {t('matchStats.vsDate', {
              opponent: match.opponent_name,
              date: new Date(match.match_date).toLocaleDateString(displayLocale, { day: 'numeric', month: 'short', year: 'numeric' }),
            })}
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="space-y-6">

            {/* ── Player (read-only) + participation ── */}
            <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
              <h2 className="mb-5 text-sm font-semibold uppercase tracking-widest text-gray-400">
                {t('matchStats.sectionPlayer')}
              </h2>

              <div className="space-y-5">
                {/* Player display — not editable */}
                <div>
                  <p className="block text-sm font-medium text-gray-700 mb-1">{t('matchStats.sectionPlayer')}</p>
                  <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                    <span className="text-sm font-medium text-gray-900">{stats.player_name}</span>
                    <span className="ml-2 font-mono text-xs text-brand-500">{stats.football_id}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Started toggle */}
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-1">{t('matchStats.started')}</p>
                    <button
                      type="button"
                      onClick={() => setForm((prev) => prev ? { ...prev, started: !prev.started } : prev)}
                      className={`w-full rounded-xl border py-2.5 text-sm font-medium transition ${
                        form.started
                          ? 'border-brand-400 bg-brand-50 text-brand-700'
                          : 'border-gray-200 bg-white text-gray-400 hover:border-gray-300'
                      }`}
                    >
                      {form.started ? t('matchStats.starterYes') : t('matchStats.starterNo')}
                    </button>
                  </div>

                  <Counter
                    id="minutes_played"
                    label={t('matchStats.minutesPlayed')}
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
                {t('matchStats.sectionAttacking')}
              </h2>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Counter id="goals"           label={t('matchStats.goals')}     value={form.goals}           onChange={(v) => setNum('goals', v)} />
                <Counter id="assists"         label={t('matchStats.assists')}   value={form.assists}         onChange={(v) => setNum('assists', v)} />
                <Counter id="shots"           label={t('matchStats.shots')}     value={form.shots}           onChange={(v) => setNum('shots', v)} />
                <Counter id="shots_on_target" label={t('matchStats.onTarget')}  value={form.shots_on_target} onChange={(v) => setNum('shots_on_target', v)} />
              </div>
            </section>

            {/* ── Passing ── */}
            <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
              <h2 className="mb-5 text-sm font-semibold uppercase tracking-widest text-gray-400">
                {t('matchStats.sectionPassing')}
              </h2>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <Counter id="passes_attempted" label={t('matchStats.attempted')}  value={form.passes_attempted}  onChange={(v) => setNum('passes_attempted', v)} />
                <Counter id="passes_completed" label={t('matchStats.completed')}  value={form.passes_completed}  onChange={(v) => setNum('passes_completed', v)} />
                <Counter id="key_passes"       label={t('matchStats.keyPasses')}  value={form.key_passes}        onChange={(v) => setNum('key_passes', v)} />
              </div>
            </section>

            {/* ── Defensive ── */}
            <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
              <h2 className="mb-5 text-sm font-semibold uppercase tracking-widest text-gray-400">
                {t('matchStats.sectionDefensive')}
              </h2>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <Counter id="dribbles"      label={t('matchStats.dribbles')}      value={form.dribbles}      onChange={(v) => setNum('dribbles', v)} />
                <Counter id="tackles"       label={t('matchStats.tackles')}       value={form.tackles}       onChange={(v) => setNum('tackles', v)} />
                <Counter id="interceptions" label={t('matchStats.interceptions')} value={form.interceptions} onChange={(v) => setNum('interceptions', v)} />
              </div>
            </section>

            {/* ── Discipline ── */}
            <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
              <h2 className="mb-5 text-sm font-semibold uppercase tracking-widest text-gray-400">
                {t('matchStats.sectionDiscipline')}
              </h2>
              <div className="grid grid-cols-2 gap-4">
                <Counter id="yellow_cards" label={t('matchStats.yellowCards')} value={form.yellow_cards} onChange={(v) => setNum('yellow_cards', v)} max={2} />
                <Counter id="red_cards"    label={t('matchStats.redCards')}    value={form.red_cards}    onChange={(v) => setNum('red_cards', v)}    max={1} />
              </div>
            </section>

            {/* ── Coach evaluation ── */}
            <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
              <h2 className="mb-5 text-sm font-semibold uppercase tracking-widest text-gray-400">
                {t('matchStats.sectionCoachEval')}
              </h2>
              <div className="space-y-4">
                <div>
                  <label htmlFor="rating" className="block text-sm font-medium text-gray-700">
                    {t('matchStats.rating')}
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
                    placeholder={t('matchStats.ratingPlaceholder')}
                  />
                </div>
                <div>
                  <label htmlFor="coach_comment" className="block text-sm font-medium text-gray-700">
                    {t('matchStats.comment')}
                  </label>
                  <textarea
                    id="coach_comment"
                    rows={3}
                    value={form.coach_comment}
                    onChange={(e) => setStr('coach_comment', e.target.value)}
                    className={`${inputCls} resize-none`}
                    placeholder={t('matchStats.commentPlaceholder')}
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
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => navigate(`/coach/matches/${matchId}`)}
                className="rounded-xl px-5 py-2 text-sm font-medium text-gray-500 transition hover:text-gray-800"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-xl bg-brand-600 px-6 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
              >
                {submitting ? t('matchStats.saving') : t('matchStats.saveChanges')}
              </button>
            </div>

          </div>
        </form>
    </div>
  )
}
