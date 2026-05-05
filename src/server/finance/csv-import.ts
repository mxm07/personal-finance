import { createHash } from "node:crypto";
import { categorizeTransaction, normalizeMerchant } from "./categorization";
import { getStore, type CategoryRecord, type CategoryRuleRecord } from "../storage/store";

export type CsvImportResult = {
  status: "success";
  message: string;
  parsed: number;
  inserted: number;
  duplicates: number;
  skipped: number;
  accountsCreated: number;
};

type ImportedCsvRow = {
  source: "capital-one-csv" | "discover-card-csv" | "discover-bank-csv";
  transactionDate: string;
  postedDate: string;
  accountKey: string;
  description: string;
  category: string;
  debit: string;
  credit: string;
  amount: string;
  rowNumber: number;
};

type ImportTransaction = {
  accountId: string;
  simplefinId: string;
  postedAt: number;
  transactedAt: number | null;
  amount: number;
  description: string;
  csvCategory: string;
  source: ImportedCsvRow["source"];
  row: ImportedCsvRow;
};

export async function importTransactionsCsv(input: {
  fileName: string;
  contents: string;
  accountId?: string | null;
}): Promise<CsvImportResult> {
  const rows = parseTransactionsCsv(input.contents, input.accountId);
  const store = getStore();
  const now = unixNow();
  const accountMap = await ensureImportAccounts(rows, input.accountId);
  const categoryRows = await store.listCategories();
  const rules = await store.listCategoryRules();
  const candidates = buildImportTransactions(rows, accountMap);
  const duplicateMatcher = await createDuplicateMatcher([
    ...new Set(candidates.map((candidate) => candidate.accountId)),
  ]);
  let inserted = 0;
  let duplicates = 0;
  let skipped = rows.length - candidates.length;

  for (const candidate of candidates) {
    if (duplicateMatcher.consume(candidate)) {
      duplicates += 1;
      continue;
    }

    const categorization = categorizeCsvTransaction(
      candidate,
      categoryRows,
      rules,
    );
    const stored = await store.insertTransactionIfAbsent({
      id: candidate.simplefinId,
      accountId: candidate.accountId,
      simplefinId: candidate.simplefinId,
      postedAt: candidate.postedAt,
      transactedAt: candidate.transactedAt,
      amount: candidate.amount,
      currency: "USD",
      description: candidate.description,
      pending: false,
      categoryId: categorization.categoryId,
      categorySource: categorization.categorySource,
      categoryConfidence: categorization.categoryConfidence,
      categoryReason: categorization.categoryReason,
      normalizedMerchant: categorization.normalizedMerchant,
      raw: JSON.stringify({
        source: candidate.source,
        fileName: input.fileName,
        row: candidate.row,
      }),
      updatedAt: now,
    });

    if (stored) {
      duplicateMatcher.add(candidate);
      inserted += 1;
    } else {
      duplicates += 1;
    }
  }

  const accountsCreated = [...accountMap.values()].filter(
    (account) => account.created,
  ).length;

  return {
    status: "success",
    message: `CSV import parsed ${rows.length} row${rows.length === 1 ? "" : "s"}, stored ${inserted} new transaction${inserted === 1 ? "" : "s"}, skipped ${duplicates} duplicate${duplicates === 1 ? "" : "s"}${skipped ? `, and ignored ${skipped} incomplete row${skipped === 1 ? "" : "s"}` : ""}.`,
    parsed: rows.length,
    inserted,
    duplicates,
    skipped,
    accountsCreated,
  };
}

export function parseCapitalOneCsv(contents: string) {
  return parseCapitalOneRecords(parseCsv(contents));
}

export function parseDiscoverCsv(contents: string, accountId?: string | null) {
  return parseDiscoverRecords(parseCsv(contents), accountId);
}

function parseTransactionsCsv(contents: string, accountId?: string | null) {
  const records = parseCsv(contents);
  const [header] = records;
  if (!header) {
    return [];
  }

  const column = createColumnLookup(header);
  if (
    hasColumns(column, [
      "Transaction Date",
      "Posted Date",
      "Card No.",
      "Description",
      "Category",
      "Debit",
      "Credit",
    ])
  ) {
    return parseCapitalOneRecords(records);
  }

  return parseDiscoverRecords(records, accountId);
}

