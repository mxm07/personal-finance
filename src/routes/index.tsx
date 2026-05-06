import { useEffect, useRef, useState } from 'react'
import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { getDashboard, syncNow } from '../server-functions'
import {
  TimeRangePicker,
  getDefaultTimeRange,
  getTimeRangeBounds,
  type TimeRangeValue,
} from '../components/time-range-selector'
import { formatDate, formatDateTime, formatMoney } from '../lib/format'
import styles from './page.module.scss'

export const Route = createFileRoute('/')({
  loader: () => getDashboard(),
  component: OverviewPage,
})

function OverviewPage() {
  const data = Route.useLoaderData()
  const router = useRouter()
  const [incomeRange, setIncomeRange] = useState<TimeRangeValue>(() => getDefaultTimeRange(data.asOfDate))
  const [spendingRange, setSpendingRange] = useState<TimeRangeValue>(() => getDefaultTimeRange(data.asOfDate))
  const [topSpendingRange, setTopSpendingRange] = useState<TimeRangeValue>(() => getDefaultTimeRange(data.asOfDate))
  const incomeChartData = buildChartData(data.chartTransactions, incomeRange)
  const spendingChartData = buildChartData(data.chartTransactions, spendingRange)
  const topSpendingChartData = buildChartData(data.chartTransactions, topSpendingRange)
  const primaryBalance = data.balances[0]
  const primaryFlow = data.cashFlow[0]
  const spendingRows = spendingChartData.spendingByCategory.slice(0, 6).map((item, index) => ({
    ...item,
    color: palette[index % palette.length],
  }))
  const topSpendingRows = topSpendingChartData.spendingByCategory.slice(0, 5)
  const accountBalanceRows = data.accountBalances.slice(0, 6)
  const openTransactionsForCategory = (range: TimeRangeValue, item: CategoryBreakdownRow) => {
    const bounds = getTimeRangeBounds(range)

    void router.navigate({
      to: '/transactions',
      search: {
        categoryId: item.categoryId == null ? 'uncategorized' : String(item.categoryId),
        startDate: bounds.startDate,
        endDate: bounds.endDate,
        page: 1,
        sortBy: 'date',
        sortDir: 'desc',
      },
    })
  }

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.heading}>Financial overview</h1>
          <p className={styles.kicker}>Here is your financial overview for {data.asOfLabel}</p>
        </div>
        <SyncButton />
      </header>

      {!data.status.connected ? (
        <div className={styles.error}>
          SimpleFIN is not connected yet. <Link to="/setup">Open setup</Link> to paste a SimpleFIN token.
        </div>
      ) : null}

      <div className={styles.dashboardGrid}>
        <Metric
          label="Net Worth"
          value={primaryBalance ? formatMoney(primaryBalance.netWorth, primaryBalance.currency) : 'No balances'}
          tone={primaryBalance?.netWorth && primaryBalance.netWorth < 0 ? 'negative' : 'positive'}
          detail={data.accounts.length ? `${data.accounts.length} synced accounts` : 'No accounts synced'}
        />
        <Metric
          label="Total Assets"
          value={primaryBalance ? formatMoney(primaryBalance.assets, primaryBalance.currency) : '$0.00'}
          tone="positive"
          detail="Current positive balances"
        />
        <Metric
          label="Total Liabilities"
          value={primaryBalance ? formatMoney(Math.abs(primaryBalance.liabilities), primaryBalance.currency) : '$0.00'}
          tone="negative"
          detail="Current negative balances"
        />
        <Metric
          label="Monthly Cash Flow"
          value={primaryFlow ? formatMoney(primaryFlow.net, primaryFlow.currency) : '$0.00'}
          tone={primaryFlow?.net && primaryFlow.net < 0 ? 'negative' : 'positive'}
          detail="Posted transactions this month"
        />
      </div>

      <div className={styles.panelGrid}>
        <div className={styles.chartCard}>
          <div className={styles.chartHeader}>
            <h2 className={styles.chartTitle}>Income vs Expenses</h2>
            <TimeRangePicker value={incomeRange} onChange={setIncomeRange} />
          </div>
          <div className={styles.legend}>
            <span className={styles.legendItem}><span className={styles.dot} style={{ background: '#1aa37a' }} />Income</span>
            <span className={styles.legendItem}><span className={styles.dot} style={{ background: '#6f57ff' }} />Expenses</span>
          </div>
          <LineChart points={incomeChartData.dailyCashFlow.points} />
        </div>

        <div className={styles.chartCard}>
          <div className={styles.chartHeader}>
            <h2 className={styles.chartTitle}>Spending by Category</h2>
            <TimeRangePicker value={spendingRange} onChange={setSpendingRange} />
          </div>
          <div className={styles.donutWrap}>
            <DonutChart
              rows={spendingRows}
              totalLabel={formatMoney(spendingChartData.moneyOut, spendingChartData.currency)}
              onRowClick={(item) => openTransactionsForCategory(spendingRange, item)}
            />
            <div className={styles.categoryList}>
              {spendingRows.map((item) => (
                <button
                  className={`${styles.categoryRow} ${styles.clickableRow}`}
                  key={`${item.categoryId ?? 'uncategorized'}-${item.name}`}
                  type="button"
                  onClick={() => openTransactionsForCategory(spendingRange, item)}
                >
                  <span className={styles.dot} style={{ background: item.color }} />
                  <span className={styles.rowTitle}>{item.name}</span>
                  <span>{formatMoney(item.amount, item.currency)}</span>
                  <span className={styles.rowMeta}>{item.percent}%</span>
                </button>
              ))}
              {!spendingRows.length ? <p className={styles.subtle}>No spending synced yet.</p> : null}
            </div>
          </div>
        </div>

        <div className={styles.chartCard}>
          <div className={styles.chartHeader}>
            <h2 className={styles.chartTitle}>Top Spending</h2>
            <TimeRangePicker value={topSpendingRange} onChange={setTopSpendingRange} />
          </div>
          <div className={styles.budgetList}>
            {topSpendingRows.map((item) => (
              <button
                className={`${styles.budgetRow} ${styles.clickableRow}`}
                key={`${item.categoryId ?? 'uncategorized'}-${item.name}`}
                type="button"
                onClick={() => openTransactionsForCategory(topSpendingRange, item)}
              >
                <span className={styles.rowTitle}>{item.name}</span>
                <span className={styles.rowMeta}>{formatMoney(item.amount, item.currency)} · {item.percent}%</span>
                <span className={styles.budgetTrack}><span className={styles.budgetFill} style={{ width: `${item.percent}%` }} /></span>
              </button>
            ))}
            {!topSpendingRows.length ? <p className={styles.subtle}>No category activity yet.</p> : null}
          </div>
        </div>
      </div>

      <div className={styles.lowerGrid}>
        <div className={styles.chartCard}>
          <div className={styles.chartHeader}>
            <h2 className={styles.chartTitle}>Accounts</h2>
            <Link to="/accounts" className={styles.selectPill}>View All</Link>
          </div>
          <div className={styles.budgetList}>
            {data.accounts.slice(0, 5).map((account) => (
              <div className={`${styles.budgetRow} ${styles.accountRow}`} key={account.id}>
                <span className={styles.rowTitle}>{account.name}</span>
                <span>{formatMoney(account.balance, account.currency)}</span>
                <span className={styles.rowMeta}>{account.connectionName}</span>
              </div>
            ))}
            {!data.accounts.length ? <p className={styles.subtle}>No accounts synced yet.</p> : null}
          </div>
        </div>

        <div className={styles.chartCard}>
          <div className={styles.chartHeader}>
            <h2 className={styles.chartTitle}>Recent Transactions</h2>
            <Link to="/transactions" className={styles.selectPill}>View All</Link>
          </div>
          <div className={styles.transactionList}>
            {data.recentTransactions.slice(0, 5).map((transaction, index) => (
              <div className={styles.transactionRow} key={transaction.id}>
                <span className={styles.merchantIcon} style={{ background: palette[index % palette.length] }}>
                  {transaction.description.slice(0, 1).toUpperCase()}
                </span>
                <span>
                  <span className={styles.rowTitle}>{transaction.description}</span>
                  <span className={styles.rowMeta}>{transaction.categoryName ?? 'Uncategorized'} · {formatDate(transaction.postedAt)}</span>
                </span>
                <span className={transaction.amount < 0 ? styles.negative : styles.positive}>
                  {formatMoney(transaction.amount, transaction.currency)}
                </span>
              </div>
            ))}
            {!data.recentTransactions.length ? <p className={styles.subtle}>No transactions synced yet.</p> : null}
          </div>
        </div>

        <div className={styles.chartCard}>
          <div className={styles.chartHeader}>
            <h2 className={styles.chartTitle}>Sync Status</h2>
            <Link to="/setup" className={styles.selectPill}>Setup</Link>
          </div>
          <div className={styles.billList}>
            <div className={styles.billRow}>
              <span className={styles.merchantIcon} style={{ background: '#4f7cff' }}>S</span>
              <span>
                <span className={styles.rowTitle}>{data.status.latestSync?.status ?? 'No sync'}</span>
                <span className={styles.rowMeta}>
                  {data.status.latestSync ? formatDateTime(data.status.latestSync.finishedAt ?? data.status.latestSync.startedAt) : 'Connect SimpleFIN'}
                </span>
              </span>
              <span className={data.status.connected ? styles.positive : styles.negative}>{data.status.connected ? 'Live' : 'Off'}</span>
            </div>
            {data.status.latestSync?.message ? <p className={styles.subtle}>{data.status.latestSync.message}</p> : null}
          </div>
        </div>

        <div className={styles.chartCard}>
          <div className={styles.chartHeader}>
            <h2 className={styles.chartTitle}>Balance by Account</h2>
            <span className={styles.selectPill}>Current</span>
          </div>
          <div className={styles.budgetList}>
            {accountBalanceRows.map((account) => (
              <div className={styles.budgetRow} key={account.id}>
                <span className={styles.rowTitle}>{account.name}</span>
                <span className={account.balance < 0 ? styles.negative : styles.positive}>{formatMoney(account.balance, account.currency)}</span>
                <span className={styles.budgetTrack}>
                  <span
                    className={`${styles.budgetFill} ${account.balance < 0 ? styles.negativeFill : ''}`}
                    style={{ width: `${account.percent}%` }}
                  />
                </span>
              </div>
            ))}
            {!accountBalanceRows.length ? <p className={styles.subtle}>No accounts synced yet.</p> : null}
          </div>
        </div>
      </div>
    </section>
  )
}

