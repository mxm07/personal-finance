import { integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const syncRuns = sqliteTable('sync_runs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  trigger: text('trigger').notNull(),
  status: text('status').notNull(),
  startedAt: integer('started_at').notNull(),
  finishedAt: integer('finished_at'),
  message: text('message'),
})

export const connections = sqliteTable('connections', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  orgId: text('org_id'),
  orgName: text('org_name'),
  orgUrl: text('org_url'),
  simplefinUrl: text('simplefin_url'),
  updatedAt: integer('updated_at').notNull(),
})

export const accounts = sqliteTable('accounts', {
  id: text('id').primaryKey(),
  connectionId: text('connection_id').notNull().references(() => connections.id),
  simplefinId: text('simplefin_id').notNull(),
  name: text('name').notNull(),
  currency: text('currency').notNull(),
  balance: real('balance').notNull(),
  availableBalance: real('available_balance'),
  balanceDate: integer('balance_date').notNull(),
  historyCursor: integer('history_cursor'),
  updatedAt: integer('updated_at').notNull(),
}, (table) => ({
  accountIdentity: uniqueIndex('accounts_connection_simplefin_unique').on(table.connectionId, table.simplefinId),
}))

export const categories = sqliteTable('categories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  color: text('color').notNull(),
  createdAt: integer('created_at').notNull(),
})

export const categoryRules = sqliteTable('category_rules', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  categoryId: integer('category_id').notNull().references(() => categories.id),
  matchText: text('match_text').notNull(),
  createdAt: integer('created_at').notNull(),
})

export const transactions = sqliteTable('transactions', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull().references(() => accounts.id),
  simplefinId: text('simplefin_id').notNull(),
  postedAt: integer('posted_at').notNull(),
  transactedAt: integer('transacted_at'),
  amount: real('amount').notNull(),
  currency: text('currency').notNull(),
  description: text('description').notNull(),
  pending: integer('pending', { mode: 'boolean' }).notNull(),
  categoryId: integer('category_id').references(() => categories.id),
  categorySource: text('category_source'),
  categoryConfidence: real('category_confidence'),
  categoryReason: text('category_reason'),
  normalizedMerchant: text('normalized_merchant'),
  raw: text('raw').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (table) => ({
  transactionIdentity: uniqueIndex('transactions_account_simplefin_unique').on(table.accountId, table.simplefinId),
}))

export type Category = typeof categories.$inferSelect
export type CategoryRule = typeof categoryRules.$inferSelect
export type Transaction = typeof transactions.$inferSelect
