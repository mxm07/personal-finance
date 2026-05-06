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
const pageAuthSchema = z.object({
  redirectTo: z.string().optional(),
}).optional()

type ServerFnContext<TData = unknown> = {
  data: TData
}

async function withAuth<TResult>(handler: () => Promise<TResult>) {
  const { requireAuthenticatedUserForServerFn } = await import('./server/auth')
  await requireAuthenticatedUserForServerFn()
  return handler()
}

async function withAuthInput<TData, TResult>(
  context: ServerFnContext<TData>,
  handler: (data: TData) => Promise<TResult>,
) {
  const { requireAuthenticatedUserForServerFn } = await import('./server/auth')
  await requireAuthenticatedUserForServerFn()
  return handler(context.data)
}

export const getDashboard = createServerFn({ method: 'GET' }).handler(() => withAuth(async () => {
  const { getDashboardData } = await import('./server/read-models')
  return getDashboardData()
}))

export const getAccountsData = createServerFn({ method: 'GET' }).handler(() => withAuth(async () => {
  const { getAccountsPageData } = await import('./server/read-models')
  return getAccountsPageData()
}))

export const getTransactionsData = createServerFn({ method: 'GET' })
  .inputValidator((data) => transactionQuerySchema.parse(data))
  .handler((context) => withAuthInput(context, async (data) => {
    const { getTransactionsPageData } = await import('./server/read-models')
    return getTransactionsPageData(data)
  }))

export const getCategoriesData = createServerFn({ method: 'GET' }).handler(() => withAuth(async () => {
  const { getCategoriesPageData } = await import('./server/read-models')
  return getCategoriesPageData()
}))

export const getSetupData = createServerFn({ method: 'GET' }).handler(() => withAuth(async () => {
  const { getSetupPageData } = await import('./server/read-models')
  return getSetupPageData()
}))

export const claimSimpleFinToken = createServerFn({ method: 'POST' })
  .inputValidator((data) => z.object({ token: z.string().min(1) }).parse(data))
  .handler((context) => withAuthInput(context, async (data) => {
    const { claimSimpleFin } = await import('./server/actions')
    return claimSimpleFin(data)
  }))

export const syncNow = createServerFn({ method: 'POST' }).handler(() => withAuth(async () => {
  const { runManualSync } = await import('./server/actions')
  return runManualSync()
}))

export const syncIfStale = createServerFn({ method: 'POST' }).handler(() => withAuth(async () => {
  const { runStaleSync } = await import('./server/actions')
  return runStaleSync()
}))

export const importSimpleFinHistory = createServerFn({ method: 'POST' }).handler(() => withAuth(async () => {
  const { runHistoricalSync } = await import('./server/actions')
  return runHistoricalSync()
}))

export const importTransactionsCsv = createServerFn({ method: 'POST' })
  .inputValidator((data) => z.object({
    fileName: z.string().min(1),
    contents: z.string().min(1),
    accountId: z.string().nullable().optional(),
  }).parse(data))
  .handler((context) => withAuthInput(context, async (data) => {
    const { importCsvTransactions } = await import('./server/actions')
    return importCsvTransactions(data)
  }))

export const clearSimpleFin = createServerFn({ method: 'POST' }).handler(() => withAuth(async () => {
  const { clearSimpleFinConnection } = await import('./server/actions')
  return clearSimpleFinConnection()
}))

export const setTransactionCategory = createServerFn({ method: 'POST' })
  .inputValidator((data) => z.object({
    transactionId: z.string().min(1),
    categoryId: z.number().nullable(),
  }).parse(data))
  .handler((context) => withAuthInput(context, async (data) => {
    const { assignCategory } = await import('./server/actions')
    return assignCategory(data)
  }))

export const addCategory = createServerFn({ method: 'POST' })
  .inputValidator((data) => z.object({ name: z.string().min(1) }).parse(data))
  .handler((context) => withAuthInput(context, async (data) => {
    const { createCategory } = await import('./server/actions')
    return createCategory(data)
  }))

export const addCategoryRule = createServerFn({ method: 'POST' })
  .inputValidator((data) => z.object({
    categoryId: z.number(),
    matchText: z.string().min(1),
  }).parse(data))
  .handler((context) => withAuthInput(context, async (data) => {
    const { createCategoryRule } = await import('./server/actions')
    return createCategoryRule(data)
  }))

export const removeCategoryRule = createServerFn({ method: 'POST' })
  .inputValidator((data) => z.object({ ruleId: z.number() }).parse(data))
  .handler((context) => withAuthInput(context, async (data) => {
    const { deleteCategoryRule } = await import('./server/actions')
    return deleteCategoryRule(data)
  }))

export const requirePageAuthenticatedUser = createServerFn({ method: 'GET' })
  .inputValidator((data) => pageAuthSchema.parse(data))
  .handler(async ({ data }) => {
    const { requireAuthenticatedUserForPage } = await import('./server/auth')
    return requireAuthenticatedUserForPage(data?.redirectTo)
  })

export const getCurrentUser = createServerFn({ method: 'GET' }).handler(async () => {
  const { getAuthenticatedUser, getAuthStatus } = await import('./server/auth')
  return {
    user: await getAuthenticatedUser(),
    auth: getAuthStatus(),
  }
})
