import { type ReactNode } from 'react'
import { cn } from '../../lib/utils'

// ---------------------------------------------------------------------------
// Column definition
// ---------------------------------------------------------------------------

export interface Column<T> {
  /** Unique identifier for this column */
  key: string
  /** Header cell content */
  header: string
  /** Extra class names applied to the <th> */
  headerClassName?: string
  /** Extra class names applied to every <td> in this column */
  cellClassName?: string
  /** Render the cell content for a given row */
  render: (row: T, index: number) => ReactNode
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DataTableProps<T> {
  columns: Column<T>[]
  rows: T[]
  /** Returns a stable key for each row (used as React key + aria) */
  rowKey: (row: T) => string | number
  /** Called when a row is clicked — adds cursor-pointer + hover state */
  onRowClick?: (row: T) => void
  /** When true, renders animated skeleton rows instead of data */
  loading?: boolean
  /** Number of skeleton rows to show while loading (default: 5) */
  skeletonRows?: number
  /** Rendered when rows is empty and not loading */
  empty?: ReactNode
  className?: string
}

// ---------------------------------------------------------------------------
// Skeleton row
// ---------------------------------------------------------------------------

const SKELETON_WIDTHS = ['w-32', 'w-24', 'w-20', 'w-28', 'w-16', 'w-20']

function SkeletonRow({ cols }: { cols: number }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div
            className={cn(
              'h-4 animate-pulse rounded bg-cf-muted',
              SKELETON_WIDTHS[i % SKELETON_WIDTHS.length],
            )}
          />
        </td>
      ))}
    </tr>
  )
}

// ---------------------------------------------------------------------------
// DataTable
// ---------------------------------------------------------------------------

export default function DataTable<T,>({
  columns,
  rows,
  rowKey,
  onRowClick,
  loading = false,
  skeletonRows = 5,
  empty,
  className,
}: DataTableProps<T>) {
  const clickable = onRowClick != null

  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl ring-1 bg-cf-surface ring-cf-border',
        className,
      )}
    >
      <div className="overflow-x-auto">
        <table className="min-w-full">
          {/* Head */}
          <thead>
            <tr className="border-b border-cf-border bg-cf-muted">
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={cn(
                    'px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-cf-muted-foreground',
                    col.headerClassName,
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>

          {/* Body */}
          <tbody className="divide-y divide-cf-border">
            {loading ? (
              Array.from({ length: skeletonRows }).map((_, i) => (
                <SkeletonRow key={i} cols={columns.length} />
              ))
            ) : rows.length === 0 ? (
              empty != null ? (
                <tr>
                  <td colSpan={columns.length}>{empty}</td>
                </tr>
              ) : null
            ) : (
              rows.map((row, i) => (
                <tr
                  key={rowKey(row)}
                  onClick={clickable ? () => onRowClick(row) : undefined}
                  className={cn(
                    'transition-colors',
                    clickable && 'cursor-pointer hover:bg-cf-muted/50',
                  )}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn('px-4 py-3 text-sm', col.cellClassName)}
                    >
                      {col.render(row, i)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
