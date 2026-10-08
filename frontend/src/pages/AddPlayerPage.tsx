import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppNav from '../components/ui/AppNav'
import { POSITIONS } from '../constants/football'
import { playerService } from '../services/playerService'
import { ApiError } from '../services/api'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FormState {
  first_name: string
  last_name: string
  date_of_birth: string
  gender: string
  preferred_position: string
  jersey_number: string
  profile_photo_url: string
}

const EMPTY: FormState = {
  first_name: '',
  last_name: '',
  date_of_birth: '',
  gender: '',
  preferred_position: '',
  jersey_number: '',
  profile_photo_url: '',
}

const GENDER_OPTIONS = [
  { value: 'M', label: 'Male' },
  { value: 'F', label: 'Female' },
  { value: 'O', label: 'Other' },
  { value: 'P', label: 'Prefer not to say' },
]

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function FieldLabel({ htmlFor, children, required }: { htmlFor: string; children: string; required?: boolean }) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-medium text-gray-700">
      {children}
      {required && <span className="ml-0.5 text-red-500">*</span>}
    </label>
  )
}

const inputCls =
  'mt-1 block w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20'

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AddPlayerPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState<FormState>(EMPTY)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function set(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
    setError(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    try {
      const jerseyRaw = form.jersey_number.trim()
      const player = await playerService.create({
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        date_of_birth: form.date_of_birth,
        gender: form.gender,
        preferred_position: form.preferred_position || undefined,
        jersey_number: jerseyRaw ? parseInt(jerseyRaw, 10) : null,
        profile_photo_url: form.profile_photo_url.trim() || undefined,
      })
      navigate(`/players/${player.id}`)
    } catch (err) {
      if (err instanceof ApiError) {
        try {
          const body = JSON.parse(err.message)
          // DRF field errors: { field: ["msg"] } or { detail: "msg" }
          const messages = Object.entries(body)
            .map(([field, msgs]) =>
              field === 'non_field_errors' || field === 'detail'
                ? String(Array.isArray(msgs) ? msgs[0] : msgs)
                : `${field}: ${Array.isArray(msgs) ? msgs[0] : msgs}`
            )
            .join(' · ')
          setError(messages)
        } catch {
          setError(err.message)
        }
      } else {
        setError('Unexpected error — please try again.')
      }
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AppNav label="Add Player" />

      <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Add Player</h1>
          <p className="mt-1 text-sm text-gray-400">
            A permanent Football ID will be generated automatically.
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="space-y-8">

            {/* ── Personal details ── */}
            <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
              <h2 className="mb-5 text-sm font-semibold uppercase tracking-widest text-gray-400">
                Personal Details
              </h2>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div>
                  <FieldLabel htmlFor="first_name" required>First name</FieldLabel>
                  <input
                    id="first_name"
                    type="text"
                    required
                    value={form.first_name}
                    onChange={(e) => set('first_name', e.target.value)}
                    className={inputCls}
                    placeholder="e.g. Liam"
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="last_name" required>Last name</FieldLabel>
                  <input
                    id="last_name"
                    type="text"
                    required
                    value={form.last_name}
                    onChange={(e) => set('last_name', e.target.value)}
                    className={inputCls}
                    placeholder="e.g. Johnson"
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="date_of_birth" required>Date of birth</FieldLabel>
                  <input
                    id="date_of_birth"
                    type="date"
                    required
                    value={form.date_of_birth}
                    onChange={(e) => set('date_of_birth', e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="gender" required>Gender</FieldLabel>
                  <select
                    id="gender"
                    required
                    value={form.gender}
                    onChange={(e) => set('gender', e.target.value)}
                    className={`${inputCls} bg-white`}
                  >
                    <option value="">Select…</option>
                    {GENDER_OPTIONS.map((g) => (
                      <option key={g.value} value={g.value}>{g.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </section>

            {/* ── Football details ── */}
            <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
              <h2 className="mb-5 text-sm font-semibold uppercase tracking-widest text-gray-400">
                Football Details
              </h2>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div>
                  <FieldLabel htmlFor="preferred_position">Preferred position</FieldLabel>
                  <select
                    id="preferred_position"
                    value={form.preferred_position}
                    onChange={(e) => set('preferred_position', e.target.value)}
                    className={`${inputCls} bg-white`}
                  >
                    <option value="">None / unknown</option>
                    {Object.entries(POSITIONS).map(([code, label]) => (
                      <option key={code} value={code}>{label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <FieldLabel htmlFor="jersey_number">Jersey number</FieldLabel>
                  <input
                    id="jersey_number"
                    type="number"
                    min={1}
                    max={99}
                    value={form.jersey_number}
                    onChange={(e) => set('jersey_number', e.target.value)}
                    className={inputCls}
                    placeholder="1–99"
                  />
                </div>
              </div>
            </section>

            {/* ── Optional extras ── */}
            <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
              <h2 className="mb-5 text-sm font-semibold uppercase tracking-widest text-gray-400">
                Optional
              </h2>
              <div>
                <FieldLabel htmlFor="profile_photo_url">Profile photo URL</FieldLabel>
                <input
                  id="profile_photo_url"
                  type="url"
                  value={form.profile_photo_url}
                  onChange={(e) => set('profile_photo_url', e.target.value)}
                  className={inputCls}
                  placeholder="https://…"
                />
              </div>
            </section>

            {/* ── Error ── */}
            {error && (
              <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
                {error}
              </div>
            )}

            {/* ── Actions ── */}
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => navigate('/players')}
                className="rounded-xl px-5 py-2 text-sm font-medium text-gray-500 transition hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-xl bg-brand-600 px-6 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
              >
                {submitting ? 'Saving…' : 'Add Player'}
              </button>
            </div>

          </div>
        </form>
      </main>
    </div>
  )
}
