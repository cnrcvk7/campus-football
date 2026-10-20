import { type FormEvent, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import AppNav from '../components/ui/AppNav'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import { ApiError } from '../services/api'
import { academyService } from '../services/academyService'
import { teamService } from '../services/teamService'
import type { Academy } from '../types'
import { validateTeamForm } from '../utils/teamFormValidation'

// ---------------------------------------------------------------------------
// DRF error parser
// ---------------------------------------------------------------------------

function parseDrfError(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    try {
      const body = JSON.parse(err.message) as Record<string, unknown>
      return Object.entries(body)
        .map(([field, msgs]) =>
          field === 'non_field_errors' || field === 'detail'
            ? String(Array.isArray(msgs) ? msgs[0] : msgs)
            : `${field}: ${Array.isArray(msgs) ? msgs[0] : msgs}`,
        )
        .join(' · ')
    } catch {
      return err.message
    }
  }
  return fallback
}

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

function FieldLabel({
  htmlFor,
  children,
  required,
}: {
  htmlFor: string
  children: string
  required?: boolean
}) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-medium text-cf-surface-foreground">
      {children}
      {required && <span className="ml-0.5 text-red-500">*</span>}
    </label>
  )
}

const inputCls =
  'mt-1 block w-full rounded-xl border border-cf-border px-3 py-2 text-sm text-cf-surface-foreground placeholder:text-cf-muted-foreground bg-cf-surface outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20'

const errorCls = 'mt-1 text-xs text-red-600'

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CreateTeamPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()

  const [academies, setAcademies] = useState<Academy[]>([])
  const [loadingAcademies, setLoadingAcademies] = useState(true)

  const [academy, setAcademy] = useState('')
  const [name, setName] = useState('')
  const [ageGroup, setAgeGroup] = useState('')
  const [gender, setGender] = useState('')
  const [season, setSeason] = useState('')

  const [fieldErrors, setFieldErrors] = useState<{ name?: string; academy?: string }>({})
  const [apiError, setApiError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    academyService
      .list()
      .then((res) => {
        setAcademies(res.results)
        if (res.results.length === 1) setAcademy(res.results[0].id)
      })
      .finally(() => setLoadingAcademies(false))
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setApiError(null)

    const errors = validateTeamForm({ name, academy })
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }
    setFieldErrors({})
    setSubmitting(true)

    try {
      await teamService.create({
        academy,
        name: name.trim(),
        ...(ageGroup.trim() && { age_group: ageGroup.trim() }),
        ...(gender && { gender }),
        ...(season.trim() && { season: season.trim() }),
      })
      navigate('/coach/teams')
    } catch (err) {
      setApiError(parseDrfError(err, t('common.error.generic')))
    } finally {
      setSubmitting(false)
    }
  }

  if (loadingAcademies) {
    return (
      <div className="min-h-screen bg-cf-background">
        <AppNav label={t('teams.navLabel')} />
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-cf-background">
      <AppNav label={t('teams.navLabel')} />
      <main className="mx-auto max-w-xl px-4 py-8 sm:px-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-cf-surface-foreground">{t('teams.createTitle')}</h1>
          <p className="mt-1 text-sm text-cf-muted-foreground">{t('teams.createSubtitle')}</p>
        </div>

        <div className="rounded-2xl bg-cf-surface p-6 ring-1 ring-cf-border">
          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            <div>
              <FieldLabel htmlFor="academy" required>{t('teams.academy')}</FieldLabel>
              <select
                id="academy"
                value={academy}
                onChange={(e) => setAcademy(e.target.value)}
                className={inputCls}
              >
                <option value="">{t('teams.academyPlaceholder')}</option>
                {academies.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
              {fieldErrors.academy && <p className={errorCls}>{t(fieldErrors.academy)}</p>}
            </div>

            <div>
              <FieldLabel htmlFor="name" required>{t('teams.name')}</FieldLabel>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputCls}
                placeholder={t('teams.namePlaceholder')}
              />
              {fieldErrors.name && <p className={errorCls}>{t(fieldErrors.name)}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <FieldLabel htmlFor="ageGroup">{t('teams.ageGroup')}</FieldLabel>
                <input
                  id="ageGroup"
                  type="text"
                  value={ageGroup}
                  onChange={(e) => setAgeGroup(e.target.value)}
                  className={inputCls}
                  placeholder={t('teams.ageGroupPlaceholder')}
                />
              </div>
              <div>
                <FieldLabel htmlFor="gender">{t('teams.gender')}</FieldLabel>
                <select
                  id="gender"
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  className={inputCls}
                >
                  <option value="">{t('genders.any')}</option>
                  <option value="M">{t('genders.boysMale')}</option>
                  <option value="F">{t('genders.girlsFemale')}</option>
                  <option value="X">{t('genders.mixed')}</option>
                </select>
              </div>
            </div>

            <div>
              <FieldLabel htmlFor="season">{t('teams.season')}</FieldLabel>
              <input
                id="season"
                type="text"
                value={season}
                onChange={(e) => setSeason(e.target.value)}
                className={inputCls}
                placeholder={t('teams.seasonPlaceholder')}
              />
            </div>

            {apiError && (
              <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 ring-1 ring-red-100">
                {apiError}
              </p>
            )}

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => navigate('/coach/teams')}
                className="text-sm text-cf-muted-foreground transition hover:text-cf-surface-foreground"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-xl bg-emerald-500 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-600 disabled:opacity-60"
              >
                {submitting ? t('teams.creating') : t('teams.createButton')}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  )
}
