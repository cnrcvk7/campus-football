import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import LoadingSpinner from '../components/ui/LoadingSpinner'
import { POSITIONS } from '../constants/football'
import { ApiError } from '../services/api'
import { playerService } from '../services/playerService'
import type { Player } from '../types'

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
  const { t } = useTranslation()
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
        setLoadError(err instanceof Error ? err.message : t('players.error.loadFailed2'))
      })
  }, [playerId, t])

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
      setDeleteError(err instanceof Error ? err.message : t('common.error.generic'))
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
        setSubmitError(t('common.error.generic'))
      }
      setSubmitting(false)
    }
  }

  // ── Loading ──
  if (!player || !form) {
    return (
      <>
        {loadError ? (
          <div className="mx-auto max-w-2xl px-4 py-16 text-center">
            <p className="text-sm text-red-600">{loadError}</p>
          </div>
        ) : (
          <LoadingSpinner />
        )}
      </>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 lg:px-8">
        {/* Heading */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">
            {t('playerForm.editTitle', { name: `${player.first_name} ${player.last_name}` })}
          </h1>
          <p className="mt-1 font-mono text-xs text-brand-500">{player.football_id}</p>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="space-y-8">

            {/* ── Personal details ── */}
            <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
              <h2 className="mb-5 text-sm font-semibold uppercase tracking-widest text-gray-400">
                {t('playerForm.sectionPersonal')}
              </h2>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div>
                  <FieldLabel htmlFor="first_name" required>{t('playerForm.firstName')}</FieldLabel>
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
                  <FieldLabel htmlFor="last_name" required>{t('playerForm.lastName')}</FieldLabel>
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
                  <FieldLabel htmlFor="date_of_birth" required>{t('playerForm.dateOfBirth')}</FieldLabel>
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
                  <FieldLabel htmlFor="gender" required>{t('playerForm.gender')}</FieldLabel>
                  <select
                    id="gender"
                    required
                    value={form.gender}
                    onChange={(e) => set('gender', e.target.value)}
                    className={`${inputCls} bg-white`}
                  >
                    <option value="">{t('playerForm.genderPlaceholder')}</option>
                    <option value="M">{t('genders.M')}</option>
                    <option value="F">{t('genders.F')}</option>
                    <option value="O">{t('genders.O')}</option>
                    <option value="P">{t('genders.P')}</option>
                  </select>
                </div>
              </div>
            </section>

            {/* ── Football details ── */}
            <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
              <h2 className="mb-5 text-sm font-semibold uppercase tracking-widest text-gray-400">
                {t('playerForm.sectionFootball')}
              </h2>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div>
                  <FieldLabel htmlFor="preferred_position">{t('playerForm.position')}</FieldLabel>
                  <select
                    id="preferred_position"
                    value={form.preferred_position}
                    onChange={(e) => set('preferred_position', e.target.value)}
                    className={`${inputCls} bg-white`}
                  >
                    <option value="">{t('playerForm.noneUnknown')}</option>
                    {Object.keys(POSITIONS).map((code) => (
                      <option key={code} value={code}>{t('positions.' + code)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <FieldLabel htmlFor="jersey_number">{t('playerForm.jerseyNumber')}</FieldLabel>
                  <input
                    id="jersey_number"
                    type="number"
                    min={1}
                    max={99}
                    value={form.jersey_number}
                    onChange={(e) => set('jersey_number', e.target.value)}
                    className={inputCls}
                    placeholder={t('playerForm.jerseyHint')}
                  />
                </div>
              </div>
            </section>

            {/* ── Optional extras ── */}
            <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
              <h2 className="mb-5 text-sm font-semibold uppercase tracking-widest text-gray-400">
                {t('playerForm.sectionOptional')}
              </h2>
              <div>
                <FieldLabel htmlFor="profile_photo_url">{t('playerForm.photoUrl')}</FieldLabel>
                <input
                  id="profile_photo_url"
                  type="url"
                  value={form.profile_photo_url}
                  onChange={(e) => set('profile_photo_url', e.target.value)}
                  className={inputCls}
                  placeholder={t('playerForm.photoPlaceholder')}
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
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-xl bg-brand-600 px-6 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
              >
                {submitting ? t('common.loading') : t('playerForm.saveButton')}
              </button>
            </div>

          </div>
        </form>

        {/* ── Danger Zone ── */}
        <section className="mt-10 rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-widest text-red-500">
            {t('playerForm.dangerZone')}
          </h2>
          <p className="mb-5 text-sm text-gray-500">
            {t('playerForm.dangerZoneDesc')}
          </p>

          {!confirmDelete ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="rounded-xl border border-red-300 px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50"
            >
              {t('playerForm.deleteButton')}
            </button>
          ) : (
            <div className="rounded-xl bg-red-50 p-4 ring-1 ring-red-200">
              <p className="mb-4 text-sm font-medium text-red-800">
                {t('playerForm.deleteConfirm', { name: `${player.first_name} ${player.last_name}` })}
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
                  {deleting ? t('common.loading') : t('playerForm.deleteConfirmYes')}
                </button>
                <button
                  type="button"
                  onClick={() => { setConfirmDelete(false); setDeleteError(null) }}
                  className="text-sm text-gray-500 transition hover:text-gray-800"
                >
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          )}
        </section>

    </div>
  )
}
