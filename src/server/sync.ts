import { desc, eq, sql } from 'drizzle-orm'
import { ZodError } from 'zod'
import { accounts, categories, categoryRules, connections, syncRuns, transactions } from './db/schema'
import { getDb } from './db/client'
import { readAccessUrl } from './secret'
import { fetchAccountSet, sanitizeSimpleFinMessage, SimpleFinError } from './simplefin/client'
import type { SimpleFinAccountSet } from './simplefin/types'
import { categorizeTransaction } from './finance/categorization'

const overlapSeconds = 60 * 60 * 24 * 3
const initialSyncLookbackSeconds = 60 * 60 * 24 * 90
const historicalBackfillWindowSeconds = 60 * 60 * 24 * 45
const maxBackfillChunks = Number(process.env.SIMPLEFIN_BACKFILL_CHUNKS ?? 48)
const maxEmptyBackfillChunks = 4
let syncInFlight: Promise<SyncResult> | undefined
let startupSyncStarted = false

type HistoricalBackfillAccount = {
  accountId: string
  connectionId: string
  simplefinId: string
  historyCursor: number | null
  earliestPostedAt: number | null
}

type HistoricalBackfillState = {
  accountId: string
  connectionId: string
  simplefinId: string
  cursor: number
  emptyWindows: number
  active: boolean
}

type HistoricalBackfillWindow = {
  startDate: number
  endDate: number
  accountIds: string[]
  simplefinAccountIds: string[]
}

type UpsertAccountSetResult = {
  transactionIds: string[]
  insertedTransactionIds: string[]
}

export type SyncResult = {
  status: 'success' | 'skipped' | 'failed'
  message: string
}

export async function ensureStartupSync() {
  if (startupSyncStarted) {
    return
  }
  startupSyncStarted = true

  if (await readAccessUrl()) {
    await syncSimpleFin('startup').catch(() => undefined)
  }
}

export async function syncSimpleFin(trigger: 'manual' | 'startup' | 'claim'): Promise<SyncResult> {
  if (syncInFlight) {
    return syncInFlight
  }

  syncInFlight = runSync(trigger).finally(() => {
    syncInFlight = undefined
  })

  return syncInFlight
}

export async function syncSimpleFinHistory(): Promise<SyncResult> {
  if (syncInFlight) {
    return syncInFlight
  }

  syncInFlight = runHistoricalBackfill().finally(() => {
    syncInFlight = undefined
  })

  return syncInFlight
}

async function runSync(trigger: string): Promise<SyncResult> {
  const db = getDb()
  const accessUrl = await readAccessUrl()
  if (!accessUrl) {
    return { status: 'skipped', message: 'SimpleFIN is not connected yet.' }
  }

  const now = unixNow()
  const run = db.insert(syncRuns).values({
    trigger,
    status: 'running',
    startedAt: now,
  }).returning({ id: syncRuns.id }).get()

  try {
    const startDate = getSyncStartDate()
    const accountSet = await fetchAccountSet(accessUrl, startDate)
    upsertAccountSet(accountSet)
    categorizeStoredTransactions()
    const message = accountSet.errlist.length
      ? summarizeSimpleFinMessages(accountSet.errlist.map((error) => error.msg ?? error.message ?? error.code))
      : 'Sync completed.'

    db.update(syncRuns).set({
      status: 'success',
      finishedAt: unixNow(),
      message,
    }).where(eq(syncRuns.id, run.id)).run()

    return { status: 'success', message }
  } catch (error) {
    const message = getSyncErrorMessage(error)

    db.update(syncRuns).set({
      status: 'failed',
      finishedAt: unixNow(),
      message,
    }).where(eq(syncRuns.id, run.id)).run()

    return { status: 'failed', message }
  }
}

