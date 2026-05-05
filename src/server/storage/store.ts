import {
  CreateTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
  ResourceNotFoundException,
} from '@aws-sdk/client-dynamodb'
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb'

export type ConnectionRecord = {
  id: string
  name: string
  orgId: string | null
  orgName: string | null
  orgUrl: string | null
  simplefinUrl: string | null
  updatedAt: number
}

export type AccountRecord = {
  id: string
  connectionId: string
  simplefinId: string
  name: string
  currency: string
  balance: number
  availableBalance: number | null
  balanceDate: number
  historyCursor: number | null
  updatedAt: number
}

export type CategoryRecord = {
  id: number
  name: string
  color: string
  createdAt: number
}

export type CategoryRuleRecord = {
  id: number
  categoryId: number
  matchText: string
  createdAt: number
}

export type TransactionRecord = {
  id: string
  accountId: string
  simplefinId: string
  postedAt: number
  transactedAt: number | null
  amount: number
  currency: string
  description: string
  pending: boolean
  categoryId: number | null
  categorySource: string | null
  categoryConfidence: number | null
  categoryReason: string | null
  normalizedMerchant: string | null
  raw: string
  updatedAt: number
}

export type SyncRunRecord = {
  id: number
  trigger: string
  status: string
  startedAt: number
  finishedAt: number | null
  message: string | null
}

type EntityName = 'account' | 'category' | 'categoryRule' | 'connection' | 'setting' | 'syncRun' | 'transaction'
type StoredItem<T> = T & {
  pk: string
  sk: string
  entity: EntityName | 'counter'
}

const defaultCategories: Array<Omit<CategoryRecord, 'createdAt'>> = [
  { id: 1, name: 'Income', color: '#236b46' },
  { id: 2, name: 'Groceries', color: '#8b5e1d' },
  { id: 3, name: 'Dining', color: '#a73e2f' },
  { id: 4, name: 'Housing', color: '#245b73' },
  { id: 5, name: 'Transportation', color: '#6b5b95' },
  { id: 6, name: 'Utilities', color: '#537a5a' },
  { id: 7, name: 'Healthcare', color: '#b35c44' },
  { id: 8, name: 'Shopping', color: '#4f7cff' },
  { id: 9, name: 'Entertainment', color: '#6f57ff' },
  { id: 10, name: 'Travel', color: '#30b6c9' },
  { id: 11, name: 'Personal Care', color: '#b35c44' },
  { id: 12, name: 'Fees', color: '#a73e2f' },
  { id: 13, name: 'Transfers', color: '#756c5b' },
  { id: 14, name: 'Uncategorized', color: '#9c6a18' },
]

let store: AppStore | undefined

export function getStore() {
  store ??= new AppStore()
  return store
}

class AppStore {
  private readonly client: DynamoDBDocumentClient
  private readonly rawClient: DynamoDBClient
  private readonly tableName = process.env.DYNAMODB_TABLE_NAME ?? 'personal-finance-dev'
  private ready: Promise<void> | undefined

  constructor() {
    this.rawClient = new DynamoDBClient({
      region: process.env.AWS_REGION ?? 'us-east-1',
      endpoint: process.env.DYNAMODB_ENDPOINT || undefined,
      credentials: process.env.DYNAMODB_ENDPOINT
        ? {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? 'local',
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? 'local',
          }
        : undefined,
    })
    this.client = DynamoDBDocumentClient.from(this.rawClient, {
      marshallOptions: {
        removeUndefinedValues: true,
      },
    })
  }

  async createSyncRun(input: Omit<SyncRunRecord, 'id' | 'finishedAt' | 'message'> & Partial<Pick<SyncRunRecord, 'finishedAt' | 'message'>>) {
    await this.ensureReady()
    const id = await this.nextId('syncRun')
    const run: SyncRunRecord = {
      id,
      trigger: input.trigger,
      status: input.status,
      startedAt: input.startedAt,
      finishedAt: input.finishedAt ?? null,
      message: input.message ?? null,
    }
    await this.put('SYNC_RUN', padId(id), 'syncRun', run)
    return run
  }

  async getSetting(key: string) {
    const setting = await this.get<{ key: string; value: string; updatedAt: number }>('SETTING', key)
    return setting?.value ?? null
  }

  async putSetting(key: string, value: string) {
    await this.put('SETTING', key, 'setting', {
      key,
      value,
      updatedAt: Math.floor(Date.now() / 1000),
    })
  }

