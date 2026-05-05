import { readAccessUrl } from './secret'
import { ensureStartupSync } from './sync'
import { summarizeBalances, summarizeCashFlow } from './finance/calculations'
import { getStore, type AccountRecord, type TransactionRecord } from './storage/store'

const monthStart = () => {
  const now = new Date()
  return Math.floor(new Date(now.getFullYear(), now.getMonth(), 1).getTime() / 1000)
}

export async function getDashboardData() {
  await ensureStartupSync()
  const store = getStore()
  const accountRows = await store.listAccounts()
  const accountList = await getAccountList()
  const transactions = await getTransactionsWithRelations()
  const start = monthStart()
  const cashFlowRows = transactions
    .filter((transaction) => transaction.postedAt >= start)
    .map((transaction) => ({
      currency: transaction.currency,
      amount: transaction.amount,
      pending: transaction.pending,
    }))
  const monthTransactionRows = transactions
    .filter((transaction) => transaction.postedAt >= start)
    .map(toChartTransaction)
  const chartTransactions = transactions
    .map(toChartTransaction)
    .sort((a, b) => a.postedAt - b.postedAt)

  return {
    balances: summarizeBalances(accountRows.map((account) => ({
      currency: account.currency,
      balance: account.balance,
    }))),
    cashFlow: summarizeCashFlow(cashFlowRows),
    dailyCashFlow: buildDailyCashFlow(monthTransactionRows),
    spendingByCategory: buildSpendingByCategory(monthTransactionRows),
    chartTransactions,
    accountBalances: buildAccountBalances(accountList),
    recentTransactions: (await getTransactionList({ pageSize: 10 })).rows.slice(0, 8),
    accounts: accountList,
    status: await getStatus(),
  }
}

export async function getAccountsPageData() {
  await ensureStartupSync()
  return {
    accounts: await getAccountList(),
    status: await getStatus(),
  }
}

export async function getTransactionsPageData(input?: TransactionListInput) {
  await ensureStartupSync()
  return {
    transactions: await getTransactionList(input),
    accounts: await getAccountList(),
    categories: await getCategories(),
    status: await getStatus(),
  }
}

export async function getCategoriesPageData() {
  await ensureStartupSync()
  const store = getStore()
  const categories = await getCategories()
  const categoryById = new Map(categories.map((category) => [category.id, category]))
  return {
    categories,
    rules: (await store.listCategoryRules()).map((rule) => ({
      id: rule.id,
      categoryId: rule.categoryId,
      categoryName: categoryById.get(rule.categoryId)?.name ?? null,
      matchText: rule.matchText,
      createdAt: rule.createdAt,
    })),
  }
}

export async function getSetupPageData() {
  return {
    accounts: await getAccountList(),
    status: await getStatus(),
    syncHistory: (await getStore().listSyncRuns()).sort((a, b) => b.startedAt - a.startedAt).slice(0, 15),
  }
}

export async function getStatus() {
  return {
    connected: Boolean(await readAccessUrl()),
    latestSync: await getStore().getLatestSyncRun(),
  }
}

export async function getAccountList() {
  const store = getStore()
  const [accounts, connections] = await Promise.all([
    store.listAccounts(),
    store.listConnections(),
  ])
  const connectionById = new Map(connections.map((connection) => [connection.id, connection]))

  return accounts.map((account) => ({
    id: account.id,
    simplefinId: account.simplefinId,
    name: account.name,
    currency: account.currency,
    balance: account.balance,
    availableBalance: account.availableBalance,
    balanceDate: account.balanceDate,
    connectionId: account.connectionId,
    connectionName: connectionById.get(account.connectionId)?.name ?? null,
    orgName: connectionById.get(account.connectionId)?.orgName ?? null,
  })).sort((a, b) => `${a.connectionName ?? ''}:${a.name}`.localeCompare(`${b.connectionName ?? ''}:${b.name}`))
}