async function runHistoricalBackfill(): Promise<SyncResult> {
  const db = getDb()
  const accessUrl = await readAccessUrl()
  if (!accessUrl) {
    return { status: 'skipped', message: 'SimpleFIN is not connected yet.' }
  }

  const now = unixNow()
  const run = db.insert(syncRuns).values({
    trigger: 'history',
    status: 'running',
    startedAt: now,
  }).returning({ id: syncRuns.id }).get()

  try {
    const accountStates = createHistoricalBackfillStates(getHistoricalBackfillAccounts())
    const receivedTransactions = new Set<string>()
    const insertedTransactions = new Set<string>()
    let requestedWindows = 0
    const messages: string[] = []

    while (requestedWindows < maxBackfillChunks && accountStates.some((account) => account.active)) {
      const windows = buildHistoricalBackfillWindows(accountStates)
      if (!windows.length) {
        break
      }

      for (const window of windows) {
        if (requestedWindows >= maxBackfillChunks) {
          break
        }

        requestedWindows += 1
        const accountSet = await fetchAccountSet(accessUrl, window.startDate, window.endDate, window.simplefinAccountIds)
        const accountTransactionCounts = countTransactionsByAccount(accountSet)
        const upsertResult = upsertAccountSet(accountSet)
        for (const transactionId of upsertResult.transactionIds) {
          receivedTransactions.add(transactionId)
        }
        for (const transactionId of upsertResult.insertedTransactionIds) {
          insertedTransactions.add(transactionId)
        }

        if (accountSet.errlist.length) {
          messages.push(...accountSet.errlist.map((error) => sanitizeSimpleFinMessage(error.msg ?? error.message ?? error.code)))
        }

        for (const accountId of window.accountIds) {
          const account = accountStates.find((state) => state.accountId === accountId)
          if (!account) {
            continue
          }

          account.cursor = window.startDate
          updateAccountHistoryCursor(accountId, window.startDate)

          const transactionCount = accountTransactionCounts.get(accountId) ?? 0
          account.emptyWindows = transactionCount === 0
            ? account.emptyWindows + 1
            : 0

          if (account.emptyWindows >= maxEmptyBackfillChunks || window.startDate === 0) {
            account.active = false
          }
        }
      }
    }

    categorizeStoredTransactions()

    const suffix = requestedWindows >= maxBackfillChunks
      ? ' Run history import again later to continue farther back if needed.'
      : ''
    const detailMessage = summarizeSimpleFinMessages(messages)
    const message = formatHistoricalImportMessage({
      requestedWindows,
      receivedTransactions: receivedTransactions.size,
      insertedTransactions: insertedTransactions.size,
      detailMessage,
      suffix,
    })

    db.update(syncRuns).set({
      status: 'success',
      finishedAt: unixNow(),
      message,
    }).where(eq(syncRuns.id, run.id)).run()

    return { status: 'success', message }
  } catch (error) {
    const message = getSyncErrorMessage(error)

    db.update(syncRuns).set({
      status: 'failed',
      finishedAt: unixNow(),
      message,
    }).where(eq(syncRuns.id, run.id)).run()

    return { status: 'failed', message }
  }
}

function getSyncErrorMessage(error: unknown) {
  if (error instanceof SimpleFinError) {
    return sanitizeSimpleFinMessage(error.message)
  }

  if (error instanceof ZodError) {
    const issue = error.issues[0]
    const path = issue?.path.length ? issue.path.join('.') : 'response'
    return `SimpleFIN returned data in an unexpected format at ${path}.`
  }

  if (error instanceof Error) {
    return sanitizeSimpleFinMessage(`Sync failed: ${error.message}`)
  }

  return 'Sync failed unexpectedly.'
}

function getSyncStartDate() {
  const db = getDb()
  const row = db.select({
    latest: sql<number | null>`max(${transactions.postedAt})`,
  }).from(transactions).where(eq(transactions.pending, false)).get()

  return getSyncStartDateFromLatest(row?.latest ?? null)
}

export function summarizeSimpleFinMessages(messages: Array<string | undefined>) {
  const uniqueMessages = new Map<string, string>()

  for (const message of messages) {
    if (!message) {
      continue
    }

    const sanitized = sanitizeSimpleFinMessage(message).trim()
    if (!sanitized) {
      continue
    }
    uniqueMessages.set(sanitized.toLocaleLowerCase(), sanitized)
  }

  return [...uniqueMessages.values()].join(' ')
}

export function getSyncStartDateFromLatest(latestPostedAt: number | null, now = unixNow()) {
  if (latestPostedAt && latestPostedAt > 0) {
    return Math.max(0, latestPostedAt - overlapSeconds)
  }

  return Math.max(0, now - initialSyncLookbackSeconds)
}

