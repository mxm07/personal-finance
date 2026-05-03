import { mkdirSync } from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'

const dataDir = path.join(process.cwd(), '.data')
const dbPath = path.join(dataDir, 'finance.sqlite')

let sqlite: Database.Database | undefined
let db: ReturnType<typeof drizzle<typeof schema>> | undefined

export function getDb() {
  if (!db) {
    mkdirSync(dataDir, { recursive: true })
    sqlite = new Database(dbPath)
    sqlite.pragma('journal_mode = WAL')
    sqlite.pragma('foreign_keys = ON')
    migrate(sqlite)
    db = drizzle(sqlite, { schema })
  }

  return db
}

function migrate(database: Database.Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trigger TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      finished_at INTEGER,
      message TEXT
    );

    CREATE TABLE IF NOT EXISTS connections (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      org_id TEXT,
      org_name TEXT,
      org_url TEXT,
      simplefin_url TEXT,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      connection_id TEXT NOT NULL REFERENCES connections(id),
      simplefin_id TEXT NOT NULL,
      name TEXT NOT NULL,
      currency TEXT NOT NULL,
      balance REAL NOT NULL,
      available_balance REAL,
      balance_date INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(connection_id, simplefin_id)
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS category_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL REFERENCES categories(id),
      match_text TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id),
      simplefin_id TEXT NOT NULL,
      posted_at INTEGER NOT NULL,
      transacted_at INTEGER,
      amount REAL NOT NULL,
      currency TEXT NOT NULL,
      description TEXT NOT NULL,
      pending INTEGER NOT NULL,
      category_id INTEGER REFERENCES categories(id),
      category_source TEXT,
      raw TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(account_id, simplefin_id)
    );

    CREATE INDEX IF NOT EXISTS transactions_posted_at_idx ON transactions(posted_at);
    CREATE INDEX IF NOT EXISTS transactions_account_id_idx ON transactions(account_id);
    CREATE INDEX IF NOT EXISTS transactions_category_id_idx ON transactions(category_id);
  `)

  const now = Math.floor(Date.now() / 1000)
  const defaults = [
    ['Income', '#236b46'],
    ['Groceries', '#8b5e1d'],
    ['Dining', '#a73e2f'],
    ['Housing', '#245b73'],
    ['Transportation', '#6b5b95'],
    ['Utilities', '#537a5a'],
    ['Healthcare', '#b35c44'],
    ['Transfers', '#756c5b'],
    ['Uncategorized', '#9c6a18'],
  ] as const

  const stmt = database.prepare('INSERT OR IGNORE INTO categories (name, color, created_at) VALUES (?, ?, ?)')
  for (const [name, color] of defaults) {
    stmt.run(name, color, now)
  }
}