function DonutChart({
  onRowClick,
  rows,
  totalLabel,
}: {
  onRowClick?: (row: DisplayCategoryBreakdownRow) => void
  rows: DisplayCategoryBreakdownRow[]
  totalLabel: string
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const outerRadius = 72
  const innerRadius = 44
  const total = rows.reduce((sum, row) => sum + row.amount, 0)
  let offset = 0
  const active = activeIndex == null ? null : rows[activeIndex]
  const activePosition = activeIndex == null ? null : getDonutTooltipPosition(rows, activeIndex)

  return (
    <div className={styles.donut}>
      <svg className={styles.donutSvg} viewBox="0 0 180 180" role="img" aria-label="Spending by category">
        <circle cx="90" cy="90" r={(outerRadius + innerRadius) / 2} fill="none" stroke="#eef2f8" strokeWidth={outerRadius - innerRadius} />
        {rows.map((row, index) => {
          const startAngle = total ? (offset / total) * 360 - 90 : -90
          offset += row.amount
          const endAngle = total ? (offset / total) * 360 - 90 : -90

          return (
            <path
              key={`${row.categoryId ?? 'uncategorized'}-${row.name}-${index}`}
              d={getDonutSegmentPath(90, 90, outerRadius, innerRadius, startAngle, endAngle)}
              fill={row.color}
              role="button"
              aria-label={`View ${row.name} transactions`}
              tabIndex={0}
              className={styles.donutSector}
              onClick={() => onRowClick?.(row)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onRowClick?.(row)
                }
              }}
              onBlur={() => setActiveIndex(null)}
              onFocus={() => setActiveIndex(index)}
              onMouseEnter={() => setActiveIndex(index)}
              onMouseLeave={() => setActiveIndex(null)}
            />
          )
        })}
      </svg>
      <div className={styles.donutCenter}>
        <strong className={getDonutValueClass(totalLabel)}>{totalLabel}</strong>
        <span>Total</span>
      </div>
      {active && activePosition ? (
        <div
          className={styles.donutTooltip}
          style={{
            left: `${activePosition.x}%`,
            top: `${activePosition.y}%`,
          }}
        >
          <strong>{active.name}</strong>
          <span>{formatMoney(active.amount, active.currency)} · {active.percent}%</span>
        </div>
      ) : null}
    </div>
  )
}

