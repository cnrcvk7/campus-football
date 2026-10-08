import { useNavigate } from 'react-router-dom'
import AppNav from '../components/ui/AppNav'
import StatCard from '../components/ui/StatCard'
import { useAuth } from '../context/AuthContext'

const LIVE_FEATURES = [
  {
    icon: '⚽',
    title: 'Player Profiles',
    description: 'Permanent Football ID and complete player history across academies.',
    href: '/players',
  },
]

const COMING_SOON_FEATURES = [
  { icon: '📊', title: 'Development Tracking', description: 'Technical, tactical, physical, and mental assessments over time.' },
  { icon: '🎯', title: 'Development Goals', description: 'Coach-set goals with milestones and achievement tracking.' },
  { icon: '📅', title: 'Training & Attendance', description: 'Session logs and attendance records for every player.' },
  { icon: '🏆', title: 'Match Statistics', description: 'Goals, assists, minutes played, and more per match.' },
  { icon: '📈', title: 'Progress Reports', description: 'Monthly summaries and team comparison insights.' },
]

export default function DashboardPage() {
  const navigate = useNavigate()
  const { isAuthenticated } = useAuth()

  return (
    <div className="min-h-screen bg-gray-50">
      <AppNav />

      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 space-y-12">
        {/* Hero */}
        <section className="rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 px-8 py-12 text-white">
          <p className="text-sm font-semibold uppercase tracking-widest text-brand-200">
            Foundation — v0.1
          </p>
          <h2 className="mt-3 text-3xl font-bold sm:text-4xl">
            The player is at the centre<br />of everything.
          </h2>
          <p className="mt-4 max-w-xl text-brand-100 leading-relaxed">
            Every player carries a permanent Football ID and a complete development history —
            across every academy, team, coach, and season. Campus Football is being built
            from the ground up to put the player first.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            {isAuthenticated ? (
              <>
                <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm text-white ring-1 ring-white/20">
                  <span className="h-2 w-2 rounded-full bg-green-400" />
                  Signed in — platform ready
                </div>
                <button
                  onClick={() => navigate('/players')}
                  className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-brand-700 transition hover:bg-brand-50"
                >
                  View Players →
                </button>
              </>
            ) : (
              <>
                <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm text-white ring-1 ring-white/20">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-green-400" />
                  API is running — sign in to get started
                </div>
                <button
                  onClick={() => navigate('/login')}
                  className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-brand-700 transition hover:bg-brand-50"
                >
                  Sign in →
                </button>
              </>
            )}
          </div>
        </section>

        {/* Stats */}
        <section>
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-widest text-gray-400">
            Platform Status
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Backend" value="Online" description="Django REST Framework" />
            <StatCard label="Database" value="Ready" description="PostgreSQL 16" />
            <StatCard label="Frontend" value="Running" description="React + Vite + Tailwind" />
            <StatCard label="Version" value="0.1.0" description="Foundation complete" />
          </div>
        </section>

        {/* Live features */}
        <section>
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-widest text-gray-400">
            Available Now
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {LIVE_FEATURES.map((feature) => (
              <button
                key={feature.title}
                onClick={() => navigate(feature.href)}
                className="group rounded-2xl bg-white p-6 text-left shadow-sm ring-1 ring-gray-100 transition hover:shadow-md hover:ring-brand-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
              >
                <span className="text-2xl">{feature.icon}</span>
                <h4 className="mt-3 font-semibold text-gray-900 group-hover:text-brand-700">
                  {feature.title}
                </h4>
                <p className="mt-1 text-sm text-gray-500 leading-relaxed">
                  {feature.description}
                </p>
                <p className="mt-3 text-xs font-semibold text-brand-600 group-hover:text-brand-700">
                  {isAuthenticated ? 'Open →' : 'Sign in to open →'}
                </p>
              </button>
            ))}
          </div>
        </section>

        {/* Coming soon */}
        <section>
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-widest text-gray-400">
            Coming in the Next Phases
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {COMING_SOON_FEATURES.map((feature) => (
              <div
                key={feature.title}
                className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100"
              >
                <span className="text-2xl">{feature.icon}</span>
                <h4 className="mt-3 font-semibold text-gray-900">{feature.title}</h4>
                <p className="mt-1 text-sm text-gray-500 leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}
