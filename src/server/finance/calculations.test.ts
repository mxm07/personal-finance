import { describe, expect, it } from 'vitest'
import { summarizeBalances, summarizeCashFlow } from './calculations'

describe('finance calculations', () => {
  it('summarizes balances by currency and separates assets from liabilities', () => {
    expect(summarizeBalances([
      { currency: 'USD', balance: 100 },
      { currency: 'USD', balance: -25 },
      { currency: 'EUR', balance: 10 },
    ])).toEqual([
      { currency: 'EUR', netWorth: 10, assets: 10, liabilities: 0 },
      { currency: 'USD', netWorth: 75, assets: 100, liabilities: -25 },
    ])
  })

  it('summarizes posted cash flow and ignores pending transactions', () => {
    expect(summarizeCashFlow([
      { currency: 'USD', amount: 100 },
      { currency: 'USD', amount: -35.5 },
      { currency: 'USD', amount: -10, pending: true },
    ])).toEqual([
      { currency: 'USD', moneyIn: 100, moneyOut: 35.5, net: 64.5 },
    ])
  })
})