function parseCapitalOneRecords(records: string[][]) {
  const [header, ...body] = records;
  if (!header) {
    return [];
  }

  const column = createColumnLookup(header);
  const required = [
    "Transaction Date",
    "Posted Date",
    "Card No.",
    "Description",
    "Category",
    "Debit",
    "Credit",
  ];
  for (const name of required) {
    if (column.get(name.toLocaleLowerCase()) === undefined) {
      throw new Error(`CSV is missing the "${name}" column.`);
    }
  }

  return body
    .filter((record) => record.some((value) => value.trim()))
    .map(
      (record, index): ImportedCsvRow => ({
        source: "capital-one-csv",
        transactionDate: cell(record, column, "Transaction Date"),
        postedDate: cell(record, column, "Posted Date"),
        accountKey: cell(record, column, "Card No."),
        description: cell(record, column, "Description"),
        category: cell(record, column, "Category"),
        debit: cell(record, column, "Debit"),
        credit: cell(record, column, "Credit"),
        amount: "",
        rowNumber: index + 2,
      }),
    );
}

function parseDiscoverRecords(records: string[][], accountId?: string | null) {
  const [header, ...body] = records;
  if (!header) {
    return [];
  }

  const column = createColumnLookup(header);
  const postedDateColumn = findColumn(column, [
    "Post Date",
    "Posted Date",
    "Transaction Date",
    "Trans. Date",
    "Date",
  ]);
  const transactionDateColumn = findColumn(column, [
    "Transaction Date",
    "Trans. Date",
    "Date",
    "Post Date",
    "Posted Date",
  ]);
  const descriptionColumn = findColumn(column, [
    "Description",
    "Transaction Description",
    "Merchant",
    "Payee",
  ]);
  const amountColumn = findColumn(column, ["Amount"]);
  const categoryColumn = findColumn(column, [
    "Category",
    "Type",
    "Transaction Type",
  ]);
  const debitColumn = findColumn(column, ["Debit"]);
  const creditColumn = findColumn(column, ["Credit"]);
  const hasSignedAmount = amountColumn !== undefined;
  const hasDebitCredit = debitColumn !== undefined && creditColumn !== undefined;

  if (
    postedDateColumn === undefined ||
    descriptionColumn === undefined ||
    (!hasSignedAmount && !hasDebitCredit)
  ) {
    throw new Error(
      "CSV is missing Discover-compatible date, description, or amount columns.",
    );
  }
  if (!accountId) {
    throw new Error(
      "Choose the account this CSV belongs to before importing this file.",
    );
  }

  return body
    .filter((record) => record.some((value) => value.trim()))
    .map(
      (record, index): ImportedCsvRow => ({
        source: hasSignedAmount ? "discover-card-csv" : "discover-bank-csv",
        transactionDate:
          transactionDateColumn === undefined
            ? (record[postedDateColumn] ?? "")
            : (record[transactionDateColumn] ?? ""),
        postedDate: record[postedDateColumn] ?? "",
        accountKey: accountId,
        description: record[descriptionColumn] ?? "",
        category:
          categoryColumn === undefined ? "" : (record[categoryColumn] ?? ""),
        debit: debitColumn === undefined ? "" : (record[debitColumn] ?? ""),
        credit: creditColumn === undefined ? "" : (record[creditColumn] ?? ""),
        amount: amountColumn === undefined ? "" : (record[amountColumn] ?? ""),
        rowNumber: index + 2,
      }),
    );
}

async function ensureImportAccounts(
  rows: ImportedCsvRow[],
  selectedAccountId?: string | null,
) {
  const store = getStore();
  const now = unixNow();
  const map = new Map<string, { accountId: string; created: boolean }>();
  const discoverRows = rows.filter((row) => row.source !== "capital-one-csv");
  if (discoverRows.length) {
    if (!selectedAccountId) {
      throw new Error(
        "Choose the account this CSV belongs to before importing this file.",
      );
    }
    const selectedAccount = await store.getAccount(selectedAccountId);
    if (!selectedAccount) {
      throw new Error("Choose a valid account for this CSV import.");
    }
    map.set(selectedAccountId, {
      accountId: selectedAccountId,
      created: false,
    });
  }

  const cardNumbers = [
    ...new Set(
      rows
        .filter((row) => row.source === "capital-one-csv")
        .map((row) => row.accountKey.trim())
        .filter(Boolean),
    ),
  ];
  const accountRows = await store.listAccounts();
  const existingCapitalOneConnection = await store.getConnectionByName("Capital One");
  const connectionId = existingCapitalOneConnection?.id ?? "capital-one-csv";

  if (!existingCapitalOneConnection) {
    await store.upsertConnection({
      id: connectionId,
      name: "Capital One",
      orgId: "capital-one-csv",
      orgName: "Capital One",
      orgUrl: "https://www.capitalone.com",
      simplefinUrl: null,
      updatedAt: now,
    });
  }

  for (const cardNo of cardNumbers) {
    const matched = accountRows.find(
      (account) =>
        account.name.includes(`(${cardNo})`) || account.name.endsWith(cardNo),
    );
    if (matched) {
      map.set(cardNo, { accountId: matched.id, created: false });
      continue;
    }

    const simplefinId = `csv-card-${cardNo}`;
    const accountId = `${connectionId}:${simplefinId}`;
    const existing = await store.getAccount(accountId);
    await store.upsertAccount({
      id: accountId,
      connectionId,
      simplefinId,
      name: `Capital One Card (${cardNo})`,
      currency: "USD",
      balance: 0,
      availableBalance: null,
      balanceDate: now,
      historyCursor: null,
      updatedAt: now,
    });
    map.set(cardNo, { accountId, created: !existing });
  }

  return map;
}

