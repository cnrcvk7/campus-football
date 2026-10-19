import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, ChevronRight, Plus, Users } from 'lucide-react'
import EmptyState from '../components/ui/EmptyState'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import { useAuth } from '../context/AuthContext'
import { academyService } from '../services/academyService'
import { teamService } from '../services/teamService'
import type { Academy, Team } from '../types'

export default function TeamsPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { user } = useAuth()
  const canCreate = user?.role === 'COACH' || user?.role === 'ACADEMY_ADMIN'

  const [teams, setTeams] = useState<Team[]>([])
  const [academyMap, setAcademyMap] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([teamService.list(), academyService.list()])
      .then(([teamsRes, academiesRes]) => {
        setTeams(teamsRes.results)
        setAcademyMap(
          new Map<string, string>(
            (academiesRes.results as Academy[]).map((a) => [a.id, a.name]),
          ),
        )
      })
      .catch(() => setError(t('teams.error.loadFailed')))
      .finally(() => setLoading(false))
  }, [t])

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-cf-surface-foreground">{t('teams.title')}</h1>
            <p className="mt-1 text-sm text-cf-muted-foreground">{t('teams.subtitle')}</p>
          </div>
          {canCreate && (
            <button
              onClick={() => navigate('/coach/teams/new')}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium bg-emerald-500 hover:bg-emerald-600 text-white transition-colors"
            >
              <Plus size={16} />
              {t('teams.addButton')}
            </button>
          )}
        </div>

        {loading && <LoadingSpinner />}

        {error && (
          <EmptyState
            icon={<AlertTriangle size={24} />}
            title={t('teams.error.loadFailed')}
          />
        )}

        {!loading && !error && teams.length === 0 && (
          <EmptyState
            icon={<Users size={24} />}
            title={t('teams.empty.noTeams')}
            description={canCreate ? t('teams.empty.noTeamsHint') : undefined}
          />
        )}

        {!loading && !error && teams.length > 0 && (
          <>
            <p className="mb-4 text-sm text-cf-muted-foreground">
              {t('teams.count', { count: teams.length })}
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
                  <p className="mt-0.5 text-sm text-cf-muted-foreground">
                    {academyMap.get(team.academy) ?? ''}
                  </p>
                  {(team.age_group || team.season || (team.gender && team.gender !== '')) && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {team.age_group && (
                        <span className="rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset bg-cf-muted text-cf-surface-foreground ring-cf-border">
                          {team.age_group}
                        </span>
                      )}
                      {team.season && (
                        <span className="rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset bg-cf-muted text-cf-surface-foreground ring-cf-border">
                          {team.season}
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
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
    </div>
  )
}