  async deleteSetting(key: string) {
    await this.ensureReady()
    await this.client.send(new DeleteCommand({
      TableName: this.tableName,
      Key: { pk: 'SETTING', sk: key },
    }))
  }

  async updateSyncRun(id: number, input: Partial<Omit<SyncRunRecord, 'id'>>) {
    const existing = await this.getSyncRun(id)
    if (!existing) {
      return
    }
    await this.put('SYNC_RUN', padId(id), 'syncRun', { ...existing, ...input, id })
  }

  async listSyncRuns() {
    await this.ensureReady()
    return this.scanEntity<SyncRunRecord>('SYNC_RUN')
  }

  async getLatestSyncRun() {
    const rows = await this.listSyncRuns()
    return rows.sort((a, b) => b.startedAt - a.startedAt)[0] ?? null
  }

  async getSyncRun(id: number) {
    return this.get<SyncRunRecord>('SYNC_RUN', padId(id))
  }

  async listConnections() {
    await this.ensureReady()
    return this.scanEntity<ConnectionRecord>('CONNECTION')
  }

  async getConnectionByName(name: string) {
    const rows = await this.listConnections()
    return rows.find((connection) => connection.name === name) ?? null
  }

  async upsertConnection(connection: ConnectionRecord) {
    await this.put('CONNECTION', connection.id, 'connection', connection)
  }

  async listAccounts() {
    await this.ensureReady()
    return this.scanEntity<AccountRecord>('ACCOUNT')
  }

  async getAccount(id: string) {
    return this.get<AccountRecord>('ACCOUNT', id)
  }

  async upsertAccount(account: AccountRecord) {
    const existing = await this.getAccount(account.id)
    await this.put('ACCOUNT', account.id, 'account', {
      ...account,
      historyCursor: account.historyCursor ?? existing?.historyCursor ?? null,
    })
  }

  async updateAccountHistoryCursor(accountId: string, historyCursor: number, updatedAt: number) {
    const existing = await this.getAccount(accountId)
    if (!existing) {
      return
    }
    await this.put('ACCOUNT', accountId, 'account', { ...existing, historyCursor, updatedAt })
  }

  async listCategories() {
    await this.ensureReady()
    return (await this.scanEntity<CategoryRecord>('CATEGORY')).sort((a, b) => a.name.localeCompare(b.name))
  }

  async createCategory(input: { name: string; color: string; createdAt: number }) {
    const existing = (await this.listCategories()).find((category) => category.name.toLocaleLowerCase() === input.name.toLocaleLowerCase())
    if (existing) {
      return existing
    }
    const id = await this.nextId('category')
    const category = { ...input, id }
    await this.put('CATEGORY', padId(id), 'category', category)
    return category
  }

  async listCategoryRules() {
    await this.ensureReady()
    return (await this.scanEntity<CategoryRuleRecord>('CATEGORY_RULE')).sort((a, b) => b.createdAt - a.createdAt)
  }

  async createCategoryRule(input: Omit<CategoryRuleRecord, 'id'>) {
    const id = await this.nextId('categoryRule')
    const rule = { ...input, id }
    await this.put('CATEGORY_RULE', padId(id), 'categoryRule', rule)
    return rule
  }

  async deleteCategoryRule(id: number) {
    await this.ensureReady()
    await this.client.send(new DeleteCommand({
      TableName: this.tableName,
      Key: { pk: 'CATEGORY_RULE', sk: padId(id) },
    }))
  }

  async findCategoryRule(categoryId: number, matchText: string) {
    const rules = await this.listCategoryRules()
    return rules.find((rule) => rule.categoryId === categoryId && rule.matchText === matchText) ?? null
  }

  async listTransactions() {
    await this.ensureReady()
    return this.scanEntity<TransactionRecord>('TRANSACTION')
  }

  async listTransactionsByAccountIds(accountIds: string[]) {
    const accountSet = new Set(accountIds)
    return (await this.listTransactions()).filter((transaction) => accountSet.has(transaction.accountId))
  }

  async getTransaction(id: string) {
    return this.get<TransactionRecord>('TRANSACTION', id)
  }

  async upsertTransaction(transaction: TransactionRecord) {
    await this.put('TRANSACTION', transaction.id, 'transaction', transaction)
  }

