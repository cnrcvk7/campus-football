import { useTranslation } from 'react-i18next'

export default function LoadingSpinner() {
  const { t } = useTranslation()

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-brand-500" />
        <p className="text-sm text-gray-400">{t('common.loading')}</p>
      </div>
    </div>
  )
}
