import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

interface AppNavProps {
  /** Breadcrumb label shown after the CF logo */
  label?: string
}

export default function AppNav({ label }: AppNavProps) {
  const navigate = useNavigate()
  const { isAuthenticated, logout } = useAuth()

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <header className="sticky top-0 z-20 border-b border-gray-100 bg-white/90 shadow-sm backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
        {/* Left: logo + breadcrumb */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-600 text-sm font-bold text-white transition hover:bg-brand-700"
            aria-label="Go to dashboard"
          >
            CF
          </button>
          {label && (
            <>
              <span className="text-gray-300">/</span>
              <span className="text-sm text-gray-500">{label}</span>
            </>
          )}
        </div>

        {/* Right: auth-aware actions */}
        {isAuthenticated ? (
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/players')}
              className="text-sm text-gray-500 transition hover:text-gray-800"
            >
              Players
            </button>
            <button
              onClick={handleLogout}
              className="text-xs text-gray-400 transition hover:text-gray-600"
            >
              Sign out
            </button>
          </div>
        ) : (
          <button
            onClick={() => navigate('/login')}
            className="rounded-xl bg-brand-600 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-700"
          >
            Sign in
          </button>
        )}
      </div>
    </header>
  )
}
