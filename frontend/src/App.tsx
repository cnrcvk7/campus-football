import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import AddPlayerPage from './pages/AddPlayerPage'
import DashboardPage from './pages/DashboardPage'
import EditPlayerPage from './pages/EditPlayerPage'
import LoginPage from './pages/LoginPage'
import PlayerProfilePage from './pages/PlayerProfilePage'
import PlayersListPage from './pages/PlayersListPage'
import type { ReactNode } from 'react'

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth()
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: window.location.pathname }} />
  }
  return <>{children}</>
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<DashboardPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/players"
        element={
          <ProtectedRoute>
            <PlayersListPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/players/new"
        element={
          <ProtectedRoute>
            <AddPlayerPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/players/:playerId"
        element={
          <ProtectedRoute>
            <PlayerProfilePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/players/:playerId/edit"
        element={
          <ProtectedRoute>
            <EditPlayerPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