export async function getCategories() {
  return getStore().listCategories()
}

type TransactionListInput = {
  limit?: number
  page?: number
  pageSize?: number
  search?: string
  categoryId?: number | null
  accountId?: string
  connectionId?: string
  pending?: string
  startDate?: string
  endDate?: string
  minAmount?: number
  maxAmount?: number
  sortBy?: string
  sortDir?: string
}

async function getTransactionList(input: TransactionListInput = {}) {
  const pageSize = normalizePageSize(input.pageSize ?? input.limit)
  const sortBy = normalizeTransactionSortBy(input.sortBy)
  const sortDir = input.sortDir === 'asc' ? 'asc' : 'desc'
  let rows = await getTransactionsWithRelations()

  if (input.search) {
    const query = input.search.toLocaleLowerCase()
    rows = rows.filter((transaction) => transaction.description.toLocaleLowerCase().includes(query))
  }
  if (input.categoryId === null) {
    rows = rows.filter((transaction) => transaction.categoryId == null)
  } else if (input.categoryId) {
    rows = rows.filter((transaction) => transaction.categoryId === input.categoryId)
  }
  if (input.accountId) {
    rows = rows.filter((transaction) => transaction.accountId === input.accountId)
  }
  if (input.connectionId) {
    rows = rows.filter((transaction) => transaction.connectionId === input.connectionId)
  }
  if (input.pending === 'posted') {
    rows = rows.filter((transaction) => !transaction.pending)
  }
  if (input.pending === 'pending') {
    rows = rows.filter((transaction) => transaction.pending)
  }
  if (input.startDate) {
    rows = rows.filter((transaction) => transaction.postedAt >= toEpoch(input.startDate!))
  }
  if (input.endDate) {
    rows = rows.filter((transaction) => transaction.postedAt <= toEpoch(input.endDate!) + 86_399)
  }
  if (typeof input.minAmount === 'number' && Number.isFinite(input.minAmount)) {
    rows = rows.filter((transaction) => transaction.amount >= input.minAmount!)
  }
  if (typeof input.maxAmount === 'number' && Number.isFinite(input.maxAmount)) {
    rows = rows.filter((transaction) => transaction.amount <= input.maxAmount!)
  }

  rows.sort((a, b) => compareTransactions(a, b, sortBy, sortDir))

  const total = rows.length
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const page = Math.min(Math.max(1, input.page ?? 1), pageCount)

  return {
    rows: rows.slice((page - 1) * pageSize, page * pageSize),
    page,
    pageSize,
    total,
    pageCount,
    sortBy,
    sortDir,
  }
}

async function getTransactionsWithRelations() {
  const store = getStore()
  const [transactions, accounts, connections, categories] = await Promise.all([
    store.listTransactions(),
    store.listAccounts(),
    store.listConnections(),
    store.listCategories(),
  ])
  const accountById = new Map(accounts.map((account) => [account.id, account]))
  const connectionById = new Map(connections.map((connection) => [connection.id, connection]))
  const categoryById = new Map(categories.map((category) => [category.id, category]))

  return transactions.map((transaction) => {
    const account = accountById.get(transaction.accountId)
    const connection = account ? connectionById.get(account.connectionId) : undefined
    const category = transaction.categoryId == null ? undefined : categoryById.get(transaction.categoryId)

    return {
      ...transaction,
      categoryName: category?.name ?? null,
      accountName: account?.name ?? null,
      connectionId: account?.connectionId ?? null,
      connectionName: connection?.name ?? null,
    }
  })
}

function toChartTransaction(transaction: TransactionRecord & { categoryName: string | null }) {
  return {
    postedAt: transaction.postedAt,
    amount: transaction.amount,
    currency: transaction.currency,
    pending: transaction.pending,
    categoryId: transaction.categoryId,
    categoryName: transaction.categoryName,
  }
}

function normalizePageSize(pageSize?: number) {
  return [10, 25, 50, 100].includes(pageSize ?? 0) ? pageSize as 10 | 25 | 50 | 100 : 10
}

