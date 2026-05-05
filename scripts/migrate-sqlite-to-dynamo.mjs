import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import Database from 'better-sqlite3'
import {
  CreateTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
  ResourceNotFoundException,
} from '@aws-sdk/client-dynamodb'
import { BatchWriteCommand, DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'

const root = process.cwd()
const sqlitePath = process.env.SQLITE_PATH ?? path.join(root, '.data', 'finance.sqlite')
const secretPath = process.env.SIMPLEFIN_SECRET_PATH ?? path.join(root, '.data', 'simplefin.secret.json')
const tableName = process.env.DYNAMODB_TABLE_NAME ?? 'personal-finance-dev'
const endpoint = process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000'
const region = process.env.AWS_REGION ?? 'us-east-1'

const rawClient = new DynamoDBClient({
  region,
  endpoint,
  credentials: endpoint
    ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? 'local',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? 'local',
      }
    : undefined,
})
const client = DynamoDBDocumentClient.from(rawClient, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
})

await ensureTable()

const db = new Database(sqlitePath, { readonly: true, fileMustExist: true })

const now = Math.floor(Date.now() / 1000)
const items = [
  ...readConnections(),
  ...readAccounts(),
  ...readCategories(),
  ...readCategoryRules(),
  ...readTransactions(),
  ...readSyncRuns(),
]
const settings = await readSettings()
items.push(...settings)
items.push(...readCounters())

await writeItems(items)

console.log(`Migrated ${items.length} DynamoDB item${items.length === 1 ? '' : 's'} into ${tableName}.`)
console.log(`Source SQLite: ${sqlitePath}`)
console.log(`DynamoDB endpoint: ${endpoint || 'AWS default'}`)

function readConnections() {
  return selectAll('connections').map((row) => item('CONNECTION', row.id, 'connection', {
    id: row.id,
    name: row.name,
    orgId: row.org_id,
    orgName: row.org_name,
    orgUrl: row.org_url,
    simplefinUrl: row.simplefin_url,
    updatedAt: row.updated_at,
  }))
}

function readAccounts() {
  return selectAll('accounts').map((row) => item('ACCOUNT', row.id, 'account', {
    id: row.id,
    connectionId: row.connection_id,
    simplefinId: row.simplefin_id,
    name: row.name,
    currency: row.currency,
    balance: row.balance,
    availableBalance: row.available_balance,
    balanceDate: row.balance_date,
    historyCursor: row.history_cursor,
    updatedAt: row.updated_at,
  }))
}

function readCategories() {
  return selectAll('categories').map((row) => item('CATEGORY', padId(row.id), 'category', {
    id: row.id,
    name: row.name,
    color: row.color,
    createdAt: row.created_at,
  }))
}

function readCategoryRules() {
  return selectAll('category_rules').map((row) => item('CATEGORY_RULE', padId(row.id), 'categoryRule', {
    id: row.id,
    categoryId: row.category_id,
    matchText: row.match_text,
    createdAt: row.created_at,
  }))
}

function readTransactions() {
  return selectAll('transactions').map((row) => item('TRANSACTION', row.id, 'transaction', {
    id: row.id,
    accountId: row.account_id,
    simplefinId: row.simplefin_id,
    postedAt: row.posted_at,
    transactedAt: row.transacted_at,
    amount: row.amount,
    currency: row.currency,
    description: row.description,
    pending: Boolean(row.pending),
    categoryId: row.category_id,
    categorySource: row.category_source,
    categoryConfidence: row.category_confidence,
    categoryReason: row.category_reason,
    normalizedMerchant: row.normalized_merchant,
    raw: row.raw,
    updatedAt: row.updated_at,
  }))
}

function readSyncRuns() {
  return selectAll('sync_runs').map((row) => item('SYNC_RUN', padId(row.id), 'syncRun', {
    id: row.id,
    trigger: row.trigger,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    message: row.message,
  }))
}

async function readSettings() {
  const rows = []
  for (const row of selectAll('settings')) {
    rows.push(item('SETTING', row.key, 'setting', {
      key: row.key,
      value: row.value,
      updatedAt: row.updated_at,
    }))
  }

  try {
    const raw = await readFile(secretPath, 'utf8')
    const parsed = JSON.parse(raw)
    if (typeof parsed.accessUrl === 'string' && parsed.accessUrl) {
      rows.push(item('SETTING', 'simplefin.accessUrl', 'setting', {
        key: 'simplefin.accessUrl',
        value: parsed.accessUrl,
        updatedAt: parsed.updatedAt ? Math.floor(new Date(parsed.updatedAt).getTime() / 1000) : now,
      }))
    }
  } catch {
    // The SimpleFIN secret file is optional.
  }

  return rows
}

function readCounters() {
  return [
    counter('category', maxId('categories')),
    counter('categoryRule', maxId('category_rules')),
    counter('syncRun', maxId('sync_runs')),
  ]
}

function selectAll(table) {
  if (!tableExists(table)) {
    return []
  }
  return db.prepare(`select * from ${table}`).all()
}

function tableExists(table) {
  return Boolean(db.prepare("select name from sqlite_master where type = 'table' and name = ?").get(table))
}

function maxId(table) {
  if (!tableExists(table)) {
    return 0
  }
  return Number(db.prepare(`select max(id) as id from ${table}`).get()?.id ?? 0)
}

function item(pk, sk, entity, value) {
  return {
    pk,
    sk,
    entity,
    ...value,
  }
}

function counter(name, value) {
  return {
    pk: 'COUNTER',
    sk: name,
    entity: 'counter',
    value,
  }
}

async function ensureTable() {
  try {
    await rawClient.send(new DescribeTableCommand({ TableName: tableName }))
    return
  } catch (error) {
    if (!(error instanceof ResourceNotFoundException)) {
      throw error
    }
  }

  await rawClient.send(new CreateTableCommand({
    TableName: tableName,
    AttributeDefinitions: [
      { AttributeName: 'pk', AttributeType: 'S' },
      { AttributeName: 'sk', AttributeType: 'S' },
    ],
    KeySchema: [
      { AttributeName: 'pk', KeyType: 'HASH' },
      { AttributeName: 'sk', KeyType: 'RANGE' },
    ],
    BillingMode: 'PAY_PER_REQUEST',
  }))
}

async function writeItems(items) {
  for (let index = 0; index < items.length; index += 25) {
    const batch = items.slice(index, index + 25)
    await writeBatch(batch)
  }
}

async function writeBatch(items) {
  if (!items.length) {
    return
  }

  let requestItems = {
    [tableName]: items.map((entry) => ({
      PutRequest: {
        Item: entry,
      },
    })),
  }

  do {
    const result = await client.send(new BatchWriteCommand({ RequestItems: requestItems }))
    requestItems = result.UnprocessedItems ?? {}
  } while (Object.keys(requestItems).length)
}

function padId(id) {
  return String(id).padStart(12, '0')
}
