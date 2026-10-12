import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import AcademiesPage from './pages/AcademiesPage'
import AddAssessmentPage from './pages/AddAssessmentPage'
import AddGoalPage from './pages/AddGoalPage'
import AddMeasurementPage from './pages/AddMeasurementPage'
import AddPlayerPage from './pages/AddPlayerPage'
import EditGoalPage from './pages/EditGoalPage'
import AddAttendancePage from './pages/AddAttendancePage'
import EditAttendancePage from './pages/EditAttendancePage'
import AddMatchPlayerStatsPage from './pages/AddMatchPlayerStatsPage'
import CoachMatchDetailPage from './pages/CoachMatchDetailPage'
import CoachMatchesPage from './pages/CoachMatchesPage'
import CreateMatchPage from './pages/CreateMatchPage'
import EditMatchPage from './pages/EditMatchPage'
import EditMatchPlayerStatsPage from './pages/EditMatchPlayerStatsPage'
import CreateAcademyPage from './pages/CreateAcademyPage'
import CreateTeamPage from './pages/CreateTeamPage'
import CoachSessionDetailPage from './pages/CoachSessionDetailPage'
import CoachSessionsPage from './pages/CoachSessionsPage'
import CreateTrainingSessionPage from './pages/CreateTrainingSessionPage'
import EditTrainingSessionPage from './pages/EditTrainingSessionPage'
import DashboardPage from './pages/DashboardPage'
import EditPlayerPage from './pages/EditPlayerPage'
import LoginPage from './pages/LoginPage'
import PlayerProfilePage from './pages/PlayerProfilePage'
import PlayerReportPage from './pages/PlayerReportPage'
import PlayersListPage from './pages/PlayersListPage'
import TeamsPage from './pages/TeamsPage'
import LoadingSpinner from './components/ui/LoadingSpinner'
import type { ReactNode } from 'react'

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth()
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: window.location.pathname }} />
  }
  return <>{children}</>
}

function CoachRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, user, userLoading } = useAuth()
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: window.location.pathname }} />
  }
  if (userLoading) {
    return <LoadingSpinner />
  }
  if (user?.role === 'COACH' || user?.role === 'ACADEMY_ADMIN') {
    return <>{children}</>
  }
  return <Navigate to="/" replace />
}

function AcademyAdminRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, user, userLoading } = useAuth()
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: window.location.pathname }} />
  }
  if (userLoading) {
    return <LoadingSpinner />
  }
  if (user?.role === 'ACADEMY_ADMIN') {
    return <>{children}</>
  }
  return <Navigate to="/coach/academies" replace />
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
        path="/players/:playerId/report"
        element={
          <ProtectedRoute>
            <PlayerReportPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/players/:playerId/assessments/new"
        element={
          <ProtectedRoute>
            <AddAssessmentPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/players/:playerId/goals/new"
        element={
          <ProtectedRoute>
            <AddGoalPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/players/:playerId/goals/:goalId/edit"
        element={
          <ProtectedRoute>
            <EditGoalPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/players/:playerId/measurements/new"
        element={
          <ProtectedRoute>
            <AddMeasurementPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/coach/sessions"
        element={
          <CoachRoute>
            <CoachSessionsPage />
          </CoachRoute>
        }
      />
      <Route
        path="/coach/sessions/new"
        element={
          <CoachRoute>
            <CreateTrainingSessionPage />
          </CoachRoute>
        }
      />
      <Route
        path="/coach/sessions/:sessionId"
        element={
          <CoachRoute>
            <CoachSessionDetailPage />
          </CoachRoute>
        }
      />
      <Route
        path="/coach/sessions/:sessionId/edit"
        element={
          <CoachRoute>
            <EditTrainingSessionPage />
          </CoachRoute>
        }
      />
      <Route
        path="/coach/sessions/:sessionId/add-attendance"
        element={
          <CoachRoute>
            <AddAttendancePage />
          </CoachRoute>
        }
      />
      <Route
        path="/coach/sessions/:sessionId/edit-attendance/:attendanceId"
        element={
          <CoachRoute>
            <EditAttendancePage />
          </CoachRoute>
        }
      />
      <Route
        path="/coach/matches"
        element={
          <CoachRoute>
            <CoachMatchesPage />
          </CoachRoute>
        }
      />
      <Route
        path="/coach/matches/new"
        element={
          <CoachRoute>
            <CreateMatchPage />
          </CoachRoute>
        }
      />
      <Route
        path="/coach/matches/:matchId"
        element={
          <CoachRoute>
            <CoachMatchDetailPage />
          </CoachRoute>
        }
      />
      <Route
        path="/coach/matches/:matchId/edit"
        element={
          <CoachRoute>
            <EditMatchPage />
          </CoachRoute>
        }
      />
      <Route
        path="/coach/matches/:matchId/add-stats"
        element={
          <CoachRoute>
            <AddMatchPlayerStatsPage />
          </CoachRoute>
        }
      />
      <Route
        path="/coach/matches/:matchId/edit-stats/:statsId"
        element={
          <CoachRoute>
            <EditMatchPlayerStatsPage />
          </CoachRoute>
        }
      />
      <Route
        path="/coach/academies"
        element={
          <CoachRoute>
            <AcademiesPage />
          </CoachRoute>
        }
      />
      <Route
        path="/coach/academies/new"
        element={
          <AcademyAdminRoute>
            <CreateAcademyPage />
          </AcademyAdminRoute>
        }
      />
      <Route
        path="/coach/teams"
        element={
          <CoachRoute>
            <TeamsPage />
          </CoachRoute>
        }
      />
      <Route
        path="/coach/teams/new"
        element={
          <CoachRoute>
            <CreateTeamPage />
          </CoachRoute>
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