function normalizeTransactionSortBy(sortBy?: string) {
  const allowed = ['date', 'description', 'account', 'institution', 'category', 'amount', 'pending'] as const
  return allowed.includes(sortBy as typeof allowed[number]) ? sortBy as typeof allowed[number] : 'date'
}

type TransactionSortBy = ReturnType<typeof normalizeTransactionSortBy>
type TransactionWithRelations = TransactionRecord & {
  accountName: string | null
  categoryName: string | null
  connectionId: string | null
  connectionName: string | null
}

function compareTransactions(a: TransactionWithRelations, b: TransactionWithRelations, sortBy: TransactionSortBy, sortDir: 'asc' | 'desc') {
  const direction = sortDir === 'asc' ? 1 : -1
  const value = (() => {
    switch (sortBy) {
      case 'description':
        return a.description.localeCompare(b.description)
      case 'account':
        return (a.accountName ?? '').localeCompare(b.accountName ?? '')
      case 'institution':
        return (a.connectionName ?? '').localeCompare(b.connectionName ?? '')
      case 'category':
        return (a.categoryName ?? '').localeCompare(b.categoryName ?? '')
      case 'amount':
        return a.amount - b.amount
      case 'pending':
        return Number(a.pending) - Number(b.pending)
      case 'date':
      default:
        return a.postedAt - b.postedAt
    }
  })()

  return value === 0
    ? direction * ((a.updatedAt - b.updatedAt) || a.id.localeCompare(b.id))
    : direction * value
}

function toEpoch(date: string) {
  return Math.floor(new Date(`${date}T00:00:00`).getTime() / 1000)
}

function buildDailyCashFlow(rows: Array<{
  postedAt: number
  amount: number
  currency: string
  pending: boolean
}>) {
  const posted = rows.filter((row) => !row.pending)
  const currency = posted[0]?.currency ?? rows[0]?.currency ?? 'USD'
  const today = new Date()
  const daysInMonth = today.getDate()
  const buckets = new Map<string, { date: string; moneyIn: number; moneyOut: number; net: number }>()

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(today.getFullYear(), today.getMonth(), day)
    const key = toDateKey(date)
    buckets.set(key, {
      date: key,
      moneyIn: 0,
      moneyOut: 0,
      net: 0,
    })
  }

  for (const row of posted) {
    const key = toDateKey(new Date(row.postedAt * 1000))
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
    currency,
    points: [...buckets.values()],
  }
}

function buildSpendingByCategory(rows: Array<{
  amount: number
  currency: string
  pending: boolean
  categoryName: string | null
}>) {
  const totals = new Map<string, { name: string; amount: number; currency: string }>()

  for (const row of rows) {
    if (row.pending || row.amount >= 0) {
      continue
    }

    const name = row.categoryName ?? 'Uncategorized'
    const current = totals.get(name) ?? { name, amount: 0, currency: row.currency }
    current.amount += Math.abs(row.amount)
    totals.set(name, current)
  }

  const sorted = [...totals.values()].sort((a, b) => b.amount - a.amount)
  const total = sorted.reduce((sum, row) => sum + row.amount, 0)

  return sorted.map((row) => ({
    ...row,
    percent: total ? Math.round((row.amount / total) * 1000) / 10 : 0,
  }))
}

function buildAccountBalances(rows: Awaited<ReturnType<typeof getAccountList>>) {
  const sorted = [...rows].sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance))
  const totalMagnitude = sorted.reduce((sum, row) => sum + Math.abs(row.balance), 0)

  return sorted.map((row) => ({
    id: row.id,
    name: row.name,
    connectionName: row.connectionName,
    balance: row.balance,
    currency: row.currency,
    percent: totalMagnitude ? Math.round((Math.abs(row.balance) / totalMagnitude) * 1000) / 10 : 0,
  }))
}

function toDateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}
