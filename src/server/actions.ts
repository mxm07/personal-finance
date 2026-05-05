import { claimAccessUrl } from './simplefin/client'
import { clearAccessUrl, writeAccessUrl } from './secret'
import { syncSimpleFin, syncSimpleFinHistory } from './sync'
import { normalizeMerchant } from './finance/categorization'
import { getStore } from './storage/store'

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
  const store = getStore()
  const transaction = await store.getTransaction(input.transactionId)

  await store.updateTransaction(input.transactionId, {
    categoryId: input.categoryId,
    categorySource: input.categoryId ? 'manual' : null,
    categoryConfidence: input.categoryId ? 1 : null,
    categoryReason: input.categoryId ? 'set manually' : null,
    normalizedMerchant: transaction ? normalizeMerchant(transaction.description) : null,
    updatedAt: unixNow(),
  })

  if (transaction && input.categoryId) {
    await learnRuleFromManualCategory(transaction.description, input.categoryId)
  }

  return { ok: true }
}

export async function createCategory(input: { name: string }) {
  const name = input.name.trim()
  if (!name) {
    throw new Error('Category name is required.')
  }
  const color = palette[name.length % palette.length]
  await getStore().createCategory({
    name,
    color,
    createdAt: unixNow(),
  })

  return { ok: true }
}

export async function createCategoryRule(input: { categoryId: number; matchText: string }) {
  const matchText = input.matchText.trim().toLocaleLowerCase()
  if (!matchText) {
    throw new Error('Rule text is required.')
  }
  await getStore().createCategoryRule({
    categoryId: input.categoryId,
    matchText,
    createdAt: unixNow(),
  })

  return { ok: true }
}

export async function deleteCategoryRule(input: { ruleId: number }) {
  await getStore().deleteCategoryRule(input.ruleId)
  return { ok: true }
}

function unixNow() {
  return Math.floor(Date.now() / 1000)
}

async function learnRuleFromManualCategory(description: string, categoryId: number) {
  const matchText = normalizeMerchant(description)
  if (!matchText || matchText.length < 4 || learnedRuleBlocklist.has(matchText)) {
    return
  }

  const store = getStore()
  const existing = await store.findCategoryRule(categoryId, matchText)
  if (existing) {
    return
  }

  await store.createCategoryRule({
    categoryId,
    matchText,
    createdAt: unixNow(),
  })
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
