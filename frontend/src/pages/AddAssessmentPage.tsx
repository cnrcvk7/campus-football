import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import AppNav from '../components/ui/AppNav'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import { ApiError } from '../services/api'
import { developmentService } from '../services/developmentService'
import { playerService } from '../services/playerService'
import type { Player, Skill, SkillCategory } from '../types'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SKILL_CATEGORY_COLORS: Record<SkillCategory, string> = {
  TECHNICAL: 'text-brand-600',
  TACTICAL:  'text-violet-600',
  PHYSICAL:  'text-emerald-600',
  MENTAL:    'text-amber-600',
}

const SKILL_CATEGORY_BARS: Record<SkillCategory, string> = {
  TECHNICAL: 'bg-brand-500',
  TACTICAL:  'bg-violet-500',
  PHYSICAL:  'bg-emerald-500',
  MENTAL:    'bg-amber-500',
}

const SKILL_CATEGORIES: SkillCategory[] = ['TECHNICAL', 'TACTICAL', 'PHYSICAL', 'MENTAL']

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

// ---------------------------------------------------------------------------
// Skill row state
// ---------------------------------------------------------------------------

interface SkillRow {
  skill: Skill
  included: boolean
  score: number
  comment: string
}

// ---------------------------------------------------------------------------
// Score input with progress bar
// ---------------------------------------------------------------------------

