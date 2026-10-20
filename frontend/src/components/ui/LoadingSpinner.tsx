import { useTranslation } from 'react-i18next'

export default function LoadingSpinner() {
  const { t } = useTranslation()

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-cf-border border-t-emerald-500" />
        <p className="text-sm text-cf-muted-foreground">{t('common.loading')}</p>
      </div>
    </div>
  )
}