function Metric({
  label,
  value,
  tone,
  detail,
}: {
  label: string
  value: string
  tone?: 'positive' | 'negative'
  detail: string
}) {
  return (
    <div className={styles.metric}>
      <div className={styles.metricTop}>
        <span className={styles.label}>{label}</span>
        <span className={styles.rowMeta}>i</span>
      </div>
      <div className={styles.metricBody}>
        <span className={styles.value}>{value}</span>
        <span className={`${styles.trend} ${tone === 'negative' ? styles.negative : styles.positive}`}>
          {detail}
        </span>
      </div>
    </div>
  )
}

function SyncButton() {
  const router = useRouter()

  return (
    <button
      className={styles.button}
      type="button"
      onClick={() => {
        void syncNow().then(() => router.invalidate())
      }}
    >
      Sync now
    </button>
  )
}

type ChartTransaction = {
  postedAt: number
  amount: number
  currency: string
  pending: boolean
  categoryId: number | null
  categoryName: string | null
}

type CategoryBreakdownRow = {
  categoryId: number | null
  name: string
  amount: number
  currency: string
  percent: number
}

type DisplayCategoryBreakdownRow = CategoryBreakdownRow & {
  color: string
}

function buildChartData(transactions: ChartTransaction[], range: TimeRangeValue) {
  const bounds = getTimeRangeBounds(range)
  const rows = transactions.filter((transaction) => (
    !transaction.pending
    && transaction.postedAt >= bounds.startEpoch
    && transaction.postedAt <= bounds.endEpoch
  ))
  const currency = rows[0]?.currency ?? transactions[0]?.currency ?? 'USD'
  const dailyCashFlow = buildRangeCashFlow(rows, bounds.startEpoch, bounds.endEpoch)
  const spendingByCategory = buildRangeSpendingByCategory(rows)
  const moneyOut = rows.reduce((sum, row) => row.amount < 0 ? sum + Math.abs(row.amount) : sum, 0)

  return {
    currency,
    dailyCashFlow,
    spendingByCategory,
    moneyOut,
  }
}

