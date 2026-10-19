import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import LoadingSpinner from '../components/ui/LoadingSpinner'
import { ApiError } from '../services/api'
import { developmentService } from '../services/developmentService'
import { playerService } from '../services/playerService'
import type { Player } from '../types'

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
// Decimal field with label and unit
// ---------------------------------------------------------------------------

function DecimalField({
  id,
  label,
  unit,
  value,
  onChange,
  placeholder,
}: {
  id: string
  label: string
  unit: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700">
        {label}{' '}
        <span className="text-xs font-normal text-gray-400">({unit})</span>
      </label>
      <input
        id={id}
        type="number"
        step="0.01"
        min="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={inputCls}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AddMeasurementPage() {
  const { playerId } = useParams<{ playerId: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()

  const [player, setPlayer] = useState<Player | null>(null)
  const [refLoading, setRefLoading] = useState(true)
  const [refError, setRefError] = useState<string | null>(null)

  const [measurementDate, setMeasurementDate] = useState(
    new Date().toISOString().slice(0, 10),
  )
  const [heightCm, setHeightCm] = useState('')
  const [weightKg, setWeightKg] = useState('')
  const [bodyFat, setBodyFat] = useState('')
  const [sprintTime, setSprintTime] = useState('')
  const [notes, setNotes] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    if (!playerId) return
    playerService.get(playerId)
      .then((p) => { setPlayer(p); setRefLoading(false) })
      .catch((err: unknown) => {
        setRefError(err instanceof Error ? err.message : t('measurement.error.loadFailed'))
        setRefLoading(false)
      })
  }, [playerId, t])

  const hasAnyValue = heightCm || weightKg || bodyFat || sprintTime

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!playerId) return

    setSubmitting(true)
    setSubmitError(null)

    try {
      await developmentService.createMeasurement(playerId, {
        measurement_date: measurementDate,
        height_cm: heightCm || null,
        weight_kg: weightKg || null,
        body_fat_percentage: bodyFat || null,
        sprint_time_seconds: sprintTime || null,
        notes: notes.trim(),
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
          {refError ?? t('measurement.error.notFound')}
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
          {t('measurement.backToProfile')}
        </button>
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">{t('measurement.title')}</h1>
          <p className="mt-1 text-sm text-gray-400">
            {player.first_name} {player.last_name} ·{' '}
            <span className="font-mono text-brand-500">{player.football_id}</span>
          </p>
          <p className="mt-1 text-xs text-gray-400">
            {t('measurement.immutableNote')}
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="space-y-6">

            {/* ── Date ── */}
            <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
              <h2 className="mb-5 text-sm font-semibold uppercase tracking-widest text-gray-400">
                {t('measurement.sectionDate')}
              </h2>
              <div className="sm:max-w-xs">
                <label htmlFor="measurement_date" className="block text-sm font-medium text-gray-700">
                  {t('measurement.date')} <span className="text-red-500">*</span>
                </label>
                <input
                  id="measurement_date"
                  type="date"
                  required
                  value={measurementDate}
                  onChange={(e) => { setMeasurementDate(e.target.value); setSubmitError(null) }}
                  className={inputCls}
                />
              </div>
            </section>

            {/* ── Body composition ── */}
            <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
              <h2 className="mb-5 text-sm font-semibold uppercase tracking-widest text-gray-400">
                {t('measurement.sectionBody')}
              </h2>
              <div className="grid gap-5 sm:grid-cols-2">
                <DecimalField
                  id="height_cm"
                  label={t('measurement.height')}
                  unit={t('measurement.heightUnit')}
                  value={heightCm}
                  onChange={setHeightCm}
                  placeholder={t('measurement.heightPlaceholder')}
                />
                <DecimalField
                  id="weight_kg"
                  label={t('measurement.weight')}
                  unit={t('measurement.weightUnit')}
                  value={weightKg}
                  onChange={setWeightKg}
                  placeholder={t('measurement.weightPlaceholder')}
                />
                <DecimalField
                  id="body_fat"
                  label={t('measurement.bodyFat')}
                  unit={t('measurement.bodyFatUnit')}
                  value={bodyFat}
                  onChange={setBodyFat}
                  placeholder={t('measurement.bodyFatPlaceholder')}
                />
              </div>
            </section>

            {/* ── Performance ── */}
            <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
              <h2 className="mb-5 text-sm font-semibold uppercase tracking-widest text-gray-400">
                {t('measurement.sectionPerformance')}
              </h2>
              <div className="sm:max-w-xs">
                <DecimalField
                  id="sprint_time"
                  label={t('measurement.sprint10m')}
                  unit={t('measurement.sprintUnit')}
                  value={sprintTime}
                  onChange={setSprintTime}
                  placeholder={t('measurement.sprintPlaceholder')}
                />
              </div>
            </section>

            {/* ── Notes ── */}
            <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
              <h2 className="mb-5 text-sm font-semibold uppercase tracking-widest text-gray-400">
                {t('measurement.sectionNotes')}
              </h2>
              <textarea
                id="notes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t('measurement.notesPlaceholder')}
                className={`${inputCls} resize-none`}
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
                onClick={() => navigate(`/players/${playerId}`)}
                className="rounded-xl px-5 py-2 text-sm font-medium text-gray-500 transition hover:text-gray-800"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={submitting || !hasAnyValue}
                className="rounded-xl bg-brand-600 px-6 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
              >
                {submitting ? t('common.loading') : t('measurement.saveButton')}
              </button>
            </div>

          </div>
        </form>
    </div>
  )
}
