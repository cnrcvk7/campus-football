import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import LoadingSpinner from '../components/ui/LoadingSpinner'
import { ApiError } from '../services/api'
import { trainingService } from '../services/trainingService'
import type { AttendanceStatus, TrainingAttendance, TrainingSession } from '../types'
import { toDisplayLocale } from '../utils/localeDateFormatter'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_STYLES: Record<AttendanceStatus, string> = {
  PRESENT: 'border-green-300 bg-green-50 text-green-700',
  ABSENT:  'border-red-300 bg-red-50 text-red-700',
  LATE:    'border-yellow-300 bg-yellow-50 text-yellow-700',
  EXCUSED: 'border-gray-300 bg-gray-50 text-gray-500',
}

const STATUS_VALUES: AttendanceStatus[] = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED']

const INACTIVE_STYLE = 'border-gray-200 bg-white text-gray-400 hover:border-gray-300'

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
// Page
// ---------------------------------------------------------------------------

export default function EditAttendancePage() {
  const { sessionId, attendanceId } = useParams<{ sessionId: string; attendanceId: string }>()
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const displayLocale = toDisplayLocale(i18n.language)

  const [session, setSession] = useState<TrainingSession | null>(null)
  const [record, setRecord] = useState<TrainingAttendance | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [attendanceStatus, setAttendanceStatus] = useState<AttendanceStatus>('PRESENT')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    if (!sessionId || !attendanceId) return
    Promise.all([
      trainingService.getSession(sessionId),
      trainingService.listAttendance(sessionId),
    ])
      .then(([s, all]) => {
        const found = all.find((a) => a.id === attendanceId)
        if (!found) {
          setLoadError(t('attendance.error.notFound'))
          setLoading(false)
          return
        }
        setSession(s)
        setRecord(found)
        setAttendanceStatus(found.status)
        setNotes(found.notes)
        setLoading(false)
      })
      .catch((err: unknown) => {
        setLoadError(err instanceof Error ? err.message : t('training.error.formLoadFailed'))
        setLoading(false)
      })
  }, [sessionId, attendanceId, t])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!sessionId || !attendanceId) return
    setSubmitting(true)
    setSubmitError(null)

    try {
      await trainingService.updateAttendance(sessionId, attendanceId, {
        status: attendanceStatus,
        notes: notes.trim(),
      })
      navigate(`/coach/sessions/${sessionId}`)
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

  if (loadError || !session || !record) {
    return (
      <div className="mx-auto max-w-xl px-4 py-10 sm:px-6">
        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          {loadError ?? t('attendance.error.notFound')}
        </div>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Form
  // ---------------------------------------------------------------------------

  return (
    <div className="mx-auto max-w-xl px-4 py-10 sm:px-6 lg:px-8">
        <button
          onClick={() => navigate(`/coach/sessions/${sessionId}`)}
          className="mb-2 text-sm text-brand-600 hover:text-brand-700"
        >
          {t('attendance.backToSession')}
        </button>
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">{t('attendance.editTitle')}</h1>
          <p className="mt-1 text-sm text-gray-400">
            {session.title} ·{' '}
            {new Date(session.training_date).toLocaleDateString(displayLocale, {
              day: 'numeric', month: 'short', year: 'numeric',
            })}
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="space-y-5">

            <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
              <div className="space-y-5">

                {/* Player — read-only */}
                <div>
                  <p className="block text-sm font-medium text-gray-700 mb-1">{t('attendance.playerLabel')}</p>
                  <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                    <span className="text-sm font-medium text-gray-900">{record.player_name}</span>
                    <span className="ml-2 font-mono text-xs text-brand-500">{record.football_id}</span>
                  </div>
                </div>

                {/* Status */}
                <div>
                  <p className="block text-sm font-medium text-gray-700 mb-2">
                    {t('attendance.status')} <span className="text-red-500">*</span>
                  </p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {STATUS_VALUES.map((val) => (
                      <label
                        key={val}
                        className={`flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border py-2.5 text-sm font-medium transition ${
                          attendanceStatus === val ? STATUS_STYLES[val] : INACTIVE_STYLE
                        }`}
                      >
                        <input
                          type="radio"
                          name="status"
                          value={val}
                          checked={attendanceStatus === val}
                          onChange={() => { setAttendanceStatus(val); setSubmitError(null) }}
                          className="sr-only"
                        />
                        {val.charAt(0) + val.slice(1).toLowerCase()}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label htmlFor="notes" className="block text-sm font-medium text-gray-700">
                    {t('attendance.notes')}
                  </label>
                  <textarea
                    id="notes"
                    rows={2}
                    value={notes}
                    onChange={(e) => { setNotes(e.target.value); setSubmitError(null) }}
                    className={`${inputCls} resize-none`}
                    placeholder={t('attendance.notesPlaceholder')}
                  />
                </div>
              </div>
            </section>

            {/* Error */}
            {submitError && (
              <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
                {submitError}
              </div>
            )}

            {/* Actions */}
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
                {submitting ? t('attendance.saving') : t('attendance.saveChanges')}
              </button>
            </div>

          </div>
        </form>
    </div>
  )
}