function buildRangeCashFlow(rows: ChartTransaction[], startEpoch: number, endEpoch: number) {
  const start = startOfDay(new Date(startEpoch * 1000))
  const end = startOfDay(new Date(endEpoch * 1000))
  const useMonthlyBuckets = differenceInDays(start, end) > 92
  const currency = rows[0]?.currency ?? 'USD'
  const buckets = new Map<string, { date: string; moneyIn: number; moneyOut: number; net: number; currency: string }>()
  const cursor = new Date(start)

  while (cursor <= end) {
    const key = useMonthlyBuckets ? toMonthKey(cursor) : toDateKey(cursor)
    if (!buckets.has(key)) {
      buckets.set(key, {
        date: key,
        moneyIn: 0,
        moneyOut: 0,
        net: 0,
        currency,
      })
    }

    if (useMonthlyBuckets) {
      cursor.setMonth(cursor.getMonth() + 1, 1)
    } else {
      cursor.setDate(cursor.getDate() + 1)
    }
  }

  for (const row of rows) {
    const key = useMonthlyBuckets ? toMonthKey(new Date(row.postedAt * 1000)) : toDateKey(new Date(row.postedAt * 1000))
    const bucket = buckets.get(key)
    if (!bucket) {
      continue
    }

    if (row.amount >= 0) {
      bucket.moneyIn += row.amount
    } else {
      bucket.moneyOut += Math.abs(row.amount)
    }
    bucket.net += row.amount
  }

  return {
    bucket: useMonthlyBuckets ? 'month' : 'day',
    points: [...buckets.values()],
  }
}

function buildRangeSpendingByCategory(rows: ChartTransaction[]) {
  const totals = new Map<string, { categoryId: number | null; name: string; amount: number; currency: string }>()

  for (const row of rows) {
    if (row.amount >= 0) {
      continue
    }

    const name = row.categoryName ?? 'Uncategorized'
    const key = row.categoryId == null ? 'uncategorized' : String(row.categoryId)
    const current = totals.get(key) ?? { categoryId: row.categoryId, name, amount: 0, currency: row.currency }
    current.amount += Math.abs(row.amount)
    totals.set(key, current)
  }

  const sorted = [...totals.values()].sort((a, b) => b.amount - a.amount)
  const total = sorted.reduce((sum, row) => sum + row.amount, 0)

  return sorted.map((row) => ({
    ...row,
    percent: total ? Math.round((row.amount / total) * 1000) / 10 : 0,
  }))
}

