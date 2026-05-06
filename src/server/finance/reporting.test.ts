import { describe, expect, it } from 'vitest'
import { getAnalyticsExcludedTransactionIds, type AnalyticsTransaction } from './reporting'

describe('analytics transfer classification', () => {
  it('excludes matched credit card payment transfer pairs from analytics', () => {
    const excluded = getAnalyticsExcludedTransactionIds([
      transaction({
        id: 'checking-payment',
        accountId: 'checking',
        amount: -4391.98,
        description: 'ACH Withdrawal CAPITAL ONE CRCARDPMT',
        categoryName: 'Transfers',
        postedAt: day(1),
      }),
      transaction({
        id: 'card-payment',
        accountId: 'venture-x',
        amount: 4391.98,
        description: 'CAPITAL ONE PAYMENT THANK YOU',
        categoryName: 'Income',
        postedAt: day(2),
      }),
    ])

    expect(excluded).toEqual(new Set(['checking-payment', 'card-payment']))
  })

  it('keeps unmatched external payment-like outflows in analytics', () => {
    const excluded = getAnalyticsExcludedTransactionIds([
      transaction({
        id: 'venmo-payment',
        accountId: 'checking',
        amount: -75,
        description: 'ACH Withdrawal VENMO PAYMENT',
        categoryName: 'Transfers',
        postedAt: day(1),
      }),
    ])

    expect(excluded.size).toBe(0)
  })

  it('does not match same-account reversals as internal transfers', () => {
    const excluded = getAnalyticsExcludedTransactionIds([
      transaction({
        id: 'charge',
        accountId: 'checking',
        amount: -100,
        description: 'ACH Withdrawal EXTERNAL TRANSFER',
        categoryName: 'Transfers',
        postedAt: day(1),
      }),
      transaction({
        id: 'reversal',
        accountId: 'checking',
        amount: 100,
        description: 'ACH CREDIT REVERSAL',
        categoryName: 'Transfers',
        postedAt: day(1),
      }),
    ])

    expect(excluded.size).toBe(0)
  })

  it('does not match unrelated opposite transactions without transfer-like signals', () => {
    const excluded = getAnalyticsExcludedTransactionIds([
      transaction({
        id: 'shopping',
        accountId: 'checking',
        amount: -42,
        description: 'LOCAL STORE',
        categoryName: 'Shopping',
        postedAt: day(1),
      }),
      transaction({
        id: 'refund',
        accountId: 'card',
        amount: 42,
        description: 'MERCHANT REFUND',
        categoryName: 'Shopping',
        postedAt: day(1),
      }),
    ])

    expect(excluded.size).toBe(0)
  })
})

function transaction(overrides: Partial<AnalyticsTransaction>): AnalyticsTransaction {
  return {
    id: 'transaction',
    accountId: 'account',
    postedAt: day(1),
    amount: 0,
    currency: 'USD',
    pending: false,
    description: '',
    categoryName: null,
    ...overrides,
  }
}

function day(dayOfMonth: number) {
  return Date.UTC(2026, 4, dayOfMonth) / 1000
}
