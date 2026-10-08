import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
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

const SKILL_CATEGORIES: { value: SkillCategory; label: string; color: string }[] = [
  { value: 'TECHNICAL', label: 'Technical', color: 'text-blue-600' },
  { value: 'TACTICAL',  label: 'Tactical',  color: 'text-purple-600' },
  { value: 'PHYSICAL',  label: 'Physical',  color: 'text-orange-600' },
  { value: 'MENTAL',    label: 'Mental',    color: 'text-teal-600' },
]

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

const EMPTY: FormState = {
  academy: '',
  team: '',
  title: '',
  description: '',
  training_date: '',
  start_time: '',
  duration_minutes: '',
  location: '',
}

// ---------------------------------------------------------------------------
// Parse DRF errors into a human-readable string
// ---------------------------------------------------------------------------

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

export default function CreateTrainingSessionPage() {
  const navigate = useNavigate()

  // Reference data
  const [academies, setAcademies] = useState<Academy[]>([])
  const [allTeams, setAllTeams] = useState<Team[]>([])
  const [skills, setSkills] = useState<Skill[]>([])
  const [refLoading, setRefLoading] = useState(true)
  const [refError, setRefError] = useState<string | null>(null)

  // Form
  const [form, setForm] = useState<FormState>(EMPTY)
  const [selectedSkills, setSelectedSkills] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Teams filtered to chosen academy
  const teamsForAcademy = form.academy
    ? allTeams.filter((t) => t.academy === form.academy)
    : []

  // Load reference data in parallel
  useEffect(() => {
    Promise.all([
      academyService.list(),
      teamService.list(),
      developmentService.listSkills(),
    ])
      .then(([acs, tms, sks]) => {
        setAcademies(acs.results)
        setAllTeams(tms.results)
        setSkills(sks.results)
        setRefLoading(false)
      })
      .catch((err: unknown) => {
        setRefError(err instanceof Error ? err.message : 'Failed to load form data.')
        setRefLoading(false)
      })
  }, [])

  function set(field: keyof FormState, value: string) {
    setForm((prev) => {
      const next = { ...prev, [field]: value }
      // Reset team when academy changes
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
    setSubmitting(true)
    setSubmitError(null)

    try {
      const session = await trainingService.createSession({
        academy: form.academy,
        team: form.team || null,
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        training_date: form.training_date,
        start_time: form.start_time || null,
        duration_minutes: form.duration_minutes ? parseInt(form.duration_minutes, 10) : null,
        location: form.location.trim() || undefined,
        focus_skills: selectedSkills.size > 0 ? Array.from(selectedSkills) : [],
      })
      navigate(`/coach/sessions/${session.id}`)
    } catch (err) {
      setSubmitError(parseDrfError(err))
      setSubmitting(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (refLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppNav label="New Training Session" />
        <div className="flex min-h-[60vh] items-center justify-center">
          <LoadingSpinner />
        </div>
      </div>
    )
  }

  if (refError) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppNav label="New Training Session" />
        <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
          <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
            {refError}
          </div>
        </main>
      </div>
    )
  }

  const skillsByCategory = SKILL_CATEGORIES.map(({ value, label, color }) => ({
    value, label, color,
    items: skills.filter((s) => s.category === value),
  })).filter((g) => g.items.length > 0)

  return (
    <div className="min-h-screen bg-gray-50">
      <AppNav label="New Training Session" />

      <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">New Training Session</h1>
          <p className="mt-1 text-sm text-gray-400">
            Fill in the session details below. Fields marked * are required.
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="space-y-6">

            {/* ── Session details ── */}
            <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
              <h2 className="mb-5 text-sm font-semibold uppercase tracking-widest text-gray-400">
                Session Details
              </h2>
              <div className="space-y-5">
                <div>
                  <FieldLabel htmlFor="title" required>Title</FieldLabel>
                  <input
                    id="title"
                    type="text"
                    required
                    value={form.title}
                    onChange={(e) => set('title', e.target.value)}
                    className={inputCls}
                    placeholder="e.g. Wednesday Passing Drill"
                  />
                </div>

                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <div>
                    <FieldLabel htmlFor="training_date" required>Date</FieldLabel>
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
                    <FieldLabel htmlFor="academy" required>Academy</FieldLabel>
                    <select
                      id="academy"
                      required
                      value={form.academy}
                      onChange={(e) => set('academy', e.target.value)}
                      className={`${inputCls} bg-white`}
                    >
                      <option value="">Select academy…</option>
                      {academies.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <FieldLabel htmlFor="team">Team</FieldLabel>
                  <select
                    id="team"
                    value={form.team}
                    onChange={(e) => set('team', e.target.value)}
                    disabled={!form.academy || teamsForAcademy.length === 0}
                    className={`${inputCls} bg-white disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400`}
                  >
                    <option value="">
                      {!form.academy
                        ? 'Select an academy first'
                        : teamsForAcademy.length === 0
                        ? 'No teams in this academy'
                        : 'No specific team (academy-wide)'}
                    </option>
                    {teamsForAcademy.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                        {t.age_group && ` · ${t.age_group}`}
                        {t.season && ` (${t.season})`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </section>

            {/* ── Logistics ── */}
            <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
              <h2 className="mb-5 text-sm font-semibold uppercase tracking-widest text-gray-400">
                Logistics
              </h2>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
                <div>
                  <FieldLabel htmlFor="location">Location</FieldLabel>
                  <input
                    id="location"
                    type="text"
                    value={form.location}
                    onChange={(e) => set('location', e.target.value)}
                    className={inputCls}
                    placeholder="e.g. Main Pitch"
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="start_time">Start time</FieldLabel>
                  <input
                    id="start_time"
                    type="time"
                    value={form.start_time}
                    onChange={(e) => set('start_time', e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="duration_minutes">Duration (min)</FieldLabel>
                  <input
                    id="duration_minutes"
                    type="number"
                    min={1}
                    max={300}
                    value={form.duration_minutes}
                    onChange={(e) => set('duration_minutes', e.target.value)}
                    className={inputCls}
                    placeholder="e.g. 90"
                  />
                </div>
              </div>
            </section>

            {/* ── Description ── */}
            <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
              <h2 className="mb-5 text-sm font-semibold uppercase tracking-widest text-gray-400">
                Description
              </h2>
              <div>
                <FieldLabel htmlFor="description">Notes / plan</FieldLabel>
                <textarea
                  id="description"
                  rows={3}
                  value={form.description}
                  onChange={(e) => set('description', e.target.value)}
                  className={`${inputCls} resize-none`}
                  placeholder="Optional overview of the session plan…"
                />
              </div>
            </section>

            {/* ── Focus skills ── */}
            {skillsByCategory.length > 0 && (
              <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
                <div className="mb-5 flex items-center justify-between">
                  <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400">
                    Focus Skills
                  </h2>
                  {selectedSkills.size > 0 && (
                    <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-600">
                      {selectedSkills.size} selected
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
                onClick={() => navigate('/coach/sessions')}
                className="rounded-xl px-5 py-2 text-sm font-medium text-gray-500 transition hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-xl bg-brand-600 px-6 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
              >
                {submitting ? 'Creating…' : 'Create Session'}
              </button>
            </div>

          </div>
        </form>
      </main>
    </div>
  )
}
