import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import AddPlayerPage from './pages/AddPlayerPage'
import AddAttendancePage from './pages/AddAttendancePage'
import AddMatchPlayerStatsPage from './pages/AddMatchPlayerStatsPage'
import CoachMatchDetailPage from './pages/CoachMatchDetailPage'
import CoachMatchesPage from './pages/CoachMatchesPage'
import CreateMatchPage from './pages/CreateMatchPage'
import CoachSessionDetailPage from './pages/CoachSessionDetailPage'
import CoachSessionsPage from './pages/CoachSessionsPage'
import CreateTrainingSessionPage from './pages/CreateTrainingSessionPage'
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
      <Route
        path="/coach/sessions"
        element={
          <ProtectedRoute>
            <CoachSessionsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/coach/sessions/new"
        element={
          <ProtectedRoute>
            <CreateTrainingSessionPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/coach/sessions/:sessionId"
        element={
          <ProtectedRoute>
            <CoachSessionDetailPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/coach/sessions/:sessionId/add-attendance"
        element={
          <ProtectedRoute>
            <AddAttendancePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/coach/matches"
        element={
          <ProtectedRoute>
            <CoachMatchesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/coach/matches/new"
        element={
          <ProtectedRoute>
            <CreateMatchPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/coach/matches/:matchId"
        element={
          <ProtectedRoute>
            <CoachMatchDetailPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/coach/matches/:matchId/add-stats"
        element={
          <ProtectedRoute>
            <AddMatchPlayerStatsPage />
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
