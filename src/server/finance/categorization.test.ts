import { describe, expect, it } from 'vitest'
import { categorizeTransaction, normalizeMerchant } from './categorization'
import type { CategoryRecord, CategoryRuleRecord } from '../storage/store'

const categories = [
  category(1, 'Income'),
  category(2, 'Groceries'),
  category(3, 'Dining'),
  category(4, 'Housing'),
  category(5, 'Transportation'),
  category(6, 'Utilities'),
  category(7, 'Healthcare'),
  category(8, 'Shopping'),
  category(9, 'Entertainment'),
  category(10, 'Travel'),
  category(11, 'Personal Care'),
  category(12, 'Fees'),
  category(13, 'Transfers'),
  category(14, 'Uncategorized'),
]

describe('local transaction categorization', () => {
  it('lets explicit user rules win over smart categorization', () => {
    const rules = [{ id: 1, categoryId: 3, matchText: 'whole foods', createdAt: 1 }] satisfies CategoryRuleRecord[]

    const result = categorizeTransaction({
      description: 'WHOLE FOODS MARKET 10293 NY',
      amount: -45.23,
    }, categories, rules)

    expect(result).toMatchObject({
      categoryId: 3,
      categorySource: 'rule',
      categoryConfidence: 1,
    })
  })

  it('categorizes common grocery merchants locally', () => {
    const result = categorizeTransaction({
      description: 'CHECKCARD WHOLE FOODS MARKET 10293 BROOKLYN NY',
      amount: -82.14,
    }, categories, [])

    expect(result.categoryName).toBe('Groceries')
    expect(result.categorySource).toBe('smart')
    expect(result.categoryConfidence).toBeGreaterThan(0.8)
  })

  it('detects card payments and transfers before generic outflow fallback', () => {
    const result = categorizeTransaction({
      description: 'ONLINE PAYMENT THANK YOU CHASE CARD',
      amount: -1200,
    }, categories, [])

    expect(result.categoryName).toBe('Transfers')
    expect(result.categoryConfidence).toBeGreaterThan(0.9)
  })

  it('treats positive payroll-like transactions as income', () => {
    const result = categorizeTransaction({
      description: 'ACME INC DIRECT DEPOSIT PAYROLL',
      amount: 2400,
    }, categories, [])

    expect(result.categoryName).toBe('Income')
  })

  it('still categorizes unknown outflows with a low-confidence fallback', () => {
    const result = categorizeTransaction({
      description: 'SQ *ODD LOCAL MERCHANT 43992',
      amount: -12.34,
    }, categories, [])

    expect(result.categoryName).toBe('Shopping')
    expect(result.categorySource).toBe('smart')
    expect(result.categoryConfidence).toBeLessThan(0.5)
  })

  it('normalizes noisy payment descriptions into reusable merchant text', () => {
    expect(normalizeMerchant('CHECKCARD 0425 WHOLE FOODS MARKET 10293 BROOKLYN NY')).toBe('whole foods')
  })
})

function category(id: number, name: string): CategoryRecord {
  return {
    id,
    name,
    color: '#000000',
    createdAt: 1,
  }
}
