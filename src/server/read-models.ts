import { and, asc, desc, eq, gte, like, lte, sql } from 'drizzle-orm'
import { accounts, categories, categoryRules, connections, syncRuns, transactions } from './db/schema'
import { getDb } from './db/client'
import { readAccessUrl } from './secret'
import { ensureStartupSync } from './sync'
import { summarizeBalances, summarizeCashFlow } from './finance/calculations'

const monthStart = () => {
  const now = new Date()
  return Math.floor(new Date(now.getFullYear(), now.getMonth(), 1).getTime() / 1000)
}

export async function getDashboardData() {
  await ensureStartupSync()
  const db = getDb()
  const accountRows = db.select().from(accounts).all()
  const accountList = getAccountList()
  const start = monthStart()
  const cashFlowRows = db.select({
    currency: transactions.currency,
    amount: transactions.amount,
    pending: transactions.pending,
  }).from(transactions).where(gte(transactions.postedAt, start)).all()
  const monthTransactionRows = db.select({
    postedAt: transactions.postedAt,
    amount: transactions.amount,
    currency: transactions.currency,
    pending: transactions.pending,
    categoryName: categories.name,
  }).from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(gte(transactions.postedAt, start))
    .all()
  const chartTransactions = db.select({
    postedAt: transactions.postedAt,
    amount: transactions.amount,
    currency: transactions.currency,
    pending: transactions.pending,
    categoryName: categories.name,
  }).from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .orderBy(transactions.postedAt)
    .all()

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
    recentTransactions: getTransactionList({ pageSize: 10 }).rows.slice(0, 8),
    accounts: accountList,
    status: await getStatus(),
  }
}

export async function getAccountsPageData() {
  await ensureStartupSync()
  return {
    accounts: getAccountList(),
    status: await getStatus(),
  }
}

export async function getTransactionsPageData(input?: {
  search?: string
  categoryId?: number | null
  accountId?: string
  connectionId?: string
  pending?: string
  startDate?: string
  endDate?: string
  minAmount?: number
  maxAmount?: number
  page?: number
  pageSize?: number
  sortBy?: string
  sortDir?: string
  limit?: number
}) {
  await ensureStartupSync()
  return {
    transactions: getTransactionList(input),
    accounts: getAccountList(),
    categories: getCategories(),
    status: await getStatus(),
  }
}

export async function getCategoriesPageData() {
  await ensureStartupSync()
  const db = getDb()
  return {
    categories: getCategories(),
    rules: db.select({
      id: categoryRules.id,
      categoryId: categoryRules.categoryId,
      categoryName: categories.name,
      matchText: categoryRules.matchText,
      createdAt: categoryRules.createdAt,
    }).from(categoryRules)
      .leftJoin(categories, eq(categoryRules.categoryId, categories.id))
      .orderBy(desc(categoryRules.createdAt))
      .all(),
  }
}

export async function getSetupPageData() {
  return {
    accounts: getAccountList(),
    status: await getStatus(),
    syncHistory: getDb().select().from(syncRuns).orderBy(desc(syncRuns.startedAt)).limit(15).all(),
  }
}

export async function getStatus() {
  const db = getDb()
  const latestSync = db.select().from(syncRuns).orderBy(desc(syncRuns.startedAt)).limit(1).get() ?? null
  return {
    connected: Boolean(await readAccessUrl()),
    latestSync,
  }
}

export function getAccountList() {
  const db = getDb()
  return db.select({
    id: accounts.id,
    simplefinId: accounts.simplefinId,
    name: accounts.name,
    currency: accounts.currency,
    balance: accounts.balance,
    availableBalance: accounts.availableBalance,
    balanceDate: accounts.balanceDate,
    connectionId: accounts.connectionId,
    connectionName: connections.name,
    orgName: connections.orgName,
  }).from(accounts)
    .leftJoin(connections, eq(accounts.connectionId, connections.id))
    .orderBy(connections.name, accounts.name)
    .all()
}

export function getCategories() {
  return getDb().select().from(categories).orderBy(categories.name).all()
}

