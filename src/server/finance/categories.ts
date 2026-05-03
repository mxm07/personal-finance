import type { CategoryRule } from '../db/schema'

export function matchCategoryRule(description: string, rules: CategoryRule[]) {
  const normalized = description.toLocaleLowerCase()
  return rules.find((rule) => normalized.includes(rule.matchText.toLocaleLowerCase().trim()))
}
