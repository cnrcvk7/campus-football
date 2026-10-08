import { api } from './api'
import type { PaginatedResponse, Player, Team } from '../types'

export const teamService = {
  list: (): Promise<PaginatedResponse<Team>> =>
    api.get<PaginatedResponse<Team>>('/teams/?page_size=100'),

  listPlayers: (teamId: string): Promise<Player[]> =>
    api.get<Player[]>(`/teams/${teamId}/players/`),
}
