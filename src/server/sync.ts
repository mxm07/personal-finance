import { desc, eq, sql } from 'drizzle-orm'
import { ZodError } from 'zod'
import { accounts, categoryRules, connections, syncRuns, transactions } from './db/schema'
import { getDb } from './db/client'
import { readAccessUrl } from './secret'
import { fetchAccountSet, sanitizeSimpleFinMessage, SimpleFinError } from './simplefin/client'
import type { SimpleFinAccountSet } from './simplefin/types'
import { matchCategoryRule } from './finance/categories'

const overlapSeconds = 60 * 60 * 24 * 3
let syncInFlight: Promise<SyncResult> | undefined
let startupSyncStarted = false

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
    const message = accountSet.errlist.length
      ? accountSet.errlist.map((error) => sanitizeSimpleFinMessage(error.msg ?? error.message ?? error.code)).join(' ')
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

  return Math.max(0, (row?.latest ?? 0) - overlapSeconds)
}

function upsertAccountSet(accountSet: SimpleFinAccountSet) {
  const db = getDb()
  const now = unixNow()
  const rules = db.select().from(categoryRules).orderBy(desc(categoryRules.createdAt)).all()

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
      const rule = existing?.categorySource === 'manual'
        ? undefined
        : matchCategoryRule(transaction.description, rules)

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
        categoryId: existing?.categorySource === 'manual' ? existing.categoryId : (rule?.categoryId ?? existing?.categoryId ?? null),
        categorySource: existing?.categorySource === 'manual' ? 'manual' : (rule ? 'rule' : existing?.categorySource ?? null),
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
          categoryId: existing?.categorySource === 'manual' ? existing.categoryId : (rule?.categoryId ?? existing?.categoryId ?? null),
          categorySource: existing?.categorySource === 'manual' ? 'manual' : (rule ? 'rule' : existing?.categorySource ?? null),
          raw: JSON.stringify(transaction),
          updatedAt: now,
        },
      }).run()
    }
  }
}

function unixNow() {
  return Math.floor(Date.now() / 1000)
}
