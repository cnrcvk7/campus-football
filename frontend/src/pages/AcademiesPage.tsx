import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Building2, ChevronRight, MapPin, Plus } from 'lucide-react'
import AppNav from '../components/ui/AppNav'
import EmptyState from '../components/ui/EmptyState'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import { useAuth } from '../context/AuthContext'
import { academyService } from '../services/academyService'
import type { Academy } from '../types'

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
    <div className="min-h-screen bg-cf-background">
      <AppNav label={t('academies.navLabel')} />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-cf-surface-foreground">{t('academies.title')}</h1>
            <p className="mt-1 text-sm text-cf-muted-foreground">{t('academies.subtitle')}</p>
          </div>
          {isAdmin && (
            <button
              onClick={() => navigate('/coach/academies/new')}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium bg-emerald-500 hover:bg-emerald-600 text-white transition-colors"
            >
              <Plus size={16} />
              {t('academies.addButton')}
            </button>
          )}
        </div>

        {loading && <LoadingSpinner />}

        {error && (
          <EmptyState
            icon={<AlertTriangle size={24} />}
            title={t('academies.error.loadFailed')}
          />
        )}

        {!loading && !error && academies.length === 0 && (
          <EmptyState
            icon={<Building2 size={24} />}
            title={t('academies.empty.noAcademies')}
            description={isAdmin ? t('academies.empty.noAcademiesHint') : undefined}
          />
        )}

        {!loading && !error && academies.length > 0 && (
          <>
            <p className="mb-4 text-sm text-cf-muted-foreground">
              {t('academies.count', { count: academies.length })}
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {academies.map((academy) => (
                <div
                  key={academy.id}
                  onClick={() => navigate('/coach/academies/' + academy.id)}
                  className="rounded-2xl ring-1 bg-cf-surface ring-cf-border p-5 hover:ring-emerald-500/50 hover:shadow-sm transition-all cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-cf-surface-foreground">{academy.name}</p>
                    <ChevronRight size={16} className="text-cf-muted-foreground flex-shrink-0" />
                  </div>
                  {(academy.city || academy.country) && (
                    <div className="mt-1 flex items-center gap-1 text-sm text-cf-muted-foreground">
                      <MapPin size={12} className="text-cf-muted-foreground flex-shrink-0" />
                      <span>{[academy.city, academy.country].filter(Boolean).join(', ')}</span>
                    </div>
                  )}
                  {academy.description && (
                    <p className="mt-2 line-clamp-2 text-sm text-cf-muted-foreground">
                      {academy.description}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