function getHistoricalBackfillAccounts() {
  const db = getDb()
  return db.select({
    accountId: accounts.id,
    connectionId: accounts.connectionId,
    simplefinId: accounts.simplefinId,
    historyCursor: accounts.historyCursor,
    earliestPostedAt: sql<number | null>`min(case when ${transactions.pending} = 0 and ${transactions.postedAt} > 0 then ${transactions.postedAt} end)`,
  }).from(accounts)
    .leftJoin(transactions, eq(accounts.id, transactions.accountId))
    .groupBy(accounts.id)
    .all()
}

export function createHistoricalBackfillStates(accounts: HistoricalBackfillAccount[], now = unixNow()) {
  return accounts.map((account): HistoricalBackfillState => ({
    accountId: account.accountId,
    connectionId: account.connectionId,
    simplefinId: account.simplefinId,
    cursor: getHistoricalBackfillCursor(account.historyCursor, account.earliestPostedAt, now),
    emptyWindows: 0,
    active: true,
  }))
}

export function buildHistoricalBackfillWindows(accounts: HistoricalBackfillState[]) {
  const windows = new Map<string, HistoricalBackfillWindow>()

  for (const account of accounts) {
    if (!account.active || account.cursor <= 0) {
      continue
    }

    const startDate = Math.max(0, account.cursor - historicalBackfillWindowSeconds)
    const key = `${startDate}:${account.cursor}`
    const window = windows.get(key)
    if (window) {
      window.accountIds.push(account.accountId)
      window.simplefinAccountIds.push(account.simplefinId)
    } else {
      windows.set(key, {
        startDate,
        endDate: account.cursor,
        accountIds: [account.accountId],
        simplefinAccountIds: [account.simplefinId],
      })
    }
  }

  return [...windows.values()].sort((a, b) => b.endDate - a.endDate)
}

export function getHistoricalBackfillCursor(historyCursor: number | null, earliestPostedAt: number | null, now = unixNow()) {
  if (historyCursor && historyCursor > 0) {
    return historyCursor
  }

  if (earliestPostedAt && earliestPostedAt > 0) {
    return earliestPostedAt
  }

  return now + 86_400
}

export function formatHistoricalImportMessage(input: {
  requestedWindows: number
  receivedTransactions: number
  insertedTransactions: number
  detailMessage?: string
  suffix?: string
}) {
  const { requestedWindows, receivedTransactions, insertedTransactions, detailMessage, suffix } = input
  return [
    `Historical import checked ${requestedWindows} window${requestedWindows === 1 ? '' : 's'}, received ${receivedTransactions} transaction${receivedTransactions === 1 ? '' : 's'} from SimpleFIN, and stored ${insertedTransactions} new transaction${insertedTransactions === 1 ? '' : 's'}.`,
    detailMessage,
  ].filter(Boolean).join(' ') + (suffix ?? '')
}

function updateAccountHistoryCursor(accountId: string, historyCursor: number) {
  getDb().update(accounts).set({
    historyCursor,
    updatedAt: unixNow(),
  }).where(eq(accounts.id, accountId)).run()
}

