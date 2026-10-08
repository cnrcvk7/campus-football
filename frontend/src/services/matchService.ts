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

export interface PlayerStatsCreate {
  player: string
  started: boolean
  minutes_played: number
  goals: number
  assists: number
  shots: number
  shots_on_target: number
  passes_attempted: number
  passes_completed: number
  key_passes: number
  dribbles: number
  tackles: number
  interceptions: number
  yellow_cards: number
  red_cards: number
  rating: string | null   // decimal string e.g. "7.50" or null
  coach_comment: string
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

  addPlayerStats: (matchId: string, data: PlayerStatsCreate): Promise<MatchStats> =>
    api.post<MatchStats>(`/matches/${matchId}/players/`, data),
}
