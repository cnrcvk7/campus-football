import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import AppNav from '../components/ui/AppNav'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import { ApiError } from '../services/api'
import { academyService } from '../services/academyService'
import { developmentService } from '../services/developmentService'
import { teamService } from '../services/teamService'
import { trainingService } from '../services/trainingService'
import type { Academy, Skill, SkillCategory, Team } from '../types'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SKILL_CATEGORY_COLORS: Record<SkillCategory, string> = {
  TECHNICAL: 'text-blue-600',
  TACTICAL: 'text-purple-600',
  PHYSICAL: 'text-orange-600',
  MENTAL: 'text-teal-600',
}

const SKILL_CATEGORIES: SkillCategory[] = ['TECHNICAL', 'TACTICAL', 'PHYSICAL', 'MENTAL']

// ---------------------------------------------------------------------------
// Small reusable UI helpers
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

// ---------------------------------------------------------------------------
// Form state
// ---------------------------------------------------------------------------

interface FormState {
  academy: string
  team: string
  title: string
  description: string
  training_date: string
  start_time: string
  duration_minutes: string
  location: string
}

// ---------------------------------------------------------------------------
// Parse DRF errors
// ---------------------------------------------------------------------------

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
// Page
// ---------------------------------------------------------------------------

export default function EditTrainingSessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()

  // Reference data
  const [academies, setAcademies] = useState<Academy[]>([])
  const [allTeams, setAllTeams] = useState<Team[]>([])
  const [skills, setSkills] = useState<Skill[]>([])
  const [refLoading, setRefLoading] = useState(true)
  const [refError, setRefError] = useState<string | null>(null)

  // Form
  const [form, setForm] = useState<FormState | null>(null)
  const [selectedSkills, setSelectedSkills] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Teams filtered to chosen academy
  const teamsForAcademy = form?.academy
    ? allTeams.filter((tm) => tm.academy === form.academy)
    : []

  useEffect(() => {
    if (!sessionId) return
    Promise.all([
      academyService.list(),
      teamService.list(),
      developmentService.listSkills(),
      trainingService.getSession(sessionId),
    ])
      .then(([acs, tms, sks, session]) => {
        setAcademies(acs.results)
        setAllTeams(tms.results)
        setSkills(sks.results)
        setForm({
          academy: session.academy,
          team: session.team ?? '',
          title: session.title,
          description: session.description ?? '',
          training_date: session.training_date,
          start_time: session.start_time ?? '',
          duration_minutes: session.duration_minutes !== null ? String(session.duration_minutes) : '',
          location: session.location ?? '',
        })
        setSelectedSkills(new Set(session.focus_skills.map((s) => s.id)))
        setRefLoading(false)
      })
      .catch((err: unknown) => {
        setRefError(err instanceof Error ? err.message : t('training.error.sessionDataFailed'))
        setRefLoading(false)
      })
  }, [sessionId, t])

  function set(field: keyof FormState, value: string) {
    setForm((prev) => {
      if (!prev) return prev
      const next = { ...prev, [field]: value }
      if (field === 'academy') next.team = ''
      return next
    })
    setSubmitError(null)
  }

  function toggleSkill(id: string) {
    setSelectedSkills((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form || !sessionId) return
    setSubmitting(true)
    setSubmitError(null)

    try {
      await trainingService.updateSession(sessionId, {
        academy: form.academy,
        team: form.team || null,
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        training_date: form.training_date,
        start_time: form.start_time || null,
        duration_minutes: form.duration_minutes ? parseInt(form.duration_minutes, 10) : null,
        location: form.location.trim() || undefined,
        focus_skills: Array.from(selectedSkills),
      })
      navigate(`/coach/sessions/${sessionId}`)
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
        <AppNav label={t('training.editNavLabel')} />
        <div className="flex min-h-[60vh] items-center justify-center">
          <LoadingSpinner />
        </div>
      </div>
    )
  }

  if (refError || !form) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppNav label={t('training.editNavLabel')} />
        <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
          <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
            {refError ?? t('training.error.notFound')}
          </div>
        </main>
      </div>
    )
  }

  const skillsByCategory = SKILL_CATEGORIES.map((cat) => ({
    value: cat,
    label: t('skillCategories.' + cat),
    color: SKILL_CATEGORY_COLORS[cat],
    items: skills.filter((s) => s.category === cat),
  })).filter((g) => g.items.length > 0)

  return (
    <div className="min-h-screen bg-gray-50">
      <AppNav label={t('training.editNavLabel')} />

      <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">{t('training.editNavLabel')}</h1>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="space-y-6">

            {/* ── Session details ── */}
            <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
              <h2 className="mb-5 text-sm font-semibold uppercase tracking-widest text-gray-400">
                {t('training.sectionDetails')}
              </h2>
              <div className="space-y-5">
                <div>
                  <FieldLabel htmlFor="title" required>{t('training.titleField')}</FieldLabel>
                  <input
                    id="title"
                    type="text"
                    required
                    value={form.title}
                    onChange={(e) => set('title', e.target.value)}
                    className={inputCls}
                    placeholder={t('training.titlePlaceholder')}
                  />
                </div>

                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <div>
                    <FieldLabel htmlFor="training_date" required>{t('training.date')}</FieldLabel>
                    <input
                      id="training_date"
                      type="date"
                      required
                      value={form.training_date}
                      onChange={(e) => set('training_date', e.target.value)}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <FieldLabel htmlFor="academy" required>{t('training.academy')}</FieldLabel>
                    <select
                      id="academy"
                      required
                      value={form.academy}
                      onChange={(e) => set('academy', e.target.value)}
                      className={`${inputCls} bg-white`}
                    >
                      <option value="">{t('training.selectAcademy')}</option>
                      {academies.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <FieldLabel htmlFor="team">{t('training.team')}</FieldLabel>
                  <select
                    id="team"
                    value={form.team}
                    onChange={(e) => set('team', e.target.value)}
                    disabled={!form.academy || teamsForAcademy.length === 0}
                    className={`${inputCls} bg-white disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400`}
                  >
                    <option value="">
                      {!form.academy
                        ? t('training.selectAcademyFirst')
                        : teamsForAcademy.length === 0
                        ? t('training.noTeamsInAcademy')
                        : t('training.noSpecificTeam')}
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
            </section>

            {/* ── Logistics ── */}
            <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
              <h2 className="mb-5 text-sm font-semibold uppercase tracking-widest text-gray-400">
                {t('training.sectionLogistics')}
              </h2>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
                <div>
                  <FieldLabel htmlFor="location">{t('training.location')}</FieldLabel>
                  <input
                    id="location"
                    type="text"
                    value={form.location}
                    onChange={(e) => set('location', e.target.value)}
                    className={inputCls}
                    placeholder={t('training.locationPlaceholder')}
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="start_time">{t('training.startTime')}</FieldLabel>
                  <input
                    id="start_time"
                    type="time"
                    value={form.start_time}
                    onChange={(e) => set('start_time', e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="duration_minutes">{t('training.duration')}</FieldLabel>
                  <input
                    id="duration_minutes"
                    type="number"
                    min={1}
                    max={300}
                    value={form.duration_minutes}
                    onChange={(e) => set('duration_minutes', e.target.value)}
                    className={inputCls}
                    placeholder={t('training.durationPlaceholder')}
                  />
                </div>
              </div>
            </section>

            {/* ── Description ── */}
            <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
              <h2 className="mb-5 text-sm font-semibold uppercase tracking-widest text-gray-400">
                {t('training.sectionDescription')}
              </h2>
              <div>
                <FieldLabel htmlFor="description">{t('training.notes')}</FieldLabel>
                <textarea
                  id="description"
                  rows={3}
                  value={form.description}
                  onChange={(e) => set('description', e.target.value)}
                  className={`${inputCls} resize-none`}
                  placeholder={t('training.notesPlaceholder')}
                />
              </div>
            </section>

            {/* ── Focus skills ── */}
            {skillsByCategory.length > 0 && (
              <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
                <div className="mb-5 flex items-center justify-between">
                  <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400">
                    {t('training.sectionFocusSkills')}
                  </h2>
                  {selectedSkills.size > 0 && (
                    <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-600">
                      {t('training.skillsSelected', { count: selectedSkills.size })}
                    </span>
                  )}
                </div>

                <div className="space-y-5">
                  {skillsByCategory.map(({ value, label, color, items }) => (
                    <div key={value}>
                      <p className={`mb-2 text-xs font-semibold uppercase tracking-wide ${color}`}>
                        {label}
                      </p>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {items.map((skill) => {
                          const checked = selectedSkills.has(skill.id)
                          return (
                            <label
                              key={skill.id}
                              className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${
                                checked
                                  ? 'border-brand-300 bg-brand-50 text-brand-700'
                                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleSkill(skill.id)}
                                className="accent-brand-600"
                              />
                              {skill.name}
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

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
                onClick={() => navigate(`/coach/sessions/${sessionId}`)}
                className="rounded-xl px-5 py-2 text-sm font-medium text-gray-500 transition hover:text-gray-800"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-xl bg-brand-600 px-6 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
              >
                {submitting ? t('training.saving') : t('training.saveButton')}
              </button>
            </div>

          </div>
        </form>
      </main>
    </div>
  )
}
