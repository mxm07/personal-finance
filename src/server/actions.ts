import { eq } from 'drizzle-orm'
import { categories, categoryRules, transactions } from './db/schema'
import { getDb } from './db/client'
import { claimAccessUrl } from './simplefin/client'
import { clearAccessUrl, writeAccessUrl } from './secret'
import { syncSimpleFin } from './sync'

const palette = ['#236b46', '#8b5e1d', '#a73e2f', '#245b73', '#6b5b95', '#537a5a', '#b35c44', '#9c6a18']

export async function claimSimpleFin(input: { token: string }) {
  const accessUrl = await claimAccessUrl(input.token)
  await writeAccessUrl(accessUrl)
  return syncSimpleFin('claim')
}

export async function runManualSync() {
  return syncSimpleFin('manual')
}

export async function clearSimpleFinConnection() {
  await clearAccessUrl()
  return { status: 'success' as const, message: 'SimpleFIN credentials removed.' }
}

export async function assignCategory(input: { transactionId: string; categoryId: number | null }) {
  getDb().update(transactions).set({
    categoryId: input.categoryId,
    categorySource: input.categoryId ? 'manual' : null,
    updatedAt: unixNow(),
  }).where(eq(transactions.id, input.transactionId)).run()

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