function LineChart({
  points,
}: {
  points: Array<{ date: string; moneyIn: number; moneyOut: number; net: number; currency?: string }>
}) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const [chartWidth, setChartWidth] = useState(640)
  const income = points.map((point) => point.moneyIn)
  const expenses = points.map((point) => point.moneyOut)
  const hasActivity = points.some((point) => point.moneyIn || point.moneyOut)
  const maxValue = Math.max(...income, ...expenses, 1)
  const chartPoints = points.map((point, index) => ({
    ...point,
    incomePoint: getPoint(point.moneyIn, index, points.length, chartWidth, 220, maxValue),
    expensePoint: getPoint(point.moneyOut, index, points.length, chartWidth, 220, maxValue),
  }))
  const active = activeIndex == null ? null : chartPoints[activeIndex]

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) {
      return
    }

    const updateWidth = () => {
      setChartWidth(Math.max(320, Math.round(svg.getBoundingClientRect().width)))
    }
    updateWidth()

    const observer = new ResizeObserver(updateWidth)
    observer.observe(svg)
    return () => observer.disconnect()
  }, [])

  return (
    <svg
      ref={svgRef}
      className={styles.lineChart}
      viewBox={`0 0 ${chartWidth} 220`}
      role="img"
      aria-label="Income and expense trend"
      onMouseLeave={() => setActiveIndex(null)}
      onPointerMove={(event) => {
        const svg = event.currentTarget
        const matrix = svg.getScreenCTM()
        if (!matrix) {
          return
        }
        const point = svg.createSVGPoint()
        point.x = event.clientX
        point.y = event.clientY
        const cursor = point.matrixTransform(matrix.inverse())
        setActiveIndex(getNearestPointIndex(cursor.x, points.length, chartWidth))
      }}
    >
      <defs>
        <linearGradient id="incomeFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#1aa37a" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#1aa37a" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="expenseFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#6f57ff" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#6f57ff" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[40, 85, 130, 175].map((y) => (
        <line key={y} x1="0" x2={chartWidth} y1={y} y2={y} stroke="#e5e9f2" strokeDasharray="4 6" />
      ))}
      {hasActivity ? (
        <>
          <path d={areaPath(income, chartWidth, 220, maxValue)} fill="url(#incomeFill)" />
          <path d={areaPath(expenses, chartWidth, 220, maxValue)} fill="url(#expenseFill)" />
          <path d={linePath(income, chartWidth, 220, maxValue)} fill="none" stroke="#1aa37a" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />
          <path d={linePath(expenses, chartWidth, 220, maxValue)} fill="none" stroke="#6f57ff" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />
          {active ? (
            <g>
              <line x1={active.incomePoint.x} x2={active.incomePoint.x} y1="18" y2="208" stroke="#cbd5e1" strokeDasharray="4 5" />
              <circle cx={active.incomePoint.x} cy={active.incomePoint.y} r="6" fill="#1aa37a" stroke="white" strokeWidth="3" />
              <circle cx={active.expensePoint.x} cy={active.expensePoint.y} r="6" fill="#6f57ff" stroke="white" strokeWidth="3" />
              <ChartTooltip point={active} width={chartWidth} />
            </g>
          ) : null}
        </>
      ) : (
        <text x={chartWidth / 2} y="116" fill="#657086" fontSize="16" textAnchor="middle">No posted activity this month</text>
      )}
    </svg>
  )
}

function ChartTooltip({ point, width }: {
  point: {
    date: string
    moneyIn: number
    moneyOut: number
    net: number
    currency?: string
    incomePoint: { x: number; y: number }
  }
  width: number
}) {
  const tooltipWidth = 168
  const x = Math.min(Math.max(point.incomePoint.x - tooltipWidth / 2, 8), width - tooltipWidth - 8)
  const y = point.incomePoint.y > 92 ? point.incomePoint.y - 86 : point.incomePoint.y + 18

  return (
    <g transform={`translate(${x} ${y})`}>
      <rect width={tooltipWidth} height="72" rx="10" fill="#151927" opacity="0.96" />
      <text x="12" y="18" fill="white" fontSize="12" fontWeight="700">{formatChartBucketLabel(point.date)}</text>
      <text x="12" y="38" fill="#9ee6c8" fontSize="11">Income: {formatMoney(point.moneyIn, point.currency ?? 'USD')}</text>
      <text x="12" y="54" fill="#c8beff" fontSize="11">Expenses: {formatMoney(point.moneyOut, point.currency ?? 'USD')}</text>
      <text x="12" y="68" fill="rgba(255,255,255,0.78)" fontSize="11">Net: {formatMoney(point.net, point.currency ?? 'USD')}</text>
    </g>
  )
}

function linePath(values: number[], width = 640, height = 220, maxValue?: number) {
  const points = getPoints(values, width, height, maxValue)
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
}

