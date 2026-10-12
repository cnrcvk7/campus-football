import { type FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppNav from '../components/ui/AppNav'
import { ApiError } from '../services/api'
import { academyService } from '../services/academyService'
import { validateAcademyForm } from '../utils/academyFormValidation'

// ---------------------------------------------------------------------------
// DRF error parser (same pattern as existing form pages)
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

export default function CreateAcademyPage() {
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [city, setCity] = useState('')
  const [country, setCountry] = useState('')

  const [fieldErrors, setFieldErrors] = useState<{ name?: string }>({})
  const [apiError, setApiError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setApiError(null)

    const errors = validateAcademyForm({ name })
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }
    setFieldErrors({})
    setSubmitting(true)

    try {
      await academyService.create({
        name: name.trim(),
        ...(description.trim() && { description: description.trim() }),
        ...(city.trim() && { city: city.trim() }),
        ...(country.trim() && { country: country.trim() }),
      })
      navigate('/coach/academies')
    } catch (err) {
      setApiError(parseDrfError(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AppNav label="New Academy" />
      <main className="mx-auto max-w-xl px-4 py-8 sm:px-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Create Academy</h1>
          <p className="mt-1 text-sm text-gray-400">
            Add a new academy to the platform.
          </p>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            <div>
              <FieldLabel htmlFor="name" required>Academy name</FieldLabel>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputCls}
                placeholder="e.g. Manchester United Academy"
              />
              {fieldErrors.name && <p className={errorCls}>{fieldErrors.name}</p>}
            </div>

            <div>
              <FieldLabel htmlFor="description">Description</FieldLabel>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className={inputCls}
                placeholder="Optional description"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <FieldLabel htmlFor="city">City</FieldLabel>
                <input
                  id="city"
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className={inputCls}
                  placeholder="e.g. Manchester"
                />
              </div>
              <div>
                <FieldLabel htmlFor="country">Country</FieldLabel>
                <input
                  id="country"
                  type="text"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className={inputCls}
                  placeholder="e.g. England"
                />
              </div>
            </div>

            {apiError && (
              <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 ring-1 ring-red-100">
                {apiError}
              </p>
            )}

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => navigate('/coach/academies')}
                className="text-sm text-gray-400 transition hover:text-gray-600"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-xl bg-brand-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-60"
              >
                {submitting ? 'Creating…' : 'Create Academy'}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  )
}
