import { and, eq } from 'drizzle-orm'
import { categories, categoryRules, transactions } from './db/schema'
import { getDb } from './db/client'
import { claimAccessUrl } from './simplefin/client'
import { clearAccessUrl, writeAccessUrl } from './secret'
import { syncSimpleFin, syncSimpleFinHistory } from './sync'
import { normalizeMerchant } from './finance/categorization'

const palette = ['#236b46', '#8b5e1d', '#a73e2f', '#245b73', '#6b5b95', '#537a5a', '#b35c44', '#9c6a18']

export async function claimSimpleFin(input: { token: string }) {
  const accessUrl = await claimAccessUrl(input.token)
  await writeAccessUrl(accessUrl)
  return syncSimpleFin('claim')
}

export async function runManualSync() {
  return syncSimpleFin('manual')
}

export async function runHistoricalSync() {
  return syncSimpleFinHistory()
}

export async function importCsvTransactions(input: { fileName: string; contents: string; accountId?: string | null }) {
  const { importTransactionsCsv } = await import('./finance/csv-import')
  return importTransactionsCsv(input)
}

export async function clearSimpleFinConnection() {
  await clearAccessUrl()
  return { status: 'success' as const, message: 'SimpleFIN credentials removed.' }
}

export async function assignCategory(input: { transactionId: string; categoryId: number | null }) {
  const db = getDb()
  const transaction = db.select().from(transactions).where(eq(transactions.id, input.transactionId)).get()

  db.update(transactions).set({
    categoryId: input.categoryId,
    categorySource: input.categoryId ? 'manual' : null,
    categoryConfidence: input.categoryId ? 1 : null,
    categoryReason: input.categoryId ? 'set manually' : null,
    normalizedMerchant: transaction ? normalizeMerchant(transaction.description) : null,
    updatedAt: unixNow(),
  }).where(eq(transactions.id, input.transactionId)).run()

  if (transaction && input.categoryId) {
    learnRuleFromManualCategory(transaction.description, input.categoryId)
  }

  return { ok: true }
}

export async function createCategory(input: { name: string }) {
  const name = input.name.trim()
  if (!name) {
    throw new Error('Category name is required.')
  }
  const color = palette[name.length % palette.length]
  getDb().insert(categories).values({
    name,
    color,
    createdAt: unixNow(),
  }).onConflictDoNothing().run()

  return { ok: true }
}

export async function createCategoryRule(input: { categoryId: number; matchText: string }) {
  const matchText = input.matchText.trim().toLocaleLowerCase()
  if (!matchText) {
    throw new Error('Rule text is required.')
  }
  getDb().insert(categoryRules).values({
    categoryId: input.categoryId,
    matchText,
    createdAt: unixNow(),
  }).run()

  return { ok: true }
}

export async function deleteCategoryRule(input: { ruleId: number }) {
  getDb().delete(categoryRules).where(eq(categoryRules.id, input.ruleId)).run()
  return { ok: true }
}

function unixNow() {
  return Math.floor(Date.now() / 1000)
}

function learnRuleFromManualCategory(description: string, categoryId: number) {
  const matchText = normalizeMerchant(description)
  if (!matchText || matchText.length < 4 || learnedRuleBlocklist.has(matchText)) {
    return
  }

  const db = getDb()
  const existing = db.select().from(categoryRules).where(and(
    eq(categoryRules.categoryId, categoryId),
    eq(categoryRules.matchText, matchText),
  )).get()

  if (existing) {
    return
  }

  db.insert(categoryRules).values({
    categoryId,
    matchText,
    createdAt: unixNow(),
  }).run()
}

const learnedRuleBlocklist = new Set([
  'ach',
  'debit',
  'credit',
  'card',
  'purchase',
  'payment',
  'withdrawal',
  'deposit',
])
