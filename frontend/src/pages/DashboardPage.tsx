import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import AppNav from '../components/ui/AppNav'
import { useAuth } from '../context/AuthContext'

// ---------------------------------------------------------------------------
// Feature card data — titles and descriptions are translation keys.
// The cards are defined as module-level constants to avoid re-allocation on
// every render; t() is called at render time inside FeatureCard.
// ---------------------------------------------------------------------------

interface FeatureData {
  icon: string
  titleKey: string
  descriptionKey: string
  href: string
}

interface ComingSoonData {
  icon: string
  titleKey: string
  descriptionKey: string
}

const PLAYER_FEATURES: FeatureData[] = [
  {
    icon: '⚽',
    titleKey: 'dashboard.features.playerProfiles.title',
    descriptionKey: 'dashboard.features.playerProfiles.description',
    href: '/players',
  },
]

const PARENT_FEATURES: FeatureData[] = [
  {
    icon: '👨‍👧',
    titleKey: 'dashboard.features.myChildren.title',
    descriptionKey: 'dashboard.features.myChildren.description',
    href: '/players',
  },
]

const COACH_FEATURES: FeatureData[] = [
  {
    icon: '🏃',
    titleKey: 'dashboard.features.trainingSessions.title',
    descriptionKey: 'dashboard.features.trainingSessions.description',
    href: '/coach/sessions',
  },
  {
    icon: '🏆',
    titleKey: 'dashboard.features.matches.title',
    descriptionKey: 'dashboard.features.matches.description',
    href: '/coach/matches',
  },
  {
    icon: '📊',
    titleKey: 'dashboard.features.assessments.title',
    descriptionKey: 'dashboard.features.assessments.description',
    href: '/players',
  },
  {
    icon: '🎯',
    titleKey: 'dashboard.features.goals.title',
    descriptionKey: 'dashboard.features.goals.description',
    href: '/players',
  },
]

const COMING_SOON: ComingSoonData[] = [
  {
    icon: '📈',
    titleKey: 'dashboard.features.progressReports.title',
    descriptionKey: 'dashboard.features.progressReports.description',
  },
  {
    icon: '🏅',
    titleKey: 'dashboard.features.teamAverages.title',
    descriptionKey: 'dashboard.features.teamAverages.description',
  },
]

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function FeatureCard({
  icon,
  titleKey,
  descriptionKey,
  href,
  isAuthenticated,
}: FeatureData & { isAuthenticated: boolean }) {
  const navigate = useNavigate()
  const { t } = useTranslation()

  return (
    <button
      onClick={() => navigate(isAuthenticated ? href : '/login')}
      className="group rounded-2xl bg-white p-6 text-left shadow-sm ring-1 ring-gray-100 transition hover:shadow-md hover:ring-brand-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
    >
      <span className="text-2xl">{icon}</span>
      <h4 className="mt-3 font-semibold text-gray-900 group-hover:text-brand-700">
        {t(titleKey)}
      </h4>
      <p className="mt-1 text-sm text-gray-500 leading-relaxed">{t(descriptionKey)}</p>
      <p className="mt-3 text-xs font-semibold text-brand-600 group-hover:text-brand-700">
        {isAuthenticated ? t('dashboard.card.open') : t('dashboard.card.signInToOpen')}
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
  const { t } = useTranslation()

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
            {t('dashboard.hero.platformBadge')}
          </p>
          <h1 className="mt-3 text-3xl font-bold sm:text-4xl">
            {t('dashboard.hero.headline')}
          </h1>
          <p className="mt-4 max-w-xl text-gray-300 leading-relaxed">
            {t('dashboard.hero.subheadline')}
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            {isAuthenticated ? (
              <>
                <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm text-white ring-1 ring-white/20">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  {t('dashboard.hero.signedIn')}
                </div>
                <button
                  onClick={() => navigate('/players')}
                  className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-gray-900 transition hover:bg-gray-100"
                >
                  {isPlayer || isParent
                    ? t('dashboard.hero.myPlayers')
                    : t('dashboard.hero.viewPlayers')}
                </button>
                {isCoach && (
                  <>
                    <button
                      onClick={() => navigate('/coach/sessions')}
                      className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-white ring-1 ring-white/20 transition hover:bg-white/20"
                    >
                      {t('dashboard.hero.trainingSessions')}
                    </button>
                    <button
                      onClick={() => navigate('/coach/matches')}
                      className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-white ring-1 ring-white/20 transition hover:bg-white/20"
                    >
                      {t('dashboard.hero.matches')}
                    </button>
                  </>
                )}
              </>
            ) : (
              <>
                <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm text-white ring-1 ring-white/20">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                  {t('dashboard.hero.platformLive')}
                </div>
                <button
                  onClick={() => navigate('/login')}
                  className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-gray-900 transition hover:bg-gray-100"
                >
                  {t('dashboard.hero.signInCta')}
                </button>
              </>
            )}
          </div>
        </section>

        {/* ── Parent: My Children ── */}
        {isParent && (
          <section>
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-gray-400">
              {t('dashboard.sections.myChildren')}
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {PARENT_FEATURES.map((f) => (
                <FeatureCard key={f.titleKey} {...f} isAuthenticated={isAuthenticated} />
              ))}
            </div>
          </section>
        )}

        {/* ── Players ── */}
        {!isParent && (
          <section>
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-gray-400">
              {t('dashboard.sections.players')}
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {PLAYER_FEATURES.map((f) => (
                <FeatureCard key={f.titleKey} {...f} isAuthenticated={isAuthenticated} />
              ))}
            </div>
          </section>
        )}

        {/* ── Coach tools ── */}
        {(isCoach || !isAuthenticated) && (
          <section>
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-gray-400">
              {t('dashboard.sections.coachTools')}
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {COACH_FEATURES.map((f) => (
                <FeatureCard key={f.titleKey} {...f} isAuthenticated={isAuthenticated} />
              ))}
            </div>
          </section>
        )}

        {/* ── Coming soon ── */}
        <section>
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-gray-400">
            {t('dashboard.sections.comingNext')}
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {COMING_SOON.map((f) => (
              <div
                key={f.titleKey}
                className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100 opacity-60"
              >
                <span className="text-2xl">{f.icon}</span>
                <h4 className="mt-3 font-semibold text-gray-700">{t(f.titleKey)}</h4>
                <p className="mt-1 text-sm text-gray-400 leading-relaxed">
                  {t(f.descriptionKey)}
                </p>
              </div>
            ))}
          </div>
        </section>

      </main>
    </div>
  )
}
