import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, ChevronLeft, ChevronRight, MapPin, Plus, Users } from 'lucide-react'
import EmptyState from '../components/ui/EmptyState'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import { useAuth } from '../context/AuthContext'
import { academyService } from '../services/academyService'
import { teamService } from '../services/teamService'
import type { Academy, Team } from '../types'

export default function AcademyDetailPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { academyId } = useParams<{ academyId: string }>()
  const { user } = useAuth()
  const isAdmin = user?.role === 'ACADEMY_ADMIN'

  const [academy, setAcademy] = useState<Academy | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!academyId) return
    Promise.all([academyService.list(), teamService.list()])
      .then(([academyRes, teamRes]) => {
        const found = academyRes.results.find((a) => a.id === academyId) ?? null
        setAcademy(found)
        setTeams(teamRes.results.filter((team) => team.academy === academyId))
      })
      .catch(() => setError(t('academies.error.loadFailed')))
      .finally(() => setLoading(false))
  }, [academyId, t])

  if (loading) {
    return <LoadingSpinner />
  }

  if (error) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <EmptyState icon={<AlertTriangle size={24} />} title={error} />
      </div>
    )
  }

  if (!academy) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <EmptyState icon={<AlertTriangle size={24} />} title={t('academies.error.notFound')} />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Back link */}
        <button
          onClick={() => navigate('/coach/academies')}
          className="inline-flex items-center gap-1 text-sm text-cf-muted-foreground hover:text-cf-surface-foreground mb-6"
        >
          <ChevronLeft size={16} />
          {t('academies.title')}
        </button>

        {/* Academy header card */}
        <div className="rounded-2xl bg-slate-900 dark:bg-slate-800 p-6 text-white mb-6">
          <h1 className="text-2xl font-bold">{academy.name}</h1>
          {(academy.city || academy.country) && (
            <div className="mt-2 flex items-center gap-1.5 text-slate-300">
              <MapPin size={14} />
              <span className="text-sm">{[academy.city, academy.country].filter(Boolean).join(', ')}</span>
            </div>
          )}
          {academy.description && (
            <p className="mt-3 text-sm text-slate-300">{academy.description}</p>
          )}
        </div>

        {/* Teams section */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-cf-muted-foreground">
                {t('academies.teamsSection')}
              </h2>
              <span className="rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset bg-cf-muted text-cf-surface-foreground ring-cf-border">
                {teams.length}
              </span>
            </div>
            {isAdmin && (
              <button
                onClick={() => navigate('/coach/teams/new')}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium bg-cf-surface ring-1 ring-cf-border text-cf-surface-foreground hover:bg-cf-muted transition-colors"
              >
                <Plus size={14} />
                {t('teams.addButton')}
              </button>
            )}
          </div>

          {teams.length === 0 ? (
            <EmptyState
              icon={<Users size={24} />}
              title={t('academies.noTeams')}
            />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {teams.map((team) => (
                <div
                  key={team.id}
                  onClick={() => navigate('/coach/teams/' + team.id)}
                  className="rounded-2xl ring-1 bg-cf-surface ring-cf-border p-5 hover:ring-emerald-500/50 hover:shadow-sm transition-all cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-cf-surface-foreground">{team.name}</p>
                    <ChevronRight size={16} className="text-cf-muted-foreground flex-shrink-0" />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {team.age_group && (
                      <span className="rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset bg-cf-muted text-cf-surface-foreground ring-cf-border">
                        {team.age_group}
                      </span>
                    )}
                    {team.gender && team.gender !== '' && (
                      <span className={
                        team.gender === 'M'
                          ? 'rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-950 dark:text-sky-400 dark:ring-sky-900'
                          : team.gender === 'F'
                          ? 'rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset bg-pink-50 text-pink-700 ring-pink-200 dark:bg-pink-950 dark:text-pink-400 dark:ring-pink-900'
                          : 'rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-950 dark:text-violet-400 dark:ring-violet-900'
                      }>
                        {team.gender === 'M' ? t('genders.boysMale') : team.gender === 'F' ? t('genders.girlsFemale') : t('genders.mixed')}
                      </span>
                    )}
                    {team.season && (
                      <span className="rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset bg-cf-muted text-cf-surface-foreground ring-cf-border">
                        {team.season}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
    </div>
  )
}