  async insertTransactionIfAbsent(transaction: TransactionRecord) {
    await this.ensureReady()
    try {
      await this.client.send(new PutCommand({
        TableName: this.tableName,
        Item: this.item('TRANSACTION', transaction.id, 'transaction', transaction),
        ConditionExpression: 'attribute_not_exists(pk)',
      }))
      return true
    } catch (error) {
      if (isConditionalCheckFailed(error)) {
        return false
      }
      throw error
    }
  }

  async updateTransaction(id: string, input: Partial<Omit<TransactionRecord, 'id'>>) {
    const existing = await this.getTransaction(id)
    if (!existing) {
      return
    }
    await this.upsertTransaction({ ...existing, ...input, id })
  }

  private async ensureReady() {
    this.ready ??= this.initialize()
    await this.ready
  }

  private async initialize() {
    if (process.env.DYNAMODB_ENDPOINT) {
      await this.ensureTable()
    }
    await this.ensureDefaultCategories()
  }

  private async ensureTable() {
    try {
      await this.rawClient.send(new DescribeTableCommand({ TableName: this.tableName }))
      return
    } catch (error) {
      if (!(error instanceof ResourceNotFoundException)) {
        throw error
      }
    }

    await this.rawClient.send(new CreateTableCommand({
      TableName: this.tableName,
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

  private async ensureDefaultCategories() {
    const now = Math.floor(Date.now() / 1000)
    for (const category of defaultCategories) {
      await this.client.send(new PutCommand({
        TableName: this.tableName,
        Item: this.item('CATEGORY', padId(category.id), 'category', { ...category, createdAt: now }),
        ConditionExpression: 'attribute_not_exists(pk)',
      })).catch((error) => {
        if (!isConditionalCheckFailed(error)) {
          throw error
        }
      })
    }

    await this.ensureCounterAtLeast('category', defaultCategories.length)
  }

  private async ensureCounterAtLeast(name: string, value: number) {
    await this.ensureReadyForCounter()
    const key = { pk: 'COUNTER', sk: name }
    const existing = await this.client.send(new GetCommand({ TableName: this.tableName, Key: key }))
    const current = Number((existing.Item as { value?: number } | undefined)?.value ?? 0)
    if (current < value) {
      await this.client.send(new PutCommand({
        TableName: this.tableName,
        Item: { ...key, entity: 'counter', value },
      }))
    }
  }

  private async ensureReadyForCounter() {
    if (process.env.DYNAMODB_ENDPOINT) {
      await this.ensureTable()
    }
  }

  private async nextId(name: 'category' | 'categoryRule' | 'syncRun') {
    await this.ensureReadyForCounter()
    const result = await this.client.send(new UpdateCommand({
      TableName: this.tableName,
      Key: { pk: 'COUNTER', sk: name },
      UpdateExpression: 'ADD #value :increment',
      ExpressionAttributeNames: { '#value': 'value' },
      ExpressionAttributeValues: { ':increment': 1 },
      ReturnValues: 'UPDATED_NEW',
    }))

    return Number((result.Attributes as { value?: number } | undefined)?.value ?? 1)
  }

  private async scanEntity<T>(pk: string) {
    const items: Array<StoredItem<T>> = []
    let startKey: Record<string, unknown> | undefined

    do {
      const result = await this.client.send(new QueryCommand({
        TableName: this.tableName,
        ExclusiveStartKey: startKey,
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: { ':pk': pk },
      }))

      items.push(...(result.Items ?? []) as Array<StoredItem<T>>)
      startKey = result.LastEvaluatedKey
    } while (startKey)

    return items.map((item) => stripKeys(item))
  }

  private async get<T>(pk: string, sk: string) {
    await this.ensureReady()
    const result = await this.client.send(new GetCommand({
      TableName: this.tableName,
      Key: { pk, sk },
    }))
    return result.Item ? stripKeys(result.Item as StoredItem<T>) : null
  }

  private async put<T extends object>(pk: string, sk: string, entity: EntityName, value: T) {
    await this.ensureReady()
    await this.client.send(new PutCommand({
      TableName: this.tableName,
      Item: this.item(pk, sk, entity, value),
    }))
  }

  private item<T extends object>(pk: string, sk: string, entity: EntityName, value: T) {
    return {
      pk,
      sk,
      entity,
      ...value,
    }
  }
}

function stripKeys<T>(item: StoredItem<T>) {
  const { pk: _pk, sk: _sk, entity: _entity, ...value } = item
  return value as T
}

function padId(id: number) {
  return String(id).padStart(12, '0')
}

function isConditionalCheckFailed(error: unknown) {
  return error instanceof Error && error.name === 'ConditionalCheckFailedException'
}
