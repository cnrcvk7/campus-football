import { api } from './api'
import type { PaginatedResponse } from '../types'
import type {
  Announcement,
  AnnouncementCreate,
  AnnouncementUpdate,
  ReceiptsResponse,
  UnreadCountResponse,
} from '../types/announcements'

export const announcementService = {
  list: (params?: { page?: number; team?: string }): Promise<PaginatedResponse<Announcement>> => {
    const qs = new URLSearchParams()
    if (params?.page) qs.set('page', String(params.page))
    if (params?.team) qs.set('team', params.team)
    const query = qs.toString()
    return api.get<PaginatedResponse<Announcement>>(`/announcements/${query ? `?${query}` : ''}`)
  },

  get: (id: string): Promise<Announcement> =>
    api.get<Announcement>(`/announcements/${id}/`),

  create: (data: AnnouncementCreate): Promise<Announcement> =>
    api.post<Announcement>('/announcements/', data),

  update: (id: string, data: AnnouncementUpdate): Promise<Announcement> =>
    api.patch<Announcement>(`/announcements/${id}/`, data),

  remove: (id: string): Promise<void> =>
    api.delete(`/announcements/${id}/`),

  markRead: (id: string): Promise<{ read_at: string }> =>
    api.post<{ read_at: string }>(`/announcements/${id}/read/`, {}),

  pin: (id: string): Promise<{ is_pinned: boolean }> =>
    api.post<{ is_pinned: boolean }>(`/announcements/${id}/pin/`, {}),

  unpin: (id: string): Promise<{ is_pinned: boolean }> =>
    api.post<{ is_pinned: boolean }>(`/announcements/${id}/unpin/`, {}),

  acknowledge: (id: string): Promise<{ acknowledged_at: string }> =>
    api.post<{ acknowledged_at: string }>(`/announcements/${id}/acknowledge/`, {}),

  unacknowledge: (id: string): Promise<void> =>
    api.delete(`/announcements/${id}/acknowledge/`),

  receipts: (id: string): Promise<ReceiptsResponse> =>
    api.get<ReceiptsResponse>(`/announcements/${id}/receipts/`),

  unreadCount: (): Promise<UnreadCountResponse> =>
    api.get<UnreadCountResponse>('/announcements/unread-count/'),
}
