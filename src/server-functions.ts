import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

const transactionQuerySchema = z.object({
  search: z.string().optional(),
  categoryId: z.number().nullable().optional(),
  accountId: z.string().optional(),
  connectionId: z.string().optional(),
  pending: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  minAmount: z.number().optional(),
  maxAmount: z.number().optional(),
  page: z.number().optional(),
  pageSize: z.number().optional(),
  sortBy: z.string().optional(),
  sortDir: z.string().optional(),
  limit: z.number().optional(),
}).optional()

export const getDashboard = createServerFn({ method: 'GET' }).handler(async () => {
  const { requireAuthenticatedUser } = await import('./server/auth')
  await requireAuthenticatedUser()
  const { getDashboardData } = await import('./server/read-models')
  return getDashboardData()
})

export const getAccountsData = createServerFn({ method: 'GET' }).handler(async () => {
  const { requireAuthenticatedUser } = await import('./server/auth')
  await requireAuthenticatedUser()
  const { getAccountsPageData } = await import('./server/read-models')
  return getAccountsPageData()
})

export const getTransactionsData = createServerFn({ method: 'GET' })
  .inputValidator((data) => transactionQuerySchema.parse(data))
  .handler(async ({ data }) => {
    const { requireAuthenticatedUser } = await import('./server/auth')
    await requireAuthenticatedUser()
    const { getTransactionsPageData } = await import('./server/read-models')
    return getTransactionsPageData(data)
  })

export const getCategoriesData = createServerFn({ method: 'GET' }).handler(async () => {
  const { requireAuthenticatedUser } = await import('./server/auth')
  await requireAuthenticatedUser()
  const { getCategoriesPageData } = await import('./server/read-models')
  return getCategoriesPageData()
})

export const getSetupData = createServerFn({ method: 'GET' }).handler(async () => {
  const { requireAuthenticatedUser } = await import('./server/auth')
  await requireAuthenticatedUser()
  const { getSetupPageData } = await import('./server/read-models')
  return getSetupPageData()
})

export const claimSimpleFinToken = createServerFn({ method: 'POST' })
  .inputValidator((data) => z.object({ token: z.string().min(1) }).parse(data))
  .handler(async ({ data }) => {
    const { requireAuthenticatedUser } = await import('./server/auth')
    await requireAuthenticatedUser()
    const { claimSimpleFin } = await import('./server/actions')
    return claimSimpleFin(data)
  })

export const syncNow = createServerFn({ method: 'POST' }).handler(async () => {
  const { requireAuthenticatedUser } = await import('./server/auth')
  await requireAuthenticatedUser()
  const { runManualSync } = await import('./server/actions')
  return runManualSync()
})

export const importSimpleFinHistory = createServerFn({ method: 'POST' }).handler(async () => {
  const { requireAuthenticatedUser } = await import('./server/auth')
  await requireAuthenticatedUser()
  const { runHistoricalSync } = await import('./server/actions')
  return runHistoricalSync()
})

export const importTransactionsCsv = createServerFn({ method: 'POST' })
  .inputValidator((data) => z.object({
    fileName: z.string().min(1),
    contents: z.string().min(1),
    accountId: z.string().nullable().optional(),
  }).parse(data))
  .handler(async ({ data }) => {
    const { requireAuthenticatedUser } = await import('./server/auth')
    await requireAuthenticatedUser()
    const { importCsvTransactions } = await import('./server/actions')
    return importCsvTransactions(data)
  })

export const clearSimpleFin = createServerFn({ method: 'POST' }).handler(async () => {
  const { requireAuthenticatedUser } = await import('./server/auth')
  await requireAuthenticatedUser()
  const { clearSimpleFinConnection } = await import('./server/actions')
  return clearSimpleFinConnection()
})

export const setTransactionCategory = createServerFn({ method: 'POST' })
  .inputValidator((data) => z.object({
    transactionId: z.string().min(1),
    categoryId: z.number().nullable(),
  }).parse(data))
  .handler(async ({ data }) => {
    const { requireAuthenticatedUser } = await import('./server/auth')
    await requireAuthenticatedUser()
    const { assignCategory } = await import('./server/actions')
    return assignCategory(data)
  })

export const addCategory = createServerFn({ method: 'POST' })
  .inputValidator((data) => z.object({ name: z.string().min(1) }).parse(data))
  .handler(async ({ data }) => {
    const { requireAuthenticatedUser } = await import('./server/auth')
    await requireAuthenticatedUser()
    const { createCategory } = await import('./server/actions')
    return createCategory(data)
  })

export const addCategoryRule = createServerFn({ method: 'POST' })
  .inputValidator((data) => z.object({
    categoryId: z.number(),
    matchText: z.string().min(1),
  }).parse(data))
  .handler(async ({ data }) => {
    const { requireAuthenticatedUser } = await import('./server/auth')
    await requireAuthenticatedUser()
    const { createCategoryRule } = await import('./server/actions')
    return createCategoryRule(data)
  })

export const removeCategoryRule = createServerFn({ method: 'POST' })
  .inputValidator((data) => z.object({ ruleId: z.number() }).parse(data))
  .handler(async ({ data }) => {
    const { requireAuthenticatedUser } = await import('./server/auth')
    await requireAuthenticatedUser()
    const { deleteCategoryRule } = await import('./server/actions')
    return deleteCategoryRule(data)
  })

export const getCurrentUser = createServerFn({ method: 'GET' }).handler(async () => {
  const { getAuthenticatedUser, getAuthStatus } = await import('./server/auth')
  return {
    user: await getAuthenticatedUser(),
    auth: getAuthStatus(),
  }
})
