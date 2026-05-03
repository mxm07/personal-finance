import { and, desc, eq, gte, like, lte, sql } from 'drizzle-orm'
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
  const cashFlowRows = db.select({
    currency: transactions.currency,
    amount: transactions.amount,
    pending: transactions.pending,
  }).from(transactions).where(gte(transactions.postedAt, monthStart())).all()

  return {
    balances: summarizeBalances(accountRows.map((account) => ({
      currency: account.currency,
      balance: account.balance,
    }))),
    cashFlow: summarizeCashFlow(cashFlowRows),
    recentTransactions: getTransactionList({ limit: 8 }),
    accounts: getAccountList(),
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
  pending?: string
  startDate?: string
  endDate?: string
}) {
  await ensureStartupSync()
  return {
    transactions: getTransactionList({ limit: 500, ...input }),
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
  search?: string
  categoryId?: number | null
  accountId?: string
  pending?: string
  startDate?: string
  endDate?: string
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

  return db.select({
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
    accountId: accounts.id,
    accountName: accounts.name,
    connectionName: connections.name,
  }).from(transactions)
    .leftJoin(accounts, eq(transactions.accountId, accounts.id))
    .leftJoin(connections, eq(accounts.connectionId, connections.id))
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(filters.length ? and(...filters) : sql`1 = 1`)
    .orderBy(desc(transactions.postedAt), desc(transactions.updatedAt))
    .limit(input.limit ?? 100)
    .all()
}

function toEpoch(date: string) {
  return Math.floor(new Date(`${date}T00:00:00`).getTime() / 1000)
}
