import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import AppNav from '../components/ui/AppNav'
import EmptyState from '../components/ui/EmptyState'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import { useAuth } from '../context/AuthContext'
import { academyService } from '../services/academyService'
import { teamService } from '../services/teamService'
import type { Academy, Team } from '../types'

function TeamCard({
  team,
  academyName,
}: {
  team: Team
  academyName: string
}) {
  const { t } = useTranslation()
  const parts = [team.age_group, team.season].filter(Boolean)
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
      <p className="font-semibold text-gray-900">{team.name}</p>
      <p className="mt-0.5 text-sm text-gray-400">{academyName}</p>
      {parts.length > 0 && (
        <p className="mt-1 text-xs text-gray-400">{parts.join(' · ')}</p>
      )}
      {team.gender && team.gender !== '' && (
        <span className="mt-2 inline-block rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-600">
          {team.gender === 'M' ? t('genders.boysMale') : team.gender === 'F' ? t('genders.girlsFemale') : t('genders.mixed')}
        </span>
      )}
    </div>
  )
}

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
    <div className="min-h-screen bg-gray-50">
      <AppNav label={t('teams.navLabel')} />
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('teams.title')}</h1>
            <p className="mt-1 text-sm text-gray-400">{t('teams.subtitle')}</p>
          </div>
          {canCreate && (
            <button
              onClick={() => navigate('/coach/teams/new')}
              className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
            >
              {t('teams.addButton')}
            </button>
          )}
        </div>

        {loading && <LoadingSpinner />}

        {error && (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 ring-1 ring-red-100">
            {error}
          </p>
        )}

        {!loading && !error && teams.length === 0 && (
          <EmptyState
            icon="🏃"
            title={t('teams.empty.noTeams')}
            description={canCreate ? t('teams.empty.noTeamsHint') : undefined}
          />
        )}

        {!loading && !error && teams.length > 0 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {teams.map((t) => (
              <TeamCard
                key={t.id}
                team={t}
                academyName={academyMap.get(t.academy) ?? ''}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
