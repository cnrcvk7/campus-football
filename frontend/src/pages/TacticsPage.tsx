import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ClipboardList, Trophy } from 'lucide-react'
import PageHeader from '../components/ui/PageHeader'

export default function TacticsPage() {
  const { t } = useTranslation()

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        title={t('tactics.pageTitle')}
        subtitle={t('tactics.pageSubtitle')}
      />

      <div className="mt-6 rounded-xl bg-cf-surface p-6 text-center ring-1 ring-cf-border">
        <ClipboardList size={32} className="mx-auto mb-3 text-cf-muted-foreground" />
        <h2 className="text-sm font-semibold text-cf-surface-foreground">
          {t('tactics.boardsComingSoon')}
        </h2>
        <p className="mt-1 text-sm text-cf-muted-foreground">
          {t('tactics.boardsComingSoonDesc')}
        </p>
        <Link
          to="/coach/matches"
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-cf-brand hover:underline"
        >
          <Trophy size={14} />
          {t('tactics.goToMatches')}
        </Link>
      </div>
    </div>
  )
}