function getTransactionList(input: {
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
} = {}) {
  const db = getDb()
  const filters = []
  if (input.search) {
    filters.push(like(transactions.description, `%${input.search}%`))
  }
  if (input.categoryId) {
    filters.push(eq(transactions.categoryId, input.categoryId))
  }
  if (input.accountId) {
    filters.push(eq(transactions.accountId, input.accountId))
  }
  if (input.connectionId) {
    filters.push(eq(accounts.connectionId, input.connectionId))
  }
  if (input.pending === 'posted') {
    filters.push(eq(transactions.pending, false))
  }
  if (input.pending === 'pending') {
    filters.push(eq(transactions.pending, true))
  }
  if (input.startDate) {
    filters.push(gte(transactions.postedAt, toEpoch(input.startDate)))
  }
  if (input.endDate) {
    filters.push(lte(transactions.postedAt, toEpoch(input.endDate) + 86_399))
  }
  if (typeof input.minAmount === 'number' && Number.isFinite(input.minAmount)) {
    filters.push(gte(transactions.amount, input.minAmount))
  }
  if (typeof input.maxAmount === 'number' && Number.isFinite(input.maxAmount)) {
    filters.push(lte(transactions.amount, input.maxAmount))
  }
  const where = filters.length ? and(...filters) : sql`1 = 1`
  const pageSize = normalizePageSize(input.pageSize ?? input.limit)
  const total = db.select({
    count: sql<number>`count(*)`,
  }).from(transactions)
    .leftJoin(accounts, eq(transactions.accountId, accounts.id))
    .leftJoin(connections, eq(accounts.connectionId, connections.id))
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(where)
    .get()?.count ?? 0
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const page = Math.min(Math.max(1, input.page ?? 1), pageCount)
  const sort = getTransactionSort(input.sortBy, input.sortDir)

  const rows = db.select({
    id: transactions.id,
    postedAt: transactions.postedAt,
    transactedAt: transactions.transactedAt,
    amount: transactions.amount,
    currency: transactions.currency,
    description: transactions.description,
    pending: transactions.pending,
    categoryId: transactions.categoryId,
    categoryName: categories.name,
    categorySource: transactions.categorySource,
    categoryConfidence: transactions.categoryConfidence,
    categoryReason: transactions.categoryReason,
    normalizedMerchant: transactions.normalizedMerchant,
    accountId: accounts.id,
    accountName: accounts.name,
    connectionName: connections.name,
  }).from(transactions)
    .leftJoin(accounts, eq(transactions.accountId, accounts.id))
    .leftJoin(connections, eq(accounts.connectionId, connections.id))
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(where)
    .orderBy(sort, desc(transactions.updatedAt), desc(transactions.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .all()

  return {
    rows,
    page,
    pageSize,
    total,
    pageCount,
    sortBy: normalizeTransactionSortBy(input.sortBy),
    sortDir: input.sortDir === 'asc' ? 'asc' : 'desc',
  }
}

function normalizePageSize(pageSize?: number) {
  return [10, 25, 50, 100].includes(pageSize ?? 0) ? pageSize as 10 | 25 | 50 | 100 : 10
}

function normalizeTransactionSortBy(sortBy?: string) {
  const allowed = ['date', 'description', 'account', 'institution', 'category', 'amount', 'pending'] as const
  return allowed.includes(sortBy as typeof allowed[number]) ? sortBy as typeof allowed[number] : 'date'
}

function getTransactionSort(sortBy?: string, sortDir?: string) {
  const direction = sortDir === 'asc' ? asc : desc
  switch (normalizeTransactionSortBy(sortBy)) {
    case 'description':
      return direction(transactions.description)
    case 'account':
      return direction(accounts.name)
    case 'institution':
      return direction(connections.name)
    case 'category':
      return direction(categories.name)
    case 'amount':
      return direction(transactions.amount)
    case 'pending':
      return direction(transactions.pending)
    case 'date':
    default:
      return direction(transactions.postedAt)
  }
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

function buildAccountBalances(rows: ReturnType<typeof getAccountList>) {
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
