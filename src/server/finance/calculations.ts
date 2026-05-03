export type BalanceRow = {
  currency: string
  balance: number
}

export type TransactionAmount = {
  currency: string
  amount: number
  pending?: boolean
}

export function summarizeBalances(rows: BalanceRow[]) {
  const byCurrency = new Map<string, { currency: string; netWorth: number; assets: number; liabilities: number }>()

  for (const row of rows) {
    const bucket = byCurrency.get(row.currency) ?? {
      currency: row.currency,
      netWorth: 0,
      assets: 0,
      liabilities: 0,
    }
    bucket.netWorth += row.balance
    if (row.balance >= 0) {
      bucket.assets += row.balance
    } else {
      bucket.liabilities += row.balance
    }
    byCurrency.set(row.currency, bucket)
  }

  return [...byCurrency.values()].sort((a, b) => a.currency.localeCompare(b.currency))
}

export function summarizeCashFlow(rows: TransactionAmount[]) {
  const byCurrency = new Map<string, { currency: string; moneyIn: number; moneyOut: number; net: number }>()

  for (const row of rows) {
    if (row.pending) {
      continue
    }
    const bucket = byCurrency.get(row.currency) ?? {
      currency: row.currency,
      moneyIn: 0,
      moneyOut: 0,
      net: 0,
    }
    if (row.amount >= 0) {
      bucket.moneyIn += row.amount
    } else {
      bucket.moneyOut += Math.abs(row.amount)
    }
    bucket.net += row.amount
    byCurrency.set(row.currency, bucket)
  }

  return [...byCurrency.values()].sort((a, b) => a.currency.localeCompare(b.currency))
}

export function formatMoney(amount: number, currency: string) {
  if (/^[A-Z]{3}$/.test(currency)) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(amount)
  }

  return `${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${currency}`
}
