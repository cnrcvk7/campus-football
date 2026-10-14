import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import AppNav from '../components/ui/AppNav'
import EmptyState from '../components/ui/EmptyState'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import { useAuth } from '../context/AuthContext'
import { academyService } from '../services/academyService'
import type { Academy } from '../types'

function AcademyCard({ academy }: { academy: Academy }) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
      <p className="font-semibold text-gray-900">{academy.name}</p>
      {(academy.city || academy.country) && (
        <p className="mt-0.5 text-sm text-gray-400">
          {[academy.city, academy.country].filter(Boolean).join(', ')}
        </p>
      )}
      {academy.description && (
        <p className="mt-2 text-sm text-gray-500 line-clamp-2">{academy.description}</p>
      )}
    </div>
  )
}

export default function AcademiesPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { user } = useAuth()
  const isAdmin = user?.role === 'ACADEMY_ADMIN'

  const [academies, setAcademies] = useState<Academy[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    academyService
      .list()
      .then((res) => setAcademies(res.results))
      .catch(() => setError(t('academies.error.loadFailed')))
      .finally(() => setLoading(false))
  }, [t])

  return (
    <div className="min-h-screen bg-gray-50">
      <AppNav label={t('academies.navLabel')} />
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('academies.title')}</h1>
            <p className="mt-1 text-sm text-gray-400">{t('academies.subtitle')}</p>
          </div>
          {isAdmin && (
            <button
              onClick={() => navigate('/coach/academies/new')}
              className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
            >
              {t('academies.addButton')}
            </button>
          )}
        </div>

        {loading && <LoadingSpinner />}

        {error && (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 ring-1 ring-red-100">
            {error}
          </p>
        )}

        {!loading && !error && academies.length === 0 && (
          <EmptyState
            icon="🏟️"
            title={t('academies.empty.noAcademies')}
            description={isAdmin ? t('academies.empty.noAcademiesHint') : undefined}
          />
        )}

        {!loading && !error && academies.length > 0 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {academies.map((a) => (
              <AcademyCard key={a.id} academy={a} />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