function areaPath(values: number[], width = 640, height = 220, maxValue?: number) {
  const points = getPoints(values, width, height, maxValue)
  const line = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
  return `${line} L ${width} ${height} L 0 ${height} Z`
}

function getPoints(values: number[], width: number, height: number, maxValue?: number) {
  const max = maxValue ?? Math.max(...values, 1)
  return values.map((value, index) => getPoint(value, index, values.length, width, height, max))
}

function getPoint(value: number, index: number, count: number, width: number, height: number, maxValue?: number) {
  const max = maxValue ?? Math.max(value, 1)
  const step = width / Math.max(1, count - 1)

  return {
    x: Math.round(index * step),
    y: Math.round(height - 12 - (value / max) * (height - 28)),
  }
}

function getNearestPointIndex(x: number, count: number, width: number) {
  if (count <= 1) {
    return 0
  }

  const step = width / (count - 1)
  return Math.min(count - 1, Math.max(0, Math.round(x / step)))
}

function formatChartBucketLabel(value: string) {
  const parts = value.split('-').map(Number)
  const date = parts.length === 2
    ? new Date(parts[0], (parts[1] ?? 1) - 1, 1)
    : new Date(parts[0], (parts[1] ?? 1) - 1, parts[2] ?? 1)

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: parts.length === 2 ? undefined : 'numeric',
    year: 'numeric',
  }).format(date)
}

function getDonutTooltipPosition(rows: Array<{ amount: number }>, index: number) {
  const total = rows.reduce((sum, row) => sum + row.amount, 0)
  if (!total) {
    return null
  }

  const before = rows.slice(0, index).reduce((sum, row) => sum + row.amount, 0)
  const midpoint = (before + rows[index].amount / 2) / total
  const angle = midpoint * Math.PI * 2 - Math.PI / 2
  const radius = 40

  return {
    x: 50 + Math.cos(angle) * radius,
    y: 50 + Math.sin(angle) * radius,
  }
}

function getDonutValueClass(value: string) {
  if (value.length >= 12) {
    return `${styles.donutValue} ${styles.donutValueDense}`
  }
  if (value.length >= 10) {
    return `${styles.donutValue} ${styles.donutValueCompact}`
  }
  return styles.donutValue
}

function getDonutSegmentPath(
  centerX: number,
  centerY: number,
  outerRadius: number,
  innerRadius: number,
  startAngle: number,
  endAngle: number,
) {
  const angle = endAngle - startAngle
  if (angle >= 359.99) {
    return [
      `M ${centerX} ${centerY - outerRadius}`,
      `A ${outerRadius} ${outerRadius} 0 1 1 ${centerX - 0.01} ${centerY - outerRadius}`,
      `A ${outerRadius} ${outerRadius} 0 1 1 ${centerX} ${centerY - outerRadius}`,
      `M ${centerX} ${centerY - innerRadius}`,
      `A ${innerRadius} ${innerRadius} 0 1 0 ${centerX - 0.01} ${centerY - innerRadius}`,
      `A ${innerRadius} ${innerRadius} 0 1 0 ${centerX} ${centerY - innerRadius}`,
      'Z',
    ].join(' ')
  }

  const outerStart = getPointOnCircle(centerX, centerY, outerRadius, startAngle)
  const outerEnd = getPointOnCircle(centerX, centerY, outerRadius, endAngle)
  const innerStart = getPointOnCircle(centerX, centerY, innerRadius, startAngle)
  const innerEnd = getPointOnCircle(centerX, centerY, innerRadius, endAngle)
  const largeArcFlag = angle > 180 ? 1 : 0

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${innerStart.x} ${innerStart.y}`,
    'Z',
  ].join(' ')
}

function getPointOnCircle(centerX: number, centerY: number, radius: number, angle: number) {
  const radians = angle * Math.PI / 180
  return {
    x: roundSvgPoint(centerX + radius * Math.cos(radians)),
    y: roundSvgPoint(centerY + radius * Math.sin(radians)),
  }
}

function roundSvgPoint(value: number) {
  return Math.round(value * 1000) / 1000
}

function differenceInDays(start: Date, end: Date) {
  return Math.floor((end.getTime() - start.getTime()) / 86_400_000)
}

function startOfDay(date: Date) {
  const copy = new Date(date)
  copy.setHours(0, 0, 0, 0)
  return copy
}

function toDateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function toMonthKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')

  return `${year}-${month}`
}

const palette = ['#4f7cff', '#1aa37a', '#30b6c9', '#f3a63f', '#ff8a8f', '#f15f64']
