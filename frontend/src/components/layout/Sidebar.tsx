import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  LayoutDashboard,
  Users,
  Building2,
  UsersRound,
  CalendarDays,
  Trophy,
  GraduationCap,
  X,
  LogOut,
  Globe,
  Moon,
  Sun,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useTheme } from '../../context/ThemeContext'
import { cn } from '../../lib/utils'
import { LANGUAGE_STORAGE_KEY, SUPPORTED_LANGUAGES } from '../../i18n/storage'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NavItem {
  labelKey: string
  path: string
  icon: React.ReactNode
  /** Match any path that starts with this prefix (for detail routes) */
  matchPrefix?: string
}

interface NavGroup {
  sectionKey?: string   // i18n key for section heading; omit for no heading
  items: NavItem[]
}

// ---------------------------------------------------------------------------
// Language labels
// ---------------------------------------------------------------------------

const LANGUAGE_LABELS: Record<(typeof SUPPORTED_LANGUAGES)[number], string> = {
  en: 'EN',
  tr: 'TR',
  ru: 'RU',
}

// ---------------------------------------------------------------------------
// Single nav link
// ---------------------------------------------------------------------------

function SidebarLink({ item }: { item: NavItem }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { t } = useTranslation()

  const isActive = item.matchPrefix
    ? pathname === item.path || pathname.startsWith(item.matchPrefix)
    : pathname === item.path

  return (
    <button
      onClick={() => navigate(item.path)}
      className={cn(
        'flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
        isActive
          ? 'bg-cf-nav-active text-cf-nav-active-fg'
          : 'text-cf-nav-muted hover:bg-white/10 hover:text-cf-nav-foreground',
      )}
    >
      <span className="flex-shrink-0">{item.icon}</span>
      <span className="truncate">{t(item.labelKey)}</span>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Sidebar component
// ---------------------------------------------------------------------------

interface SidebarProps {
  /** Mobile: whether the drawer is open */
  open: boolean
  /** Mobile: callback to close the drawer */
  onClose: () => void
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const { user, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()

  const isCoach = user?.role === 'COACH' || user?.role === 'ACADEMY_ADMIN'

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  function handleLanguageChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const lng = e.target.value
    void i18n.changeLanguage(lng)
    localStorage.setItem(LANGUAGE_STORAGE_KEY, lng)
  }

  // ── Nav groups ────────────────────────────────────────────────────────────

  const NAV_GROUPS: NavGroup[] = [
    {
      sectionKey: 'nav.sectionOverview',
      items: [
        {
          labelKey: 'nav.dashboard',
          path: '/',
          icon: <LayoutDashboard size={16} aria-hidden="true" />,
        },
      ],
    },
    {
      sectionKey: 'nav.sectionPlayers',
      items: [
        {
          labelKey: 'nav.players',
          path: '/players',
          icon: <Users size={16} aria-hidden="true" />,
          matchPrefix: '/players',
        },
      ],
    },
    ...(isCoach
      ? [
          {
            sectionKey: 'nav.sectionAcademy' as const,
            items: [
              {
                labelKey: 'nav.academies',
                path: '/coach/academies',
                icon: <Building2 size={16} aria-hidden="true" />,
                matchPrefix: '/coach/academies',
              },
              {
                labelKey: 'nav.teams',
                path: '/coach/teams',
                icon: <UsersRound size={16} aria-hidden="true" />,
                matchPrefix: '/coach/teams',
              },
            ],
          },
          {
            sectionKey: 'nav.sectionTraining' as const,
            items: [
              {
                labelKey: 'nav.training',
                path: '/coach/sessions',
                icon: <GraduationCap size={16} aria-hidden="true" />,
                matchPrefix: '/coach/sessions',
              },
              {
                labelKey: 'nav.schedule',
                path: '/coach/schedule',
                icon: <CalendarDays size={16} aria-hidden="true" />,
              },
              {
                labelKey: 'nav.matches',
                path: '/coach/matches',
                icon: <Trophy size={16} aria-hidden="true" />,
                matchPrefix: '/coach/matches',
              },
            ],
          },
        ]
      : []),
  ]

  // ── Sidebar content ───────────────────────────────────────────────────────

  const sidebarContent = (
    <div className="flex h-full flex-col bg-cf-nav">
      {/* Logo + close (mobile) */}
      <div className="flex items-center justify-between px-4 py-4">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2.5"
          aria-label={t('nav.goToDashboard')}
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-500 text-xs font-bold text-white">
            CF
          </span>
          <span className="text-sm font-semibold text-cf-nav-foreground">Campus Football</span>
        </button>
        {/* Close button — mobile only */}
        <button
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded-md text-cf-nav-muted hover:text-cf-nav-foreground md:hidden"
          aria-label={t('nav.closeMenu')}
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      {/* Nav groups */}
      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        {NAV_GROUPS.map((group, gi) => (
          <div key={gi} className={gi > 0 ? 'mt-5' : ''}>
            {group.sectionKey && (
              <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-cf-nav-muted">
                {t(group.sectionKey)}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <SidebarLink key={item.path} item={item} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom: user + controls */}
      <div className="border-t border-cf-nav-border px-3 py-3 space-y-2">
        {/* User info */}
        {user && (
          <div className="flex items-center gap-2.5 px-1 py-1">
            <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-medium text-emerald-400">
              {user.first_name?.[0]?.toUpperCase() ?? user.email[0].toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-cf-nav-foreground">
                {user.first_name ? `${user.first_name} ${user.last_name}` : user.email}
              </p>
              <p className="truncate text-[10px] text-cf-nav-muted">{user.role}</p>
            </div>
          </div>
        )}

        {/* Controls row */}
        <div className="flex items-center gap-1 px-1">
          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            aria-label={theme === 'light' ? t('theme.switchToDark') : t('theme.switchToLight')}
            className="flex h-7 w-7 items-center justify-center rounded-md text-cf-nav-muted transition hover:bg-white/10 hover:text-cf-nav-foreground"
          >
            {theme === 'light'
              ? <Moon size={14} aria-hidden="true" />
              : <Sun size={14} aria-hidden="true" />}
          </button>

          {/* Language selector */}
          <div className="flex items-center gap-0.5 text-cf-nav-muted">
            <Globe size={12} aria-hidden="true" className="shrink-0" />
            <select
              value={i18n.language}
              onChange={handleLanguageChange}
              aria-label={t('language.ariaLabel')}
              className="cursor-pointer rounded border-0 bg-transparent text-xs text-cf-nav-muted outline-none transition hover:text-cf-nav-foreground focus:ring-0"
            >
              {SUPPORTED_LANGUAGES.map((lng) => (
                <option key={lng} value={lng} className="bg-gray-900 text-gray-100">
                  {LANGUAGE_LABELS[lng]}
                </option>
              ))}
            </select>
          </div>

          {/* Sign out (pushed right) */}
          <button
            onClick={handleLogout}
            className="ml-auto flex items-center gap-1 text-xs text-cf-nav-muted transition hover:text-cf-nav-foreground"
          >
            <LogOut size={13} aria-hidden="true" />
            {t('nav.signOut')}
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop sidebar — always visible */}
      <aside className="no-print hidden w-60 flex-shrink-0 md:flex md:flex-col border-r border-cf-nav-border">
        {sidebarContent}
      </aside>

      {/* Mobile drawer overlay */}
      {open && (
        <div className="no-print fixed inset-0 z-40 md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={onClose}
            aria-hidden="true"
          />
          {/* Drawer */}
          <aside className="absolute inset-y-0 left-0 w-60 flex flex-col shadow-xl">
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  )
}
