import { api } from './api'
import type { Academy, PaginatedResponse } from '../types'

export const academyService = {
  list: (): Promise<PaginatedResponse<Academy>> =>
    api.get<PaginatedResponse<Academy>>('/academies/?page_size=100'),
}
