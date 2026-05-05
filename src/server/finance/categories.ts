import type { CategoryRuleRecord } from '../storage/store'

export function matchCategoryRule(description: string, rules: CategoryRuleRecord[]) {
  const normalized = description.toLocaleLowerCase()
  return rules.find((rule) => normalized.includes(rule.matchText.toLocaleLowerCase().trim()))
}
