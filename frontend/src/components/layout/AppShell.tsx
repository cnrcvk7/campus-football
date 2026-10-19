import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import { cn } from '../../lib/utils'

export default function AppShell() {
  const { isAuthenticated } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Unauthenticated pages (e.g. dashboard hero) render without sidebar
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-cf-background">
        <Outlet />
      </div>
    )
  }

  return (
    <div className={cn('flex h-screen overflow-hidden bg-cf-background')}>
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar onMenuClick={() => setSidebarOpen(true)} />

        <main className="flex-1 overflow-y-auto bg-cf-background">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
