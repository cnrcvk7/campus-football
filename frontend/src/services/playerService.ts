import { api } from './api'
import type {
  DevelopmentTimeline,
  MatchHistory,
  MatchSummary,
  Player,
  PlayerCreate,
  PlayerHistory,
  PlayerUpdate,
  TrainingHistory,
} from '../types'

export const playerService = {
  list: (): Promise<Player[]> =>
    api.get<Player[]>('/players/'),

  create: (data: PlayerCreate): Promise<Player> =>
    api.post<Player>('/players/', data),

  update: (id: string, data: PlayerUpdate): Promise<Player> =>
    api.patch<Player>(`/players/${id}/`, data),

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
