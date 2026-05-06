import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { z } from 'zod'
import {
  ArrowLeftRight,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BadgeDollarSign,
  Car,
  CircleHelp,
  Clapperboard,
  Filter,
  HeartPulse,
  Home,
  Landmark,
  Plane,
  Receipt,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Utensils,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { getTransactionsData, setTransactionCategory, syncNow } from '../server-functions'
import { formatDate, formatMoney } from '../lib/format'
import styles from './page.module.scss'

export const Route = createFileRoute('/transactions')({
  validateSearch: z.object({
    search: z.string().optional(),
    accountId: z.string().optional(),
    connectionId: z.string().optional(),
    categoryId: z.string().optional(),
    pending: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    minAmount: z.coerce.number().optional(),
    maxAmount: z.coerce.number().optional(),
    page: z.coerce.number().optional(),
    pageSize: z.coerce.number().optional(),
    sortBy: z.string().optional(),
    sortDir: z.string().optional(),
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => getTransactionsData({
    data: {
      search: deps.search,
      accountId: deps.accountId,
      connectionId: deps.connectionId,
      categoryId: deps.categoryId === 'uncategorized'
        ? null
        : deps.categoryId ? Number(deps.categoryId) : undefined,
      pending: deps.pending,
      startDate: deps.startDate,
      endDate: deps.endDate,
      minAmount: deps.minAmount,
      maxAmount: deps.maxAmount,
      page: deps.page,
      pageSize: deps.pageSize,
      sortBy: deps.sortBy,
      sortDir: deps.sortDir,
    },
  }),
  component: TransactionsPage,
})

function TransactionsPage() {
  const router = useRouter()
  const data = Route.useLoaderData()
  const params = Route.useSearch()
  const [search, setSearch] = useState(params.search ?? '')
  const [accountId, setAccountId] = useState(params.accountId ?? '')
  const [connectionId, setConnectionId] = useState(params.connectionId ?? '')
  const [categoryId, setCategoryId] = useState(params.categoryId ?? '')
  const [pending, setPending] = useState(params.pending ?? '')
  const [startDate, setStartDate] = useState(params.startDate ?? '')
  const [endDate, setEndDate] = useState(params.endDate ?? '')
  const [minAmount, setMinAmount] = useState(params.minAmount == null ? '' : String(params.minAmount))
  const [maxAmount, setMaxAmount] = useState(params.maxAmount == null ? '' : String(params.maxAmount))
  const [openFilter, setOpenFilter] = useState<string | null>(null)
  const [editingCategoryFor, setEditingCategoryFor] = useState<string | null>(null)
  const page = data.transactions.page
  const pageSize = data.transactions.pageSize
  const pageCount = data.transactions.pageCount
  const total = data.transactions.total

  const navigateWith = (next: Partial<typeof params>) => {
    void router.navigate({
      to: '/transactions',
      search: {
        ...params,
        ...next,
      },
    })
  }
  const applyFilters = (next: Partial<typeof params>) => {
    void router.navigate({
      to: '/transactions',
      search: {
        ...params,
        ...next,
        page: 1,
      },
    })
    setOpenFilter(null)
  }
  const paginationControls = (
    <div className={styles.tableControls}>
      <span className={styles.paginationSummary}>
        Showing {total ? ((page - 1) * pageSize) + 1 : 0}-{Math.min(page * pageSize, total)} of {total}
      </span>
      <label className={styles.pageSizeControl}>
        <span>Rows</span>
        <select
          className={styles.field}
          value={pageSize}
          onChange={(event) => navigateWith({ pageSize: Number(event.target.value), page: 1 })}
        >
          {[10, 25, 50, 100].map((size) => (
            <option key={size} value={size}>{size} per page</option>
          ))}
        </select>
      </label>
      <div className={styles.paginationButtons}>
        <button className={styles.secondaryButton} disabled={page <= 1} type="button" onClick={() => navigateWith({ page: 1 })}>First</button>
        <button className={styles.secondaryButton} disabled={page <= 1} type="button" onClick={() => navigateWith({ page: page - 1 })}>Prev</button>
        <span className={styles.pageStatus}>Page {page} of {pageCount}</span>
        <button className={styles.secondaryButton} disabled={page >= pageCount} type="button" onClick={() => navigateWith({ page: page + 1 })}>Next</button>
        <button className={styles.secondaryButton} disabled={page >= pageCount} type="button" onClick={() => navigateWith({ page: pageCount })}>Last</button>
      </div>
    </div>
  )

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>All institutions</p>
          <h1 className={styles.heading}>Transactions</h1>
        </div>
        <button className={styles.button} type="button" onClick={() => void syncNow().then(() => router.invalidate())}>
          Sync now
        </button>
      </header>

      {paginationControls}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <SortableHeader
                activeFilter={Boolean(params.startDate || params.endDate)}
                activeSortBy={data.transactions.sortBy}
                activeSortDir={data.transactions.sortDir}
                filterKey="date"
                label="Date"
                openFilter={openFilter}
                sortBy="date"
                onFilterToggle={setOpenFilter}
                onSort={(sortBy, sortDir) => navigateWith({ sortBy, sortDir, page: 1 })}
              >
                <FilterPopover title="Date range" onClose={() => setOpenFilter(null)} onClear={() => {
                  setStartDate('')
                  setEndDate('')
                  applyFilters({ startDate: undefined, endDate: undefined })
                }} onSubmit={() => applyFilters({ startDate: startDate || undefined, endDate: endDate || undefined })}>
                  <label><span>Start date</span><input className={styles.field} type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
                  <label><span>End date</span><input className={styles.field} type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label>
                </FilterPopover>
              </SortableHeader>
              <SortableHeader
                activeFilter={Boolean(params.search || params.pending)}
                activeSortBy={data.transactions.sortBy}
                activeSortDir={data.transactions.sortDir}
                filterKey="description"
                label="Description"
                openFilter={openFilter}
                sortBy="description"
                onFilterToggle={setOpenFilter}
                onSort={(sortBy, sortDir) => navigateWith({ sortBy, sortDir, page: 1 })}
              >
                <FilterPopover title="Description" onClose={() => setOpenFilter(null)} onClear={() => {
                  setSearch('')
                  setPending('')
                  applyFilters({ search: undefined, pending: undefined })
                }} onSubmit={() => applyFilters({ search: search || undefined, pending: pending || undefined })}>
                  <label><span>Search</span><input className={styles.field} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Merchant or memo" /></label>
                  <label>
                    <span>Status</span>
                    <select className={styles.field} value={pending} onChange={(event) => setPending(event.target.value)}>
                      <option value="">Posted and pending</option>
                      <option value="posted">Posted only</option>
                      <option value="pending">Pending only</option>
                    </select>
                  </label>
                </FilterPopover>
              </SortableHeader>
              <SortableHeader
                activeFilter={Boolean(params.accountId)}
                activeSortBy={data.transactions.sortBy}
                activeSortDir={data.transactions.sortDir}
                filterKey="account"
                label="Account"
                openFilter={openFilter}
                sortBy="account"
                onFilterToggle={setOpenFilter}
                onSort={(sortBy, sortDir) => navigateWith({ sortBy, sortDir, page: 1 })}
              >
                <FilterPopover title="Account" onClose={() => setOpenFilter(null)} onClear={() => {
                  setAccountId('')
                  applyFilters({ accountId: undefined })
                }} onSubmit={() => applyFilters({ accountId: accountId || undefined })}>
                  <label>
                    <span>Account</span>
                    <select className={styles.field} value={accountId} onChange={(event) => setAccountId(event.target.value)}>
                      <option value="">All accounts</option>
                      {data.accounts.map((account) => (
                        <option key={account.id} value={account.id}>{account.name}</option>
                      ))}
                    </select>
                  </label>
                </FilterPopover>
              </SortableHeader>
              <SortableHeader
                activeFilter={Boolean(params.connectionId)}
                activeSortBy={data.transactions.sortBy}
                activeSortDir={data.transactions.sortDir}
                filterKey="institution"
                label="Institution"
                openFilter={openFilter}
                sortBy="institution"
                onFilterToggle={setOpenFilter}
                onSort={(sortBy, sortDir) => navigateWith({ sortBy, sortDir, page: 1 })}
              >
                <FilterPopover title="Institution" onClose={() => setOpenFilter(null)} onClear={() => {
                  setConnectionId('')
                  applyFilters({ connectionId: undefined })
                }} onSubmit={() => applyFilters({ connectionId: connectionId || undefined })}>
                  <label>
                    <span>Institution</span>
                    <select className={styles.field} value={connectionId} onChange={(event) => setConnectionId(event.target.value)}>
                      <option value="">All institutions</option>
                      {getInstitutions(data.accounts).map((institution) => (
                        <option key={institution.id} value={institution.id}>{institution.name}</option>
                      ))}
                    </select>
                  </label>
                </FilterPopover>
              </SortableHeader>
              <SortableHeader
                activeFilter={Boolean(params.categoryId)}
                activeSortBy={data.transactions.sortBy}
                activeSortDir={data.transactions.sortDir}
                filterKey="category"
                label="Category"
                openFilter={openFilter}
                sortBy="category"
                onFilterToggle={setOpenFilter}
                onSort={(sortBy, sortDir) => navigateWith({ sortBy, sortDir, page: 1 })}
              >
                <FilterPopover title="Category" onClose={() => setOpenFilter(null)} onClear={() => {
                  setCategoryId('')
                  applyFilters({ categoryId: undefined })
                }} onSubmit={() => applyFilters({ categoryId: categoryId || undefined })}>
                  <label>
                    <span>Category</span>
                    <select className={styles.field} value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
                      <option value="">All categories</option>
                      <option value="uncategorized">Uncategorized</option>
                      {data.categories.map((category) => (
                        <option key={category.id} value={category.id}>{category.name}</option>
                      ))}
                    </select>
                  </label>
                </FilterPopover>
              </SortableHeader>
              <SortableHeader
                activeFilter={Boolean(params.minAmount != null || params.maxAmount != null)}
                activeSortBy={data.transactions.sortBy}
                activeSortDir={data.transactions.sortDir}
                filterKey="amount"
                label="Amount"
                openFilter={openFilter}
                sortBy="amount"
                onFilterToggle={setOpenFilter}
                onSort={(sortBy, sortDir) => navigateWith({ sortBy, sortDir, page: 1 })}
              >
                <FilterPopover title="Amount range" onClose={() => setOpenFilter(null)} onClear={() => {
                  setMinAmount('')
                  setMaxAmount('')
                  applyFilters({ minAmount: undefined, maxAmount: undefined })
                }} onSubmit={() => applyFilters({ minAmount: minAmount ? Number(minAmount) : undefined, maxAmount: maxAmount ? Number(maxAmount) : undefined })}>
                  <label><span>Min amount</span><input className={styles.field} inputMode="decimal" value={minAmount} onChange={(event) => setMinAmount(event.target.value)} placeholder="-100.00" /></label>
                  <label><span>Max amount</span><input className={styles.field} inputMode="decimal" value={maxAmount} onChange={(event) => setMaxAmount(event.target.value)} placeholder="100.00" /></label>
                </FilterPopover>
              </SortableHeader>
            </tr>
          </thead>
          <tbody>
            {data.transactions.rows.map((transaction) => (
              <tr key={transaction.id}>
                <td data-label="Date">{formatDate(transaction.postedAt)}</td>
                <td data-label="Description">
                  {transaction.description}
                  {transaction.pending ? <span className={styles.pill}>Pending</span> : null}
                </td>
                <td data-label="Account">{transaction.accountName}</td>
                <td data-label="Institution">{transaction.connectionName}</td>
                <td data-label="Category">
                  {editingCategoryFor === transaction.id ? (
                    <select
                      autoFocus
                      className={`${styles.field} ${styles.categorySelect}`}
                      value={transaction.categoryId ?? ''}
                      onBlur={() => setEditingCategoryFor(null)}
                      onChange={(event) => {
                        const value = event.target.value
                        setEditingCategoryFor(null)
                        void setTransactionCategory({
                          data: {
                            transactionId: transaction.id,
                            categoryId: value ? Number(value) : null,
                          },
                        }).then(() => router.invalidate())
                      }}
                    >
                      <option value="">Uncategorized</option>
                      {data.categories.map((category) => (
                        <option key={category.id} value={category.id}>{category.name}</option>
                      ))}
                    </select>
                  ) : (
                    <CategoryChip
                      color={data.categories.find((category) => category.id === transaction.categoryId)?.color}
                      confidence={transaction.categoryConfidence}
                      name={transaction.categoryName ?? 'Uncategorized'}
                      onClick={() => setEditingCategoryFor(transaction.id)}
                      reason={transaction.categoryReason}
                      source={transaction.categorySource}
                    />
                  )}
                </td>
                <td data-label="Amount" className={transaction.amount < 0 ? styles.negative : styles.positive}>
                  {formatMoney(transaction.amount, transaction.currency)}
                </td>
              </tr>
            ))}
            {!data.transactions.rows.length ? (
              <tr className={styles.emptyTableRow}><td colSpan={6}>No matching transactions.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function getInstitutions(accounts: Array<{ connectionId: string; connectionName: string | null }>) {
  const institutions = new Map<string, string>()
  for (const account of accounts) {
    institutions.set(account.connectionId, account.connectionName ?? account.connectionId)
  }
  return [...institutions.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

function SortableHeader({
  activeFilter,
  activeSortBy,
  activeSortDir,
  children,
  filterKey,
  label,
  onFilterToggle,
  onSort,
  openFilter,
  sortBy,
}: {
  activeFilter: boolean
  activeSortBy: string
  activeSortDir: string
  children: ReactNode
  filterKey: string
  label: string
  onFilterToggle: (key: string | null) => void
  onSort: (sortBy: string, sortDir: string) => void
  openFilter: string | null
  sortBy: string
}) {
  const active = activeSortBy === sortBy
  const nextDirection = active && activeSortDir === 'asc' ? 'desc' : 'asc'
  const SortIcon = active ? (activeSortDir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown
  return (
    <th>
      <div className={styles.tableHeader}>
        <button className={styles.tableHeaderButton} type="button" onClick={() => onSort(sortBy, nextDirection)}>
          <span>{label}</span>
          <SortIcon size={13} />
        </button>
        <button
          aria-label={`Filter ${label}`}
          className={`${styles.filterButton} ${activeFilter ? styles.filterActive : ''}`}
          type="button"
          onClick={() => onFilterToggle(openFilter === filterKey ? null : filterKey)}
        >
          <Filter size={13} />
        </button>
      </div>
      {openFilter === filterKey ? children : null}
    </th>
  )
}

function FilterPopover({
  children,
  onClear,
  onClose,
  onSubmit,
  title,
}: {
  children: ReactNode
  onClear: () => void
  onClose: () => void
  onSubmit: () => void
  title: string
}) {
  const ref = useRef<HTMLFormElement | null>(null)

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <form
      className={styles.filterPopover}
      ref={ref}
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
    >
      <div className={styles.filterPopoverHeader}>
        <strong>{title}</strong>
        <button aria-label={`Clear ${title}`} type="button" onClick={onClear}>
          <X size={14} />
        </button>
      </div>
      <div className={styles.filterFields}>
        {children}
      </div>
      <div className={styles.filterActions}>
        <button className={styles.secondaryButton} type="button" onClick={onClear}>Clear</button>
        <button className={styles.button} type="submit">Apply</button>
      </div>
    </form>
  )
}

function CategoryChip({
  color,
  confidence,
  name,
  onClick,
  reason,
  source,
}: {
  color?: string
  confidence: number | null
  name: string
  onClick: () => void
  reason: string | null
  source: string | null
}) {
  const Icon = getCategoryIcon(name)

  return (
    <button
      className={styles.categoryChip}
      style={getCategoryStyle(color)}
      title={formatCategoryTooltip(source, confidence, reason)}
      type="button"
      onClick={onClick}
    >
      <span className={styles.categoryIcon}>
        <Icon size={14} strokeWidth={2.4} />
      </span>
      <span>{name}</span>
    </button>
  )
}

function getCategoryStyle(color?: string): CSSProperties {
  return {
    '--category-color': color ?? '#9aa4b7',
  } as CSSProperties
}

function getCategoryIcon(name: string): LucideIcon {
  const normalized = name.toLocaleLowerCase()
  if (normalized === 'income') return Landmark
  if (normalized === 'groceries') return ShoppingCart
  if (normalized === 'dining') return Utensils
  if (normalized === 'housing') return Home
  if (normalized === 'transportation') return Car
  if (normalized === 'utilities') return Zap
  if (normalized === 'healthcare') return HeartPulse
  if (normalized === 'shopping') return ShoppingBag
  if (normalized === 'entertainment') return Clapperboard
  if (normalized === 'travel') return Plane
  if (normalized === 'personal care') return Sparkles
  if (normalized === 'fees') return Receipt
  if (normalized === 'transfers') return ArrowLeftRight
  if (normalized === 'uncategorized') return CircleHelp
  return BadgeDollarSign
}

function formatCategoryTooltip(source: string | null, confidence: number | null, reason: string | null) {
  if (!source) {
    return 'Uncategorized. Click to edit category.'
  }

  if (source === 'smart' && confidence != null) {
    return `Automatically categorized, ${Math.round(confidence * 100)}% confidence${reason ? `: ${reason}` : ''}. Click to edit.`
  }

  if (source === 'rule') {
    return `Categorized by rule${reason ? `: ${reason}` : ''}. Click to edit.`
  }

  if (source === 'manual') {
    return 'Manually categorized. Click to edit.'
  }

  return `Categorized from ${source}. Click to edit.`
}
