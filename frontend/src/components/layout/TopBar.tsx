import { Menu } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/utils'

interface TopBarProps {
  onMenuClick: () => void
}

export default function TopBar({ onMenuClick }: TopBarProps) {
  const { t } = useTranslation()

  return (
    <header className={cn(
      'no-print flex h-12 flex-shrink-0 items-center border-b',
      'bg-cf-surface border-cf-border px-4 md:px-6',
    )}>
      {/* Mobile hamburger */}
      <button
        onClick={onMenuClick}
        className="mr-3 flex h-8 w-8 items-center justify-center rounded-md text-cf-muted-foreground hover:bg-cf-muted hover:text-cf-surface-foreground md:hidden"
        aria-label={t('nav.openMenu')}
      >
        <Menu size={18} aria-hidden="true" />
      </button>
    </header>
  )
}
