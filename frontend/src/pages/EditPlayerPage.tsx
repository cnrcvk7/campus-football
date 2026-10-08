import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import AppNav from '../components/ui/AppNav'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import { POSITIONS } from '../constants/football'
import { ApiError } from '../services/api'
import { playerService } from '../services/playerService'
import type { Player } from '../types'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GENDER_OPTIONS = [
  { value: 'M', label: 'Male' },
  { value: 'F', label: 'Female' },
  { value: 'O', label: 'Other' },
  { value: 'P', label: 'Prefer not to say' },
]

// ---------------------------------------------------------------------------
// Helpers
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

function playerToForm(p: Player) {
  return {
    first_name: p.first_name,
    last_name: p.last_name,
    date_of_birth: p.date_of_birth,
    gender: p.gender,
    preferred_position: p.preferred_position ?? '',
    jersey_number: p.jersey_number !== null ? String(p.jersey_number) : '',
    profile_photo_url: p.profile_photo_url ?? '',
  }
}

type FormState = ReturnType<typeof playerToForm>

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function EditPlayerPage() {
  const { playerId } = useParams<{ playerId: string }>()
  if (!playerId) return null
  return <EditPlayerContent playerId={playerId} />
}

function EditPlayerContent({ playerId }: { playerId: string }) {
  const navigate = useNavigate()
  const [player, setPlayer] = useState<Player | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [form, setForm] = useState<FormState | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    playerService
      .get(playerId)
      .then((p) => {
        setPlayer(p)
        setForm(playerToForm(p))
      })
      .catch((err: unknown) => {
        setLoadError(err instanceof Error ? err.message : 'Failed to load player.')
      })
  }, [playerId])

  function set(field: keyof FormState, value: string) {
    setForm((prev) => prev ? { ...prev, [field]: value } : prev)
    setSubmitError(null)
  }

  async function handleDelete() {
    if (!player) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await playerService.delete(player.id)
      navigate('/players')
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete player.')
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form || !player) return
    setSubmitting(true)
    setSubmitError(null)

    try {
      const jerseyRaw = form.jersey_number.trim()
      await playerService.update(playerId, {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        date_of_birth: form.date_of_birth,
        gender: form.gender,
        preferred_position: form.preferred_position || '',
        jersey_number: jerseyRaw ? parseInt(jerseyRaw, 10) : null,
        profile_photo_url: form.profile_photo_url.trim(),
      })
      navigate(`/players/${player.id}`)
    } catch (err) {
      if (err instanceof ApiError) {
        try {
          const body = JSON.parse(err.message)
          const messages = Object.entries(body)
            .map(([field, msgs]) =>
              field === 'non_field_errors' || field === 'detail'
                ? String(Array.isArray(msgs) ? msgs[0] : msgs)
                : `${field}: ${Array.isArray(msgs) ? msgs[0] : msgs}`
            )
            .join(' · ')
          setSubmitError(messages)
        } catch {
          setSubmitError(err.message)
        }
      } else {
        setSubmitError('Unexpected error — please try again.')
      }
      setSubmitting(false)
    }
  }

  // ── Loading ──
  if (!player || !form) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppNav label="Edit Player" />
        {loadError ? (
          <div className="mx-auto max-w-2xl px-4 py-16 text-center">
            <p className="text-sm text-red-600">{loadError}</p>
          </div>
        ) : (
          <LoadingSpinner />
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AppNav label="Edit Player" />

      <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6 lg:px-8">
        {/* Heading */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">
            Edit {player.first_name} {player.last_name}
          </h1>
          <p className="mt-1 font-mono text-xs text-brand-500">{player.football_id}</p>
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
            {submitError && (
              <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
                {submitError}
              </div>
            )}

            {/* ── Actions ── */}
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => navigate(`/players/${player.id}`)}
                className="rounded-xl px-5 py-2 text-sm font-medium text-gray-500 transition hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-xl bg-brand-600 px-6 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
              >
                {submitting ? 'Saving…' : 'Save Changes'}
              </button>
            </div>

          </div>
        </form>

        {/* ── Danger Zone ── */}
        <section className="mt-10 rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-widest text-red-500">
            Danger Zone
          </h2>
          <p className="mb-5 text-sm text-gray-500">
            Permanently delete this player and all associated data. This cannot be undone.
          </p>

          {!confirmDelete ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="rounded-xl border border-red-300 px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50"
            >
              Delete Player
            </button>
          ) : (
            <div className="rounded-xl bg-red-50 p-4 ring-1 ring-red-200">
              <p className="mb-4 text-sm font-medium text-red-800">
                Are you sure you want to delete{' '}
                <span className="font-bold">{player.first_name} {player.last_name}</span>?
                This action is permanent.
              </p>
              {deleteError && (
                <p className="mb-3 text-sm text-red-700">{deleteError}</p>
              )}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
                >
                  {deleting ? 'Deleting…' : 'Yes, delete permanently'}
                </button>
                <button
                  type="button"
                  onClick={() => { setConfirmDelete(false); setDeleteError(null) }}
                  className="text-sm text-gray-500 transition hover:text-gray-800"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </section>

      </main>
    </div>
  )
}
