import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import LoadingSpinner from '../components/ui/LoadingSpinner'
import { ApiError } from '../services/api'
import { developmentService } from '../services/developmentService'
import { playerService } from '../services/playerService'
import type { DevelopmentGoal, Player, Skill } from '../types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

type GoalStatus = DevelopmentGoal['status']

const GOAL_STATUS_VALUES: GoalStatus[] = ['ACTIVE', 'COMPLETED', 'CANCELLED']

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function EditGoalPage() {
  const { playerId, goalId } = useParams<{ playerId: string; goalId: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()

  const [player, setPlayer] = useState<Player | null>(null)
  const [skills, setSkills] = useState<Skill[]>([])
  const [refLoading, setRefLoading] = useState(true)
  const [refError, setRefError] = useState<string | null>(null)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [skillId, setSkillId] = useState('')
  const [startDate, setStartDate] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [targetValue, setTargetValue] = useState('')
  const [currentValue, setCurrentValue] = useState('')
  const [goalStatus, setGoalStatus] = useState<GoalStatus>('ACTIVE')

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    if (!playerId || !goalId) return
    Promise.all([
      playerService.get(playerId),
      developmentService.listSkills(),
      developmentService.getGoal(playerId, goalId),
    ])
      .then(([p, skillsPage, goal]) => {
        setPlayer(p)
        setSkills(skillsPage.results)
        setTitle(goal.title)
        setDescription(goal.description)
        setSkillId(goal.skill ?? '')
        setStartDate(goal.start_date)
        setTargetDate(goal.target_date ?? '')
        setTargetValue(goal.target_value ?? '')
        setCurrentValue(goal.current_value ?? '')
        setGoalStatus(goal.status)
        setRefLoading(false)
      })
      .catch((err: unknown) => {
        setRefError(err instanceof Error ? err.message : t('goal.error.loadFailed'))
        setRefLoading(false)
      })
  }, [playerId, goalId, t])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!playerId || !goalId) return

    setSubmitting(true)
    setSubmitError(null)

    try {
      await developmentService.updateGoal(playerId, goalId, {
        title: title.trim(),
        description: description.trim(),
        skill: skillId || null,
        start_date: startDate,
        target_date: targetDate || null,
        target_value: targetValue || null,
        current_value: currentValue || null,
        status: goalStatus,
      })
      navigate(`/players/${playerId}`)
    } catch (err) {
      setSubmitError(parseDrfError(err, t('common.error.generic')))
      setSubmitting(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Loading / error states
  // ---------------------------------------------------------------------------

  if (refLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <LoadingSpinner />
      </div>
    )
  }

  if (refError || !player) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          {refError ?? t('goal.error.notFound')}
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 lg:px-8">
        <button
          onClick={() => navigate(`/players/${playerId}`)}
          className="mb-2 text-sm text-brand-600 hover:text-brand-700"
        >
          {t('goal.backToProfile')}
        </button>
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">{t('goal.editTitle')}</h1>
          <p className="mt-1 text-sm text-gray-400">
            {player.first_name} {player.last_name} ·{' '}
            <span className="font-mono text-brand-500">{player.football_id}</span>
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="space-y-6">

            {/* ── Goal details ── */}
            <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
              <h2 className="mb-5 text-sm font-semibold uppercase tracking-widest text-gray-400">
                {t('goal.sectionDetails')}
              </h2>
              <div className="space-y-5">

                <div>
                  <label htmlFor="title" className="block text-sm font-medium text-gray-700">
                    {t('goal.title')} <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="title"
                    type="text"
                    required
                    value={title}
                    onChange={(e) => { setTitle(e.target.value); setSubmitError(null) }}
                    className={inputCls}
                  />
                </div>

                <div>
                  <label htmlFor="description" className="block text-sm font-medium text-gray-700">
                    {t('goal.description')}
                  </label>
                  <textarea
                    id="description"
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className={`${inputCls} resize-none`}
                  />
                </div>

                <div>
                  <label htmlFor="skill" className="block text-sm font-medium text-gray-700">
                    {t('goal.relatedSkill')}
                  </label>
                  <select
                    id="skill"
                    value={skillId}
                    onChange={(e) => setSkillId(e.target.value)}
                    className={inputCls}
                  >
                    <option value="">{t('goal.skillNone')}</option>
                    {['TECHNICAL', 'TACTICAL', 'PHYSICAL', 'MENTAL'].map((cat) => {
                      const catSkills = skills.filter((s) => s.category === cat)
                      if (catSkills.length === 0) return null
                      return (
                        <optgroup key={cat} label={t('skillCategories.' + cat)}>
                          {catSkills.map((s) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </optgroup>
                      )
                    })}
                  </select>
                </div>

              </div>
            </section>

            {/* ── Status ── */}
            <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
              <h2 className="mb-5 text-sm font-semibold uppercase tracking-widest text-gray-400">
                {t('goal.sectionStatus')}
              </h2>
              <div className="flex flex-wrap gap-3">
                {GOAL_STATUS_VALUES.map((val) => (
                  <label
                    key={val}
                    className={`flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition ${
                      goalStatus === val
                        ? 'border-brand-300 bg-brand-50 text-brand-700'
                        : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="status"
                      value={val}
                      checked={goalStatus === val}
                      onChange={() => setGoalStatus(val)}
                      className="sr-only"
                    />
                    <span className={`h-2 w-2 rounded-full ${
                      val === 'ACTIVE' ? 'bg-brand-500' :
                      val === 'COMPLETED' ? 'bg-emerald-500' : 'bg-gray-300'
                    }`} />
                    {val.charAt(0) + val.slice(1).toLowerCase()}
                  </label>
                ))}
              </div>
            </section>

            {/* ── Dates ── */}
            <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
              <h2 className="mb-5 text-sm font-semibold uppercase tracking-widest text-gray-400">
                {t('goal.sectionDates')}
              </h2>
              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label htmlFor="start_date" className="block text-sm font-medium text-gray-700">
                    {t('goal.startDate')} <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="start_date"
                    type="date"
                    required
                    value={startDate}
                    onChange={(e) => { setStartDate(e.target.value); setSubmitError(null) }}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label htmlFor="target_date" className="block text-sm font-medium text-gray-700">
                    {t('goal.targetDate')}
                  </label>
                  <input
                    id="target_date"
                    type="date"
                    value={targetDate}
                    onChange={(e) => setTargetDate(e.target.value)}
                    className={inputCls}
                  />
                </div>
              </div>
            </section>

            {/* ── Progress values ── */}
            <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
              <h2 className="mb-1 text-sm font-semibold uppercase tracking-widest text-gray-400">
                {t('goal.sectionProgress')}
              </h2>
              <p className="mb-5 text-xs text-gray-400">
                {t('goal.progressHint')}
              </p>
              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label htmlFor="current_value" className="block text-sm font-medium text-gray-700">
                    {t('goal.currentValue')}
                  </label>
                  <input
                    id="current_value"
                    type="number"
                    step="0.01"
                    min="0"
                    value={currentValue}
                    onChange={(e) => setCurrentValue(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label htmlFor="target_value" className="block text-sm font-medium text-gray-700">
                    {t('goal.targetValue')}
                  </label>
                  <input
                    id="target_value"
                    type="number"
                    step="0.01"
                    min="0"
                    value={targetValue}
                    onChange={(e) => setTargetValue(e.target.value)}
                    className={inputCls}
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
                onClick={() => navigate(`/players/${playerId}`)}
                className="rounded-xl px-5 py-2 text-sm font-medium text-gray-500 transition hover:text-gray-800"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={submitting || !title.trim()}
                className="rounded-xl bg-brand-600 px-6 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
              >
                {submitting ? t('common.loading') : t('goal.saveChangesButton')}
              </button>
            </div>

          </div>
        </form>
    </div>
  )
}