function upsertAccountSet(accountSet: SimpleFinAccountSet): UpsertAccountSetResult {
  const db = getDb()
  const now = unixNow()
  const rules = db.select().from(categoryRules).orderBy(desc(categoryRules.createdAt)).all()
  const categoryRows = db.select().from(categories).all()
  const transactionIds: string[] = []
  const insertedTransactionIds: string[] = []

  for (const connection of accountSet.connections) {
    db.insert(connections).values({
      id: connection.conn_id,
      name: connection.name,
      orgId: connection.org_id ?? null,
      orgName: connection.org_name ?? null,
      orgUrl: connection.org_url ?? null,
      simplefinUrl: connection.sfin_url ?? null,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: connections.id,
      set: {
        name: connection.name,
        orgId: connection.org_id ?? null,
        orgName: connection.org_name ?? null,
        orgUrl: connection.org_url ?? null,
        simplefinUrl: connection.sfin_url ?? null,
        updatedAt: now,
      },
    }).run()
  }

  for (const account of accountSet.accounts) {
    const accountId = `${account.conn_id}:${account.id}`
    db.insert(accounts).values({
      id: accountId,
      connectionId: account.conn_id,
      simplefinId: account.id,
      name: account.name,
      currency: account.currency,
      balance: Number(account.balance),
      availableBalance: account['available-balance'] ? Number(account['available-balance']) : null,
      balanceDate: account['balance-date'],
      updatedAt: now,
    }).onConflictDoUpdate({
      target: accounts.id,
      set: {
        name: account.name,
        currency: account.currency,
        balance: Number(account.balance),
        availableBalance: account['available-balance'] ? Number(account['available-balance']) : null,
        balanceDate: account['balance-date'],
        updatedAt: now,
      },
    }).run()

    for (const transaction of account.transactions ?? []) {
      const transactionId = `${accountId}:${transaction.id}`
      const existing = db.select().from(transactions).where(eq(transactions.id, transactionId)).get()
      transactionIds.push(transactionId)
      if (!existing) {
        insertedTransactionIds.push(transactionId)
      }
      const categorization = existing?.categorySource === 'manual'
        ? {
            categoryId: existing.categoryId,
            categorySource: 'manual',
            categoryConfidence: existing.categoryConfidence,
            categoryReason: existing.categoryReason,
            normalizedMerchant: existing.normalizedMerchant,
          }
        : categorizeTransaction({
            description: transaction.description,
            amount: Number(transaction.amount),
            accountName: account.name,
          }, categoryRows, rules)

      db.insert(transactions).values({
        id: transactionId,
        accountId,
        simplefinId: transaction.id,
        postedAt: transaction.posted,
        transactedAt: transaction.transacted_at ?? null,
        amount: Number(transaction.amount),
        currency: account.currency,
        description: transaction.description,
        pending: transaction.pending ?? false,
        categoryId: categorization.categoryId,
        categorySource: categorization.categorySource,
        categoryConfidence: categorization.categoryConfidence,
        categoryReason: categorization.categoryReason,
        normalizedMerchant: categorization.normalizedMerchant,
        raw: JSON.stringify(transaction),
        updatedAt: now,
      }).onConflictDoUpdate({
        target: transactions.id,
        set: {
          postedAt: transaction.posted,
          transactedAt: transaction.transacted_at ?? null,
          amount: Number(transaction.amount),
          currency: account.currency,
          description: transaction.description,
          pending: transaction.pending ?? false,
          categoryId: categorization.categoryId,
          categorySource: categorization.categorySource,
          categoryConfidence: categorization.categoryConfidence,
          categoryReason: categorization.categoryReason,
          normalizedMerchant: categorization.normalizedMerchant,
          raw: JSON.stringify(transaction),
          updatedAt: now,
        },
      }).run()
    }
  }

  return {
    transactionIds,
    insertedTransactionIds,
  }
}

function categorizeStoredTransactions() {
  const db = getDb()
  const rules = db.select().from(categoryRules).orderBy(desc(categoryRules.createdAt)).all()
  const categoryRows = db.select().from(categories).all()
  const rows = db.select({
    id: transactions.id,
    description: transactions.description,
    amount: transactions.amount,
    accountName: accounts.name,
  }).from(transactions)
    .leftJoin(accounts, eq(transactions.accountId, accounts.id))
    .where(sql`${transactions.categorySource} is null or ${transactions.categorySource} <> 'manual'`)
    .all()

  for (const row of rows) {
    const categorization = categorizeTransaction({
      description: row.description,
      amount: row.amount,
      accountName: row.accountName,
    }, categoryRows, rules)

    db.update(transactions).set({
      categoryId: categorization.categoryId,
      categorySource: categorization.categorySource,
      categoryConfidence: categorization.categoryConfidence,
      categoryReason: categorization.categoryReason,
      normalizedMerchant: categorization.normalizedMerchant,
      updatedAt: unixNow(),
    }).where(eq(transactions.id, row.id)).run()
  }
}

function countTransactionsByAccount(accountSet: SimpleFinAccountSet) {
  const counts = new Map<string, number>()
  for (const account of accountSet.accounts) {
    counts.set(getAccountId(account.conn_id, account.id), account.transactions?.length ?? 0)
  }
  return counts
}

function getAccountId(connectionId: string, simplefinId: string) {
  return `${connectionId}:${simplefinId}`
}

function unixNow() {
  return Math.floor(Date.now() / 1000)
}
