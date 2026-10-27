import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useAuth } from './AuthContext'
import { announcementService } from '../services/announcementService'

interface UnreadAnnouncementsContextValue {
  unreadCount: number
  refresh: () => void
}

const UnreadAnnouncementsContext = createContext<UnreadAnnouncementsContextValue>({
  unreadCount: 0,
  refresh: () => {},
})

const POLL_INTERVAL = 60_000

export function UnreadAnnouncementsProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth()
  const [unreadCount, setUnreadCount] = useState(0)
  const abortRef = useRef<AbortController | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchCount = useCallback(() => {
    if (!isAuthenticated) return
    // Abort previous in-flight request
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    announcementService.unreadCount()
      .then((res) => {
        if (!controller.signal.aborted) {
          setUnreadCount(res.unread_count)
        }
      })
      .catch(() => {
        // Silently ignore — network errors, aborts, etc.
      })
  }, [isAuthenticated])

  // Start/stop polling
  useEffect(() => {
    if (!isAuthenticated) {
      setUnreadCount(0)
      return
    }

    fetchCount()
    intervalRef.current = setInterval(fetchCount, POLL_INTERVAL)

    const handleVisibility = () => {
      if (document.hidden) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current)
          intervalRef.current = null
        }
      } else {
        fetchCount()
        intervalRef.current = setInterval(fetchCount, POLL_INTERVAL)
      }
    }

    const handleFocus = () => {
      fetchCount()
    }

    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('focus', handleFocus)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      abortRef.current?.abort()
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('focus', handleFocus)
    }
  }, [isAuthenticated, fetchCount])

  return (
    <UnreadAnnouncementsContext.Provider value={{ unreadCount, refresh: fetchCount }}>
      {children}
    </UnreadAnnouncementsContext.Provider>
  )
}

export function useUnreadAnnouncements(): UnreadAnnouncementsContextValue {
  return useContext(UnreadAnnouncementsContext)
}
