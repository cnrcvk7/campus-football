import { api } from './api'
import type {
  DevelopmentTimeline,
  MatchHistory,
  MatchSummary,
  PaginatedResponse,
  Player,
  PlayerCreate,
  PlayerHistory,
  PlayerUpdate,
  TrainingHistory,
} from '../types'

export const playerService = {
  list: (params?: { search?: string; position?: string; page?: number }): Promise<PaginatedResponse<Player>> => {
    const qs = new URLSearchParams()
    if (params?.search) qs.set('search', params.search)
    if (params?.position) qs.set('position', params.position)
    if (params?.page && params.page > 1) qs.set('page', String(params.page))
    const query = qs.toString()
    return api.get<PaginatedResponse<Player>>(query ? `/players/?${query}` : '/players/')
  },

  create: (data: PlayerCreate): Promise<Player> =>
    api.post<Player>('/players/', data),

  update: (id: string, data: PlayerUpdate): Promise<Player> =>
    api.patch<Player>(`/players/${id}/`, data),

  delete: (id: string): Promise<void> =>
    api.delete(`/players/${id}/`),

  get: (id: string): Promise<Player> =>
    api.get<Player>(`/players/${id}/`),

  getHistory: (id: string): Promise<PlayerHistory> =>
    api.get<PlayerHistory>(`/players/${id}/history/`),

  getDevelopmentTimeline: (id: string): Promise<DevelopmentTimeline> =>
    api.get<DevelopmentTimeline>(`/players/${id}/development/timeline/`),

  getMatchHistory: (id: string): Promise<MatchHistory> =>
    api.get<MatchHistory>(`/players/${id}/matches/`),

  getMatchSummary: (id: string): Promise<MatchSummary> =>
    api.get<MatchSummary>(`/players/${id}/matches/summary/`),

  getTrainingHistory: (id: string): Promise<TrainingHistory> =>
    api.get<TrainingHistory>(`/players/${id}/training/history/`),
}