function buildImportTransactions(
  rows: ImportedCsvRow[],
  accountMap: Map<string, { accountId: string }>,
) {
  const occurrenceCounts = new Map<string, number>();
  const transactions: ImportTransaction[] = [];

  for (const row of rows) {
    const account = accountMap.get(row.accountKey.trim());
    const postedAt = parseCsvDate(row.postedDate);
    const transactedAt = parseCsvDate(row.transactionDate);
    const amount = getImportedAmount(row);
    const description = row.description.trim();
    if (
      !account ||
      !postedAt ||
      !description ||
      amount === 0 ||
      !Number.isFinite(amount)
    ) {
      continue;
    }

    const baseKey = createImportBaseKey(
      account.accountId,
      postedAt,
      transactedAt,
      amount,
      description,
    );
    const occurrence = (occurrenceCounts.get(baseKey) ?? 0) + 1;
    occurrenceCounts.set(baseKey, occurrence);
    transactions.push({
      accountId: account.accountId,
      simplefinId: `csv:${hash(`${baseKey}:${occurrence}`)}`,
      postedAt,
      transactedAt,
      amount,
      description,
      csvCategory: row.category.trim(),
      source: row.source,
      row,
    });
  }

  return transactions;
}

async function createDuplicateMatcher(accountIds: string[]) {
  const exactCounts = new Map<string, number>();
  const looseCounts = new Map<string, number>();
  if (!accountIds.length) {
    return {
      consume: () => false,
      add: () => undefined,
    };
  }

  const rows = await getStore().listTransactionsByAccountIds(accountIds);

  for (const row of rows) {
    addCount(
      exactCounts,
      createExactDuplicateKey(
        row.accountId,
        row.postedAt,
        row.amount,
        row.description,
      ),
    );
    addCount(
      looseCounts,
      createLooseDuplicateKey(row.accountId, row.postedAt, row.amount),
    );
  }

  return {
    consume(candidate: ImportTransaction) {
      const exactKey = createExactDuplicateKey(
        candidate.accountId,
        candidate.postedAt,
        candidate.amount,
        candidate.description,
      );
      if (consumeCount(exactCounts, exactKey)) {
        consumeCount(
          looseCounts,
          createLooseDuplicateKey(
            candidate.accountId,
            candidate.postedAt,
            candidate.amount,
          ),
        );
        return true;
      }

      const looseKey = createLooseDuplicateKey(
        candidate.accountId,
        candidate.postedAt,
        candidate.amount,
      );
      return consumeCount(looseCounts, looseKey);
    },
    add(candidate: ImportTransaction) {
      addCount(
        exactCounts,
        createExactDuplicateKey(
          candidate.accountId,
          candidate.postedAt,
          candidate.amount,
          candidate.description,
        ),
      );
      addCount(
        looseCounts,
        createLooseDuplicateKey(
          candidate.accountId,
          candidate.postedAt,
          candidate.amount,
        ),
      );
    },
  };
}

function categorizeCsvTransaction(
  transaction: ImportTransaction,
  categoryRows: CategoryRecord[],
  rules: CategoryRuleRecord[],
) {
  const mappedCategoryName = mapCapitalOneCategory(transaction.csvCategory);
  const mappedCategory = mappedCategoryName
    ? categoryRows.find(
        (category) =>
          category.name.toLocaleLowerCase() ===
          mappedCategoryName.toLocaleLowerCase(),
      )
    : undefined;

  if (mappedCategory) {
    return {
      categoryId: mappedCategory.id,
      categorySource: "smart",
      categoryConfidence: 0.9,
      categoryReason: `mapped CSV category "${transaction.csvCategory}"`,
      normalizedMerchant: normalizeMerchant(transaction.description),
    };
  }

  return categorizeTransaction(
    {
      description: transaction.description,
      amount: transaction.amount,
    },
    categoryRows,
    rules,
  );
}

