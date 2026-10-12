import { type FormEvent, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
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

function parseDrfError(err: unknown): string {
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
  return 'Something went wrong. Please try again.'
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
    <label htmlFor={htmlFor} className="block text-sm font-medium text-gray-700">
      {children}
      {required && <span className="ml-0.5 text-red-500">*</span>}
    </label>
  )
}

const inputCls =
  'mt-1 block w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20'

const errorCls = 'mt-1 text-xs text-red-600'

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CreateTeamPage() {
  const navigate = useNavigate()

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
      setApiError(parseDrfError(err))
    } finally {
      setSubmitting(false)
    }
  }

  if (loadingAcademies) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppNav label="New Team" />
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AppNav label="New Team" />
      <main className="mx-auto max-w-xl px-4 py-8 sm:px-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Create Team</h1>
          <p className="mt-1 text-sm text-gray-400">Add a new team to an academy.</p>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            <div>
              <FieldLabel htmlFor="academy" required>Academy</FieldLabel>
              <select
                id="academy"
                value={academy}
                onChange={(e) => setAcademy(e.target.value)}
                className={inputCls}
              >
                <option value="">Select an academy…</option>
                {academies.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
              {fieldErrors.academy && <p className={errorCls}>{fieldErrors.academy}</p>}
            </div>

            <div>
              <FieldLabel htmlFor="name" required>Team name</FieldLabel>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputCls}
                placeholder="e.g. U15 Boys"
              />
              {fieldErrors.name && <p className={errorCls}>{fieldErrors.name}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <FieldLabel htmlFor="ageGroup">Age group</FieldLabel>
                <input
                  id="ageGroup"
                  type="text"
                  value={ageGroup}
                  onChange={(e) => setAgeGroup(e.target.value)}
                  className={inputCls}
                  placeholder="e.g. U15"
                />
              </div>
              <div>
                <FieldLabel htmlFor="gender">Gender</FieldLabel>
                <select
                  id="gender"
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  className={inputCls}
                >
                  <option value="">Any</option>
                  <option value="M">Boys / Male</option>
                  <option value="F">Girls / Female</option>
                  <option value="X">Mixed</option>
                </select>
              </div>
            </div>

            <div>
              <FieldLabel htmlFor="season">Season</FieldLabel>
              <input
                id="season"
                type="text"
                value={season}
                onChange={(e) => setSeason(e.target.value)}
                className={inputCls}
                placeholder="e.g. 2025/26"
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
                className="text-sm text-gray-400 transition hover:text-gray-600"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-xl bg-brand-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-60"
              >
                {submitting ? 'Creating…' : 'Create Team'}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  )
}
