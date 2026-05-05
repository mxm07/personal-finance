import { describe, expect, it } from 'vitest'
import { matchCategoryRule } from './categories'
import type { CategoryRuleRecord } from '../storage/store'

describe('category rules', () => {
  it('matches descriptions case-insensitively', () => {
    const rules = [
      { id: 1, categoryId: 3, matchText: 'coffee', createdAt: 1 },
    ] satisfies CategoryRuleRecord[]

    expect(matchCategoryRule('LOCAL COFFEE SHOP', rules)?.categoryId).toBe(3)
  })

  it('returns undefined when no rule matches', () => {
    const rules = [
      { id: 1, categoryId: 3, matchText: 'coffee', createdAt: 1 },
    ] satisfies CategoryRuleRecord[]

    expect(matchCategoryRule('Hardware store', rules)).toBeUndefined()
  })
})
