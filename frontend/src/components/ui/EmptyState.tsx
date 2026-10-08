interface EmptyStateProps {
  icon?: string
  title: string
  description?: string
}

export default function EmptyState({ icon = '📋', title, description }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl bg-gray-50 px-6 py-12 text-center ring-1 ring-gray-100">
      <span className="text-3xl">{icon}</span>
      <p className="mt-3 font-medium text-gray-700">{title}</p>
      {description && <p className="mt-1 text-sm text-gray-400">{description}</p>}
    </div>
  )
}
