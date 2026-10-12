import { api } from './api'
import type { PaginatedResponse, Player, Team, TeamCreate } from '../types'

export const teamService = {
  list: (): Promise<PaginatedResponse<Team>> =>
    api.get<PaginatedResponse<Team>>('/teams/?page_size=100'),

  listPlayers: (teamId: string): Promise<Player[]> =>
    api.get<Player[]>(`/teams/${teamId}/players/`),

  create: (data: TeamCreate): Promise<Team> =>
    api.post<Team>('/teams/', data),

  patch: (id: string, data: Partial<TeamCreate>): Promise<Team> =>
    api.patch<Team>(`/teams/${id}/`, data),
}
