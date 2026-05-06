export type AnalyticsTransaction = {
  id: string
  accountId: string
  postedAt: number
  amount: number
  currency: string
  pending: boolean
  description: string
  categoryName: string | null
}

const internalTransferWindowSeconds = 5 * 86_400

export function getAnalyticsExcludedTransactionIds(transactions: AnalyticsTransaction[]) {
  const excluded = new Set<string>()
  const used = new Set<string>()
  const positiveByAmount = new Map<string, AnalyticsTransaction[]>()
  const rows = transactions
    .filter((transaction) => (
      !transaction.pending
      && transaction.amount !== 0
      && Number.isFinite(transaction.amount)
    ))
    .sort((a, b) => a.postedAt - b.postedAt)

  for (const transaction of rows) {
    if (transaction.amount <= 0) {
      continue
    }
    const key = getAmountKey(transaction)
    const bucket = positiveByAmount.get(key) ?? []
    bucket.push(transaction)
    positiveByAmount.set(key, bucket)
  }

  for (const transaction of rows) {
    if (transaction.amount >= 0 || used.has(transaction.id)) {
      continue
    }

    const match = findInternalTransferMatch(
      transaction,
      positiveByAmount.get(getAmountKey(transaction)) ?? [],
      used,
    )
    if (!match) {
      continue
    }

    used.add(transaction.id)
    used.add(match.id)
    excluded.add(transaction.id)
    excluded.add(match.id)
  }

  return excluded
}

function findInternalTransferMatch(
  transaction: AnalyticsTransaction,
  candidates: AnalyticsTransaction[],
  used: Set<string>,
) {
  let match: AnalyticsTransaction | null = null
  let smallestDistance = Number.POSITIVE_INFINITY

  for (const candidate of candidates) {
    if (
      used.has(candidate.id)
      || candidate.accountId === transaction.accountId
      || candidate.currency !== transaction.currency
      || !looksTransferLike(transaction, candidate)
    ) {
      continue
    }

    const distance = Math.abs(candidate.postedAt - transaction.postedAt)
    if (distance > internalTransferWindowSeconds || distance >= smallestDistance) {
      continue
    }

    match = candidate
    smallestDistance = distance
  }

  return match
}

function getAmountKey(transaction: AnalyticsTransaction) {
  return `${transaction.currency}:${Math.round(Math.abs(transaction.amount) * 100)}`
}

function looksTransferLike(left: AnalyticsTransaction, right: AnalyticsTransaction) {
  return isTransferLike(left) || isTransferLike(right)
}

function isTransferLike(transaction: AnalyticsTransaction) {
  if (transaction.categoryName?.toLocaleLowerCase() === 'transfers') {
    return true
  }

  const description = transaction.description.toLocaleLowerCase()
  return /\b(ach|transfer|xfer|payment|pmt|autopay|zelle|venmo|cash\s*app|paypal)\b/.test(description)
    || /\b(crcardpmt|ccardpmt|cardpmt|card\s*pmt)\b/.test(description)
    || /\b(credit\s+card|cc|card)\s+(payment|pmt)\b/.test(description)
}
