import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Building2, ChevronLeft, UserX } from 'lucide-react'
import EmptyState from '../components/ui/EmptyState'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import { academyService } from '../services/academyService'
import { teamService } from '../services/teamService'
import { POSITIONS } from '../constants/football'
import type { Player, Team } from '../types'

function calcAge(dob: string): number {
  return Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 3600 * 1000))
}

function Initials({ firstName, lastName }: { firstName: string; lastName: string }) {
  const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase()
  return (
    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500 text-xs font-semibold text-white">
      {initials}
    </div>
  )
}

export default function TeamDetailPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { teamId } = useParams<{ teamId: string }>()

  const [team, setTeam] = useState<Team | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [academyName, setAcademyName] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!teamId) return
    Promise.all([teamService.list(), teamService.listPlayers(teamId), academyService.list()])
      .then(([teamRes, playerList, academyRes]) => {
        const found = teamRes.results.find((tm) => tm.id === teamId) ?? null
        setTeam(found)
        setPlayers(playerList)
        if (found) {
          const academy = academyRes.results.find((a) => a.id === found.academy)
          setAcademyName(academy?.name ?? '')
        }
      })
      .catch(() => setError(t('teams.error.loadFailed')))
      .finally(() => setLoading(false))
  }, [teamId, t])

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

  if (!team) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <EmptyState icon={<AlertTriangle size={24} />} title={t('teams.error.notFound')} />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Back link */}
        <button
          onClick={() => navigate('/coach/teams')}
          className="inline-flex items-center gap-1 text-sm text-cf-muted-foreground hover:text-cf-surface-foreground mb-6"
        >
          <ChevronLeft size={16} />
          {t('teams.title')}
        </button>

        {/* Team header card */}
        <div className="rounded-2xl bg-slate-900 dark:bg-slate-800 p-6 text-white mb-6">
          <h1 className="text-2xl font-bold">{team.name}</h1>
          {academyName && (
            <div className="mt-2 flex items-center gap-1.5 text-slate-300">
              <Building2 size={14} />
              <span className="text-sm">{academyName}</span>
            </div>
          )}
          {(team.age_group || team.season || (team.gender && team.gender !== '')) && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {team.age_group && (
                <span className="rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset bg-white/10 text-white ring-white/20">
                  {team.age_group}
                </span>
              )}
              {team.season && (
                <span className="rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset bg-white/10 text-white ring-white/20">
                  {team.season}
                </span>
              )}
              {team.gender && team.gender !== '' && (
                <span className="rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset bg-white/10 text-white ring-white/20">
                  {team.gender === 'M' ? t('genders.boysMale') : team.gender === 'F' ? t('genders.girlsFemale') : t('genders.mixed')}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Roster section */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-cf-muted-foreground">
              {t('teams.rosterSection')}
            </h2>
            <span className="rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset bg-cf-muted text-cf-surface-foreground ring-cf-border">
              {t('teams.playerCount', { count: players.length })}
            </span>
          </div>

          {players.length === 0 ? (
            <EmptyState icon={<UserX size={24} />} title={t('teams.noPlayers')} />
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block overflow-hidden rounded-2xl ring-1 ring-cf-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-cf-muted">
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-cf-muted-foreground">
                        {t('players.tablePlayer')}
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-cf-muted-foreground">
                        {t('players.tableFootballId')}
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-cf-muted-foreground">
                        {t('players.tablePosition')}
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-cf-muted-foreground">
                        {t('players.tableAge')}
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-cf-muted-foreground">
                        {t('players.tableJersey')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-cf-border">
                    {players.map((player) => (
                      <tr
                        key={player.id}
                        onClick={() => navigate('/players/' + player.id)}
                        className="hover:bg-cf-muted/50 cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <Initials firstName={player.first_name} lastName={player.last_name} />
                            <span className="font-medium text-cf-surface-foreground">
                              {player.first_name} {player.last_name}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-cf-muted-foreground">
                          {player.football_id}
                        </td>
                        <td className="px-4 py-3 text-cf-surface-foreground">
                          {player.preferred_position
                            ? (POSITIONS[player.preferred_position] ?? player.preferred_position)
                            : '—'}
                        </td>
                        <td className="px-4 py-3 text-cf-surface-foreground">
                          {player.date_of_birth ? calcAge(player.date_of_birth) : '—'}
                        </td>
                        <td className="px-4 py-3 text-cf-surface-foreground">
                          {player.jersey_number != null ? `#${player.jersey_number}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden space-y-3">
                {players.map((player) => (
                  <div
                    key={player.id}
                    onClick={() => navigate('/players/' + player.id)}
                    className="flex items-center gap-3 rounded-2xl ring-1 bg-cf-surface ring-cf-border p-4 cursor-pointer hover:bg-cf-muted/50 transition-colors"
                  >
                    <Initials firstName={player.first_name} lastName={player.last_name} />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-cf-surface-foreground truncate">
                        {player.first_name} {player.last_name}
                      </p>
                      <p className="text-xs font-mono text-cf-muted-foreground">{player.football_id}</p>
                      {player.preferred_position && (
                        <p className="text-xs text-cf-muted-foreground">
                          {POSITIONS[player.preferred_position] ?? player.preferred_position}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
    </div>
  )
}