function ScoreInput({
  id,
  value,
  onChange,
  barClass,
}: {
  id: string
  value: number
  onChange: (v: number) => void
  barClass: string
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onChange(Math.max(0, value - 5))}
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border border-gray-200 text-xs text-gray-500 transition hover:bg-gray-50"
        >
          −
        </button>
        <input
          id={id}
          type="number"
          min={0}
          max={100}
          value={value}
          onChange={(e) => {
            const v = Math.min(100, Math.max(0, parseInt(e.target.value, 10) || 0))
            onChange(v)
          }}
          className="w-14 rounded-lg border border-gray-200 px-2 py-1 text-center text-sm font-semibold text-gray-900 outline-none focus:border-brand-400"
        />
        <button
          type="button"
          onClick={() => onChange(Math.min(100, value + 5))}
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border border-gray-200 text-xs text-gray-500 transition hover:bg-gray-50"
        >
          +
        </button>
      </div>
      {/* Mini progress bar */}
      <div className="flex-1 h-1.5 rounded-full bg-gray-100">
        <div
          className={`h-1.5 rounded-full transition-all ${barClass}`}
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="w-8 shrink-0 text-right text-xs text-gray-400">/ 100</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AddAssessmentPage() {
  const { playerId } = useParams<{ playerId: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()

  const [player, setPlayer] = useState<Player | null>(null)
  const [rows, setRows] = useState<SkillRow[]>([])
  const [refLoading, setRefLoading] = useState(true)
  const [refError, setRefError] = useState<string | null>(null)

  const [assessmentDate, setAssessmentDate] = useState(
    new Date().toISOString().slice(0, 10),
  )
  const [overallComment, setOverallComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    if (!playerId) return
    Promise.all([
      playerService.get(playerId),
      developmentService.listSkills(),
    ])
      .then(([p, skillsPage]) => {
        setPlayer(p)
        setRows(
          skillsPage.results.map((s) => ({
            skill: s,
            included: false,
            score: 50,
            comment: '',
          })),
        )
        setRefLoading(false)
      })
      .catch((err: unknown) => {
        setRefError(err instanceof Error ? err.message : t('assessment.error.loadFailed'))
        setRefLoading(false)
      })
  }, [playerId, t])

  function toggleSkill(skillId: string) {
    setRows((prev) =>
      prev.map((r) => (r.skill.id === skillId ? { ...r, included: !r.included } : r)),
    )
    setSubmitError(null)
  }

  function setScore(skillId: string, score: number) {
    setRows((prev) =>
      prev.map((r) => (r.skill.id === skillId ? { ...r, score } : r)),
    )
  }

  function setComment(skillId: string, comment: string) {
    setRows((prev) =>
      prev.map((r) => (r.skill.id === skillId ? { ...r, comment } : r)),
    )
  }

  const includedCount = rows.filter((r) => r.included).length

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!playerId) return

    const included = rows.filter((r) => r.included)
    if (included.length === 0) {
      setSubmitError(t('assessment.skillRequired'))
      return
    }

    setSubmitting(true)
    setSubmitError(null)

    try {
      await developmentService.createAssessment(playerId, {
        assessment_date: assessmentDate,
        overall_comment: overallComment.trim(),
        items: included.map((r) => ({
          skill: r.skill.id,
          score: r.score,
          comment: r.comment.trim(),
        })),
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
      <div className="min-h-screen bg-gray-50">
        <AppNav label={t('assessment.navLabel')} />
        <div className="flex min-h-[60vh] items-center justify-center">
          <LoadingSpinner />
        </div>
      </div>
    )
  }

  if (refError || !player) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppNav label={t('assessment.navLabel')} />
        <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
          <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
            {refError ?? t('assessment.error.notFound')}
          </div>
        </main>
      </div>
    )
  }

  const skillsByCategory = SKILL_CATEGORIES.map((cat) => ({
    value: cat,
    label: t('skillCategories.' + cat),
    color: SKILL_CATEGORY_COLORS[cat],
    bar: SKILL_CATEGORY_BARS[cat],
    rows: rows.filter((r) => r.skill.category === cat),
  })).filter((g) => g.rows.length > 0)

  return (
    <div className="min-h-screen bg-gray-50">
      <AppNav label={t('assessment.navLabel')} />

      <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6 lg:px-8">
        <button
          onClick={() => navigate(`/players/${playerId}`)}
          className="mb-2 text-sm text-brand-600 hover:text-brand-700"
        >
          {t('assessment.backToProfile')}
        </button>
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">{t('assessment.title')}</h1>
          <p className="mt-1 text-sm text-gray-400">
            {player.first_name} {player.last_name} ·{' '}
            <span className="font-mono text-brand-500">{player.football_id}</span>
          </p>
          <p className="mt-1 text-xs text-gray-400">
            {t('assessment.immutableNote')}
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="space-y-6">

            {/* ── Assessment details ── */}
            <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
              <h2 className="mb-5 text-sm font-semibold uppercase tracking-widest text-gray-400">
                {t('assessment.sectionDetails')}
              </h2>
              <div className="space-y-5">
                <div className="sm:max-w-xs">
                  <label htmlFor="assessment_date" className="block text-sm font-medium text-gray-700">
                    {t('assessment.date')} <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="assessment_date"
                    type="date"
                    required
                    value={assessmentDate}
                    onChange={(e) => { setAssessmentDate(e.target.value); setSubmitError(null) }}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label htmlFor="overall_comment" className="block text-sm font-medium text-gray-700">
                    {t('assessment.overallComment')}
                  </label>
                  <textarea
                    id="overall_comment"
                    rows={3}
                    value={overallComment}
                    onChange={(e) => setOverallComment(e.target.value)}
                    className={`${inputCls} resize-none`}
                    placeholder={t('assessment.overallCommentPlaceholder')}
                  />
                </div>
              </div>
            </section>

            {/* ── Skills by category ── */}
            {skillsByCategory.map(({ value, label, color, bar, rows: catRows }) => (
              <section key={value} className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
                <div className="mb-5 flex items-center justify-between">
                  <h2 className={`text-sm font-semibold uppercase tracking-widest ${color}`}>
                    {label}
                  </h2>
                  <span className="text-xs text-gray-400">
                    {catRows.filter((r) => r.included).length} / {catRows.length} {t('assessment.selected')}
                  </span>
                </div>

                <div className="space-y-4">
                  {catRows.map((row) => (
                    <div
                      key={row.skill.id}
                      className={`rounded-xl border p-4 transition ${
                        row.included
                          ? 'border-brand-200 bg-brand-50/40'
                          : 'border-gray-100 bg-gray-50/50'
                      }`}
                    >
                      {/* Skill toggle */}
                      <label className="flex cursor-pointer items-center gap-3">
                        <input
                          type="checkbox"
                          checked={row.included}
                          onChange={() => toggleSkill(row.skill.id)}
                          className="h-4 w-4 rounded accent-brand-600"
                        />
                        <span className={`text-sm font-medium ${row.included ? 'text-gray-900' : 'text-gray-400'}`}>
                          {row.skill.name}
                        </span>
                      </label>

                      {/* Score + comment (visible when included) */}
                      {row.included && (
                        <div className="mt-4 space-y-3 pl-7">
                          <ScoreInput
                            id={`score-${row.skill.id}`}
                            value={row.score}
                            onChange={(v) => setScore(row.skill.id, v)}
                            barClass={bar}
                          />
                          <input
                            type="text"
                            value={row.comment}
                            onChange={(e) => setComment(row.skill.id, e.target.value)}
                            placeholder={t('assessment.skillCommentPlaceholder')}
                            className="block w-full rounded-xl border border-gray-200 px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20"
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            ))}

            {/* ── Summary ── */}
            {includedCount > 0 && (
              <div className="rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-700 ring-1 ring-brand-200">
                {t('assessment.skillCount', { count: includedCount })}
              </div>
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
                onClick={() => navigate(`/players/${playerId}`)}
                className="rounded-xl px-5 py-2 text-sm font-medium text-gray-500 transition hover:text-gray-800"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={submitting || includedCount === 0}
                className="rounded-xl bg-brand-600 px-6 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
              >
                {submitting ? t('common.loading') : t('assessment.saveButton')}
              </button>
            </div>

          </div>
        </form>
      </main>
    </div>
  )
}
