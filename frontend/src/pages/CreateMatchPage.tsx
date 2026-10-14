import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import AppNav from '../components/ui/AppNav'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import { ApiError } from '../services/api'
import { academyService } from '../services/academyService'
import { matchService } from '../services/matchService'
import { teamService } from '../services/teamService'
import type { Academy, Team } from '../types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function FieldLabel({ htmlFor, children, required }: { htmlFor: string; children: string; required?: boolean }) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-medium text-gray-700">
      {children}{required && <span className="ml-0.5 text-red-500">*</span>}
    </label>
  )
}

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
// Form state
// ---------------------------------------------------------------------------

interface FormState {
  academy: string
  team: string
  opponent_name: string
  match_date: string
  home_away: 'HOME' | 'AWAY' | ''
  venue: string
  competition: string
  team_score: string
  opponent_score: string
  notes: string
}

const EMPTY: FormState = {
  academy: '',
  team: '',
  opponent_name: '',
  match_date: '',
  home_away: '',
  venue: '',
  competition: '',
  team_score: '',
  opponent_score: '',
  notes: '',
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CreateMatchPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()

  const [academies, setAcademies] = useState<Academy[]>([])
  const [allTeams, setAllTeams] = useState<Team[]>([])
  const [refLoading, setRefLoading] = useState(true)
  const [refError, setRefError] = useState<string | null>(null)

  const [form, setForm] = useState<FormState>(EMPTY)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const teamsForAcademy = form.academy
    ? allTeams.filter((tm) => tm.academy === form.academy)
    : []

  useEffect(() => {
    Promise.all([academyService.list(), teamService.list()])
      .then(([acs, tms]) => {
        setAcademies(acs.results)
        setAllTeams(tms.results)
        setRefLoading(false)
      })
      .catch((err: unknown) => {
        setRefError(err instanceof Error ? err.message : t('matches.error.formLoadFailed'))
        setRefLoading(false)
      })
  }, [t])

  function set(field: keyof FormState, value: string) {
    setForm((prev) => {
      const next = { ...prev, [field]: value }
      if (field === 'academy') next.team = ''
      return next
    })
    setSubmitError(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setSubmitError(null)

    const teamScoreRaw = form.team_score.trim()
    const oppScoreRaw = form.opponent_score.trim()

    try {
      const match = await matchService.createMatch({
        academy: form.academy,
        team: form.team,
        opponent_name: form.opponent_name.trim(),
        match_date: form.match_date,
        home_away: form.home_away as 'HOME' | 'AWAY',
        venue: form.venue.trim() || undefined,
        competition: form.competition.trim() || undefined,
        team_score: teamScoreRaw !== '' ? parseInt(teamScoreRaw, 10) : null,
        opponent_score: oppScoreRaw !== '' ? parseInt(oppScoreRaw, 10) : null,
        notes: form.notes.trim() || undefined,
      })
      navigate(`/coach/matches/${match.id}`)
    } catch (err) {
      setSubmitError(parseDrfError(err, t('common.error.generic')))
      setSubmitting(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (refLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppNav label={t('matches.newNavLabel')} />
        <div className="flex min-h-[60vh] items-center justify-center">
          <LoadingSpinner />
        </div>
      </div>
    )
  }

  if (refError) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppNav label={t('matches.newNavLabel')} />
        <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
          <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
            {refError}
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AppNav label={t('matches.newNavLabel')} />

      <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">{t('matches.newNavLabel')}</h1>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="space-y-6">

            {/* ── Match details ── */}
            <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
              <h2 className="mb-5 text-sm font-semibold uppercase tracking-widest text-gray-400">
                {t('matches.sectionDetails')}
              </h2>
              <div className="space-y-5">
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <div>
                    <FieldLabel htmlFor="opponent_name" required>{t('matches.opponent')}</FieldLabel>
                    <input
                      id="opponent_name"
                      type="text"
                      required
                      value={form.opponent_name}
                      onChange={(e) => set('opponent_name', e.target.value)}
                      className={inputCls}
                      placeholder={t('matches.opponentPlaceholder')}
                    />
                  </div>
                  <div>
                    <FieldLabel htmlFor="match_date" required>{t('matches.date')}</FieldLabel>
                    <input
                      id="match_date"
                      type="date"
                      required
                      value={form.match_date}
                      onChange={(e) => set('match_date', e.target.value)}
                      className={inputCls}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <div>
                    <FieldLabel htmlFor="academy" required>{t('matches.academy')}</FieldLabel>
                    <select
                      id="academy"
                      required
                      value={form.academy}
                      onChange={(e) => set('academy', e.target.value)}
                      className={`${inputCls} bg-white`}
                    >
                      <option value="">{t('matches.selectAcademy')}</option>
                      {academies.map((a) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <FieldLabel htmlFor="team" required>{t('matches.team')}</FieldLabel>
                    <select
                      id="team"
                      required
                      value={form.team}
                      onChange={(e) => set('team', e.target.value)}
                      disabled={!form.academy || teamsForAcademy.length === 0}
                      className={`${inputCls} bg-white disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400`}
                    >
                      <option value="">
                        {!form.academy
                          ? t('matches.selectAcademyFirst')
                          : teamsForAcademy.length === 0
                          ? t('matches.noTeamsInAcademy')
                          : t('matches.selectTeam')}
                      </option>
                      {teamsForAcademy.map((tm) => (
                        <option key={tm.id} value={tm.id}>
                          {tm.name}
                          {tm.age_group && ` · ${tm.age_group}`}
                          {tm.season && ` (${tm.season})`}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <FieldLabel htmlFor="home_away" required>{t('matches.homeAwayLabel')}</FieldLabel>
                  <div className="mt-1 flex gap-3">
                    {(['HOME', 'AWAY'] as const).map((val) => (
                      <label
                        key={val}
                        className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-medium transition ${
                          form.home_away === val
                            ? 'border-brand-400 bg-brand-50 text-brand-700'
                            : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                        }`}
                      >
                        <input
                          type="radio"
                          name="home_away"
                          value={val}
                          checked={form.home_away === val}
                          onChange={(e) => set('home_away', e.target.value)}
                          className="sr-only"
                        />
                        {val === 'HOME' ? t('matches.homeOption') : t('matches.awayOption')}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            {/* ── Venue & competition ── */}
            <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
              <h2 className="mb-5 text-sm font-semibold uppercase tracking-widest text-gray-400">
                {t('matches.sectionVenue')}
              </h2>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div>
                  <FieldLabel htmlFor="venue">{t('matches.venue')}</FieldLabel>
                  <input
                    id="venue"
                    type="text"
                    value={form.venue}
                    onChange={(e) => set('venue', e.target.value)}
                    className={inputCls}
                    placeholder={t('matches.venuePlaceholder')}
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="competition">{t('matches.competition')}</FieldLabel>
                  <input
                    id="competition"
                    type="text"
                    value={form.competition}
                    onChange={(e) => set('competition', e.target.value)}
                    className={inputCls}
                    placeholder={t('matches.competitionPlaceholder')}
                  />
                </div>
              </div>
            </section>

            {/* ── Score ── */}
            <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
              <h2 className="mb-1 text-sm font-semibold uppercase tracking-widest text-gray-400">
                {t('matches.sectionScore')}
              </h2>
              <p className="mb-5 text-xs text-gray-400">{t('matches.scoreLater')}</p>
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <FieldLabel htmlFor="team_score">{t('matches.ourScore')}</FieldLabel>
                  <input
                    id="team_score"
                    type="number"
                    min={0}
                    max={99}
                    value={form.team_score}
                    onChange={(e) => set('team_score', e.target.value)}
                    className={`${inputCls} text-center text-lg font-bold`}
                    placeholder="—"
                  />
                </div>
                <span className="mt-6 flex-shrink-0 text-2xl font-black text-gray-300">–</span>
                <div className="flex-1">
                  <FieldLabel htmlFor="opponent_score">{t('matches.opponentScore')}</FieldLabel>
                  <input
                    id="opponent_score"
                    type="number"
                    min={0}
                    max={99}
                    value={form.opponent_score}
                    onChange={(e) => set('opponent_score', e.target.value)}
                    className={`${inputCls} text-center text-lg font-bold`}
                    placeholder="—"
                  />
                </div>
              </div>
            </section>

            {/* ── Notes ── */}
            <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
              <h2 className="mb-5 text-sm font-semibold uppercase tracking-widest text-gray-400">
                {t('matches.sectionNotes')}
              </h2>
              <FieldLabel htmlFor="notes">{t('matches.matchNotes')}</FieldLabel>
              <textarea
                id="notes"
                rows={3}
                value={form.notes}
                onChange={(e) => set('notes', e.target.value)}
                className={`${inputCls} resize-none`}
                placeholder={t('matches.matchNotesPlaceholder')}
              />
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
                onClick={() => navigate('/coach/matches')}
                className="rounded-xl px-5 py-2 text-sm font-medium text-gray-500 transition hover:text-gray-800"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-xl bg-brand-600 px-6 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
              >
                {submitting ? t('matches.creating') : t('matches.createButton')}
              </button>
            </div>

          </div>
        </form>
      </main>
    </div>
  )
}