function mapCapitalOneCategory(category: string) {
  const normalized = category.trim().toLocaleLowerCase();
  if (!normalized || normalized === "other") {
    return null;
  }

  const mappings: Record<string, string> = {
    dining: "Dining",
    restaurants: "Dining",
    "gas/automotive": "Transportation",
    gas: "Transportation",
    "health care": "Healthcare",
    healthcare: "Healthcare",
    merchandise: "Shopping",
    shopping: "Shopping",
    supermarkets: "Groceries",
    "other services": "Personal Care",
    "other travel": "Transportation",
    "payment/credit": "Transfers",
    "payments and credits": "Transfers",
    "awards and rebate credits": "Income",
    payment: "Transfers",
    travel: "Travel",
  };

  return mappings[normalized] ?? null;
}

function getImportedAmount(row: ImportedCsvRow) {
  if (row.source === "discover-card-csv") {
    return -parseAmount(row.amount);
  }

  return parseAmount(row.credit) - parseAmount(row.debit);
}

function parseCsv(contents: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < contents.length; index += 1) {
    const char = contents[index];
    const next = contents[index + 1];

    if (char === '"') {
      if (quoted && next === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (char === "," && !quoted) {
      row.push(value);
      value = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
      continue;
    }

    value += char;
  }

  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }

  return rows;
}

function createColumnLookup(header: string[]) {
  const lookup = new Map<string, number>();
  for (const [index, name] of header.entries()) {
    lookup.set(name.trim().toLocaleLowerCase(), index);
  }
  return lookup;
}

function hasColumns(column: Map<string, number>, names: string[]) {
  return names.every(
    (name) => column.get(name.toLocaleLowerCase()) !== undefined,
  );
}

function findColumn(column: Map<string, number>, names: string[]) {
  for (const name of names) {
    const index = column.get(name.toLocaleLowerCase());
    if (index !== undefined) {
      return index;
    }
  }
  return undefined;
}

function cell(record: string[], column: Map<string, number>, name: string) {
  const index = column.get(name.toLocaleLowerCase());
  return index === undefined ? "" : (record[index] ?? "").trim();
}

function parseCsvDate(value: string) {
  const trimmed = value.trim();
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return Math.floor(
      Date.UTC(
        Number(isoMatch[1]),
        Number(isoMatch[2]) - 1,
        Number(isoMatch[3]),
        12,
      ) / 1000,
    );
  }

  const usMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (usMatch) {
    const rawYear = Number(usMatch[3]);
    const year = rawYear < 100 ? 2000 + rawYear : rawYear;
    return Math.floor(
      Date.UTC(year, Number(usMatch[1]) - 1, Number(usMatch[2]), 12) / 1000,
    );
  }

  return null;
}

function parseAmount(value: string) {
  const trimmed = value.trim();
  const negative = trimmed.startsWith("(") && trimmed.endsWith(")");
  const normalized = trimmed.replace(/[$,()]/g, "").trim();
  const amount = normalized ? Number(normalized) : 0;
  return amount * (negative ? -1 : 1);
}

function createImportBaseKey(
  accountId: string,
  postedAt: number,
  transactedAt: number | null,
  amount: number,
  description: string,
) {
  return [
    accountId,
    postedAt,
    transactedAt ?? "",
    amount.toFixed(2),
    normalizeDuplicateDescription(description),
  ].join("|");
}

function createExactDuplicateKey(
  accountId: string,
  postedAt: number,
  amount: number,
  description: string,
) {
  return [
    accountId,
    postedAt,
    amount.toFixed(2),
    normalizeDuplicateDescription(description),
  ].join("|");
}

function createLooseDuplicateKey(
  accountId: string,
  postedAt: number,
  amount: number,
) {
  return [accountId, postedAt, amount.toFixed(2)].join("|");
}

function normalizeDuplicateDescription(description: string) {
  return description
    .toLocaleLowerCase()
    .replace(/x{4,}/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function addCount(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function consumeCount(map: Map<string, number>, key: string) {
  const count = map.get(key) ?? 0;
  if (count <= 0) {
    return false;
  }

  if (count === 1) {
    map.delete(key);
  } else {
    map.set(key, count - 1);
  }
  return true;
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function unixNow() {
  return Math.floor(Date.now() / 1000);
}
