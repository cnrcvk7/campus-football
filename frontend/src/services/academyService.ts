import { api } from './api'
import type { Academy, AcademyCreate, PaginatedResponse } from '../types'

export const academyService = {
  list: (): Promise<PaginatedResponse<Academy>> =>
    api.get<PaginatedResponse<Academy>>('/academies/?page_size=100'),

  create: (data: AcademyCreate): Promise<Academy> =>
    api.post<Academy>('/academies/', data),

  patch: (id: string, data: Partial<AcademyCreate>): Promise<Academy> =>
    api.patch<Academy>(`/academies/${id}/`, data),
}
