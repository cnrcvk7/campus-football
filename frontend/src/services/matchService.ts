import { api } from './api'
import type { Match, MatchStats, PaginatedResponse } from '../types'

export interface MatchCreate {
  academy: string
  team: string
  opponent_name: string
  match_date: string
  home_away: 'HOME' | 'AWAY'
  venue?: string
  competition?: string
  team_score?: number | null
  opponent_score?: number | null
  notes?: string
}

export const matchService = {
  listMatches: (params?: { page?: number }): Promise<PaginatedResponse<Match>> => {
    const qs = new URLSearchParams()
    if (params?.page && params.page > 1) qs.set('page', String(params.page))
    const query = qs.toString()
    return api.get<PaginatedResponse<Match>>(
      query ? `/matches/?${query}` : '/matches/'
    )
  },

  getMatch: (id: string): Promise<Match> =>
    api.get<Match>(`/matches/${id}/`),

  createMatch: (data: MatchCreate): Promise<Match> =>
    api.post<Match>('/matches/', data),

  listPlayerStats: (matchId: string): Promise<MatchStats[]> =>
    api.get<MatchStats[]>(`/matches/${matchId}/players/`),
}
