import { useNavigate } from 'react-router-dom'
import AppNav from '../components/ui/AppNav'
import { useAuth } from '../context/AuthContext'

// ---------------------------------------------------------------------------
// Feature cards data
// ---------------------------------------------------------------------------

const PLAYER_FEATURES = [
  {
    icon: '⚽',
    title: 'Player Profiles',
    description: 'Permanent Football ID, development history, match stats, and training records — all in one place.',
    href: '/players',
  },
]

const PARENT_FEATURES = [
  {
    icon: '👨‍👧',
    title: 'My Children',
    description: 'View your child\'s player profile, development report, training attendance, and match history.',
    href: '/players',
  },
]

const COACH_FEATURES = [
  {
    icon: '🏃',
    title: 'Training Sessions',
    description: 'Create and manage sessions with exercises, focus skills, location, and attendance tracking.',
    href: '/coach/sessions',
  },
  {
    icon: '🏆',
    title: 'Matches',
    description: 'Record match results and log per-player stats: goals, assists, passes, tackles, ratings, and more.',
    href: '/coach/matches',
  },
  {
    icon: '📊',
    title: 'Development Assessments',
    description: 'Technical, tactical, physical, and mental scores tracked over time. Access via a player profile.',
    href: '/players',
  },
  {
    icon: '🎯',
    title: 'Development Goals',
    description: 'Coach-set goals with milestones and achievement tracking. Access via a player profile.',
    href: '/players',
  },
]

const COMING_SOON = [
  { icon: '📈', title: 'Progress Reports', description: 'Monthly summaries and team comparison insights.' },
  { icon: '🏅', title: 'Team Averages', description: 'Computed-at-query-time team benchmarks across all metrics.' },
]

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function FeatureCard({
  icon,
  title,
  description,
  href,
  isAuthenticated,
}: {
  icon: string
  title: string
  description: string
  href: string
  isAuthenticated: boolean
}) {
  const navigate = useNavigate()
  return (
    <button
      onClick={() => navigate(isAuthenticated ? href : '/login')}
      className="group rounded-2xl bg-white p-6 text-left shadow-sm ring-1 ring-gray-100 transition hover:shadow-md hover:ring-brand-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
    >
      <span className="text-2xl">{icon}</span>
      <h4 className="mt-3 font-semibold text-gray-900 group-hover:text-brand-700">{title}</h4>
      <p className="mt-1 text-sm text-gray-500 leading-relaxed">{description}</p>
      <p className="mt-3 text-xs font-semibold text-brand-600 group-hover:text-brand-700">
        {isAuthenticated ? 'Open →' : 'Sign in to open →'}
      </p>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const navigate = useNavigate()
  const { isAuthenticated, user } = useAuth()

  const isCoach = user?.role === 'COACH' || user?.role === 'ACADEMY_ADMIN'
  const isParent = user?.role === 'PARENT'
  const isPlayer = user?.role === 'PLAYER'

  return (
    <div className="min-h-screen bg-gray-50">
      <AppNav />

      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 space-y-12">

        {/* ── Hero ── */}
        <section className="rounded-2xl bg-gradient-to-br from-gray-900 via-gray-800 to-brand-900 px-8 py-12 text-white">
          <p className="text-sm font-semibold uppercase tracking-widest text-brand-300">
            Campus Football
          </p>
          <h1 className="mt-3 text-3xl font-bold sm:text-4xl">
            The player is at the centre<br className="hidden sm:block" /> of everything.
          </h1>
          <p className="mt-4 max-w-xl text-gray-300 leading-relaxed">
            Every player carries a permanent Football ID and a complete development history —
            across every academy, team, coach, and season.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            {isAuthenticated ? (
              <>
                <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm text-white ring-1 ring-white/20">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  Signed in
                </div>
                <button
                  onClick={() => navigate('/players')}
                  className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-gray-900 transition hover:bg-gray-100"
                >
                  {isPlayer || isParent ? 'My Players →' : 'View Players →'}
                </button>
                {isCoach && (
                  <>
                    <button
                      onClick={() => navigate('/coach/sessions')}
                      className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-white ring-1 ring-white/20 transition hover:bg-white/20"
                    >
                      Training Sessions
                    </button>
                    <button
                      onClick={() => navigate('/coach/matches')}
                      className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-white ring-1 ring-white/20 transition hover:bg-white/20"
                    >
                      Matches
                    </button>
                  </>
                )}
              </>
            ) : (
              <>
                <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm text-white ring-1 ring-white/20">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                  Platform is live
                </div>
                <button
                  onClick={() => navigate('/login')}
                  className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-gray-900 transition hover:bg-gray-100"
                >
                  Sign in →
                </button>
              </>
            )}
          </div>
        </section>

        {/* ── Parent: My Children ── */}
        {isParent && (
          <section>
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-gray-400">
              My Children
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {PARENT_FEATURES.map((f) => (
                <FeatureCard key={f.title} {...f} isAuthenticated={isAuthenticated} />
              ))}
            </div>
          </section>
        )}

        {/* ── Players ── */}
        {!isParent && (
          <section>
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-gray-400">
              Players
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {PLAYER_FEATURES.map((f) => (
                <FeatureCard key={f.title} {...f} isAuthenticated={isAuthenticated} />
              ))}
            </div>
          </section>
        )}

        {/* ── Coach tools ── */}
        {(isCoach || !isAuthenticated) && (
          <section>
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-gray-400">
              Coach Tools
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {COACH_FEATURES.map((f) => (
                <FeatureCard key={f.title} {...f} isAuthenticated={isAuthenticated} />
              ))}
            </div>
          </section>
        )}

        {/* ── Coming soon ── */}
        <section>
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-gray-400">
            Coming Next
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {COMING_SOON.map((f) => (
              <div
                key={f.title}
                className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100 opacity-60"
              >
                <span className="text-2xl">{f.icon}</span>
                <h4 className="mt-3 font-semibold text-gray-700">{f.title}</h4>
                <p className="mt-1 text-sm text-gray-400 leading-relaxed">{f.description}</p>
              </div>
            ))}
          </div>
        </section>

      </main>
    </div>
  )
}
