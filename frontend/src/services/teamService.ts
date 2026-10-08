import { api } from './api'
import type { PaginatedResponse, Team } from '../types'

export const teamService = {
  list: (): Promise<PaginatedResponse<Team>> =>
    api.get<PaginatedResponse<Team>>('/teams/?page_size=100'),
}
