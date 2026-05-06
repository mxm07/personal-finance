import type { CategoryRecord, CategoryRuleRecord } from '../storage/store'
import { matchCategoryRule } from './categories'

export type CategorizationInput = {
  description: string
  amount: number
  accountName?: string | null
}

export type CategorizationResult = {
  categoryId: number | null
  categoryName: string | null
  categorySource: 'rule' | 'smart' | null
  categoryConfidence: number | null
  categoryReason: string | null
  normalizedMerchant: string | null
}

type CategoryGroup = {
  categoryName: string
  confidence: number
  reason: string
  patterns: RegExp[]
}

const categoryGroups: CategoryGroup[] = [
  {
    categoryName: 'Transfers',
    confidence: 0.96,
    reason: 'matched transfer or card payment language',
    patterns: [
      /\b(online|mobile|automatic|auto)\s+payment\b/,
      /\b(payment\s+thank\s+you|thank\s+you\s+payment)\b/,
      /\b(credit\s+card|cc)\s+payment\b/,
      /\b(crcardpmt|ccardpmt|cardpmt|card\s*pmt)\b/,
      /\b(card|credit\s+card|cc)\s+(payment|pmt)\b/,
      /\b(payment\s+to|payment\s+from)\b/,
      /\b(transfer|xfer|external\s+transfer|internal\s+transfer)\b/,
      /\b(zelle|venmo|cash\s*app|paypal\s+transfer)\b/,
      /\b(atm\s+(withdrawal|deposit)|cash\s+withdrawal)\b/,
    ],
  },
  {
    categoryName: 'Income',
    confidence: 0.96,
    reason: 'matched payroll, benefits, interest, or deposit language',
    patterns: [
      /\b(payroll|salary|direct\s+dep|direct\s+deposit|paycheck|wages)\b/,
      /\b(interest\s+paid|dividend|distribution|social\s+security|ssa|irs\s+treas)\b/,
      /\b(unemployment|benefit|pension|annuity)\b/,
      /\b(mobile\s+deposit|remote\s+deposit|check\s+deposit)\b/,
    ],
  },
  {
    categoryName: 'Fees',
    confidence: 0.94,
    reason: 'matched bank fee or interest charge language',
    patterns: [
      /\b(overdraft|maintenance\s+fee|monthly\s+fee|service\s+fee|late\s+fee)\b/,
      /\b(atm\s+fee|foreign\s+transaction|finance\s+charge|interest\s+charge)\b/,
      /\b(returned\s+item|insufficient\s+funds|nsf)\b/,
    ],
  },
  {
    categoryName: 'Housing',
    confidence: 0.9,
    reason: 'matched rent, mortgage, property, or housing language',
    patterns: [
      /\b(rent|mortgage|escrow|landlord|leasing|apartments?)\b/,
      /\b(property\s+management|hoa|homeowners|realty|storage)\b/,
    ],
  },
  {
    categoryName: 'Utilities',
    confidence: 0.9,
    reason: 'matched utility, telecom, or home service merchant',
    patterns: [
      /\b(electric|electricity|utility|utilities|water|sewer|trash|waste|gas\s+co)\b/,
      /\b(comcast|xfinity|spectrum|cox|optimum|verizon|at&t|att\s|t-mobile|tmobile)\b/,
      /\b(internet|broadband|wireless|phone\s+bill|energy|power|coned|pseg|pg&e)\b/,
    ],
  },
  {
    categoryName: 'Groceries',
    confidence: 0.88,
    reason: 'matched grocery or supermarket merchant',
    patterns: [
      /\b(grocery|groceries|supermarket|market|food\s+market)\b/,
      /\b(whole\s+foods|trader\s+joe|kroger|safeway|aldi|publix|wegmans|meijer)\b/,
      /\b(stop\s*&?\s*shop|shoprite|harris\s+teeter|heb|h-e-b|winn\s+dixie)\b/,
      /\b(instacart|freshdirect|sprouts|food\s+lion|giant\s+food)\b/,
    ],
  },
  {
    categoryName: 'Dining',
    confidence: 0.88,
    reason: 'matched restaurant, cafe, delivery, or coffee merchant',
    patterns: [
      /\b(restaurant|restaurants|dining|cafe|coffee|bakery|bar\s|grill|bistro)\b/,
      /\b(starbucks|dunkin|mcdonald'?s|burger\s+king|wendy'?s|chipotle|taco\s+bell)\b/,
      /\b(panera|subway|chick-fil-a|chickfila|shake\s+shack|sweetgreen|doordash|ubereats|grubhub)\b/,
      /\b(pizza|sushi|thai|mexican|noodle|kitchen|deli|bagel)\b/,
    ],
  },
  {
    categoryName: 'Transportation',
    confidence: 0.88,
    reason: 'matched fuel, rideshare, transit, parking, or vehicle merchant',
    patterns: [
      /\b(gas|fuel|service\s+station|parking|toll|ezpass|e-zpass|transit|metro)\b/,
      /\b(shell|chevron|exxon|mobil|bp\s|sunoco|marathon|speedway|wawa)\b/,
      /\b(uber|lyft|taxi|cab|amtrak|mta|bart|wmata|septa)\b/,
      /\b(auto\s+parts|auto\s+service|mechanic|car\s+wash|dmv)\b/,
    ],
  },
  {
    categoryName: 'Healthcare',
    confidence: 0.88,
    reason: 'matched pharmacy, medical, dental, or insurance merchant',
    patterns: [
      /\b(pharmacy|drugstore|cvs|walgreens|rite\s+aid)\b/,
      /\b(doctor|medical|clinic|hospital|health|dental|dentist|vision|optical)\b/,
      /\b(urgent\s+care|laboratory|labcorp|quest\s+diagnostics|therapy|therapist)\b/,
    ],
  },
  {
    categoryName: 'Travel',
    confidence: 0.86,
    reason: 'matched airline, lodging, rental car, or travel merchant',
    patterns: [
      /\b(airline|airways|flight|airport|hotel|motel|resort|lodging)\b/,
      /\b(delta|united|southwest|american\s+air|jetblue|alaska\s+air|airbnb|vrbo)\b/,
      /\b(marriott|hilton|hyatt|ihg|booking\.com|expedia|rental\s+car|hertz|avis|enterprise)\b/,
    ],
  },
  {
    categoryName: 'Entertainment',
    confidence: 0.84,
    reason: 'matched streaming, media, gaming, or event merchant',
    patterns: [
      /\b(netflix|spotify|hulu|disney\+?|max\.com|hbo|paramount|peacock|youtube)\b/,
      /\b(movie|cinema|theater|theatre|ticketmaster|concert|eventbrite)\b/,
      /\b(steam|xbox|playstation|nintendo|game|games|app\s+store|google\s+play)\b/,
    ],
  },
  {
    categoryName: 'Personal Care',
    confidence: 0.82,
    reason: 'matched fitness, salon, spa, or personal care merchant',
    patterns: [
      /\b(gym|fitness|planet\s+fitness|life\s+time|equinox|ymca|club\s+pilates)\b/,
      /\b(salon|spa|barber|hair|nails|massage|cosmetic|beauty|sephora|ulta)\b/,
      /\b(laundry|dry\s+clean|cleaners)\b/,
    ],
  },
  {
    categoryName: 'Shopping',
    confidence: 0.8,
    reason: 'matched retail, marketplace, clothing, or home goods merchant',
    patterns: [
      /\b(amazon|amzn|walmart|target|costco|sam'?s\s+club|bjs\s+wholesale)\b/,
      /\b(ebay|etsy|shopify|paypal\s+\*|square\s+\*)\b/,
      /\b(best\s+buy|apple\.com|apple\s+store|home\s+depot|lowe'?s|ikea|wayfair)\b/,
      /\b(clothing|apparel|shoes|nike|adidas|gap|old\s+navy|macy'?s|nordstrom|tj\s*maxx|marshalls)\b/,
      /\b(hardware|electronics|retail|store|shop|merchandise)\b/,
    ],
  },
]

export function categorizeTransaction(
  input: CategorizationInput,
  categories: CategoryRecord[],
  rules: CategoryRuleRecord[],
): CategorizationResult {
  const categoryByName = new Map(categories.map((category) => [category.name.toLocaleLowerCase(), category]))
  const normalizedMerchant = normalizeMerchant(input.description)
  const rule = matchCategoryRule(input.description, rules)
  if (rule) {
    const category = categories.find((item) => item.id === rule.categoryId)
    return {
      categoryId: rule.categoryId,
      categoryName: category?.name ?? null,
      categorySource: 'rule',
      categoryConfidence: 1,
      categoryReason: `matched user rule "${rule.matchText}"`,
      normalizedMerchant,
    }
  }

  const normalized = normalizeForMatching(input.description)
  const account = input.accountName ? normalizeForMatching(input.accountName) : ''
  const haystack = `${normalized} ${normalizedMerchant ?? ''} ${account}`.trim()
  const directional = categorizeByDirection(input, categoryByName, normalizedMerchant)

  for (const group of categoryGroups) {
    if (group.patterns.some((pattern) => pattern.test(haystack))) {
      const category = categoryByName.get(group.categoryName.toLocaleLowerCase())
      if (category) {
        return {
          categoryId: category.id,
          categoryName: category.name,
          categorySource: 'smart',
          categoryConfidence: group.confidence,
          categoryReason: group.reason,
          normalizedMerchant,
        }
      }
    }
  }

  if (directional) {
    return directional
  }

  const fallbackName = input.amount >= 0 ? 'Income' : 'Shopping'
  const fallback = categoryByName.get(fallbackName.toLocaleLowerCase()) ?? categoryByName.get('uncategorized')
  return {
    categoryId: fallback?.id ?? null,
    categoryName: fallback?.name ?? null,
    categorySource: fallback ? 'smart' : null,
    categoryConfidence: fallbackName === 'Shopping' ? 0.42 : 0.48,
    categoryReason: input.amount >= 0
      ? 'positive transaction without stronger local signal'
      : 'outflow without stronger local signal',
    normalizedMerchant,
  }
}

export function normalizeMerchant(description: string) {
  const matchable = normalizeForMatching(description)
  const alias = knownMerchantAliases.find((merchant) => matchesPhrase(matchable, merchant))
  if (alias) {
    return alias
  }

  const normalized = normalizeForMatching(description)
    .replace(/\b(pos|dbt|debit|credit|card|purchase|auth|authorization|recurring|online|mobile|web)\b/g, ' ')
    .replace(/\b(ach|ppd|ccd|id|ref|trace|memo|checkcard|visa|mastercard)\b/g, ' ')
    .replace(/\b\d{1,2}[/-]\d{1,2}([/-]\d{2,4})?\b/g, ' ')
    .replace(/\b\d{3,}\b/g, ' ')
    .replace(/\b([a-z]{2})\s+(us|usa)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!normalized || normalized.length < 3) {
    return null
  }

  const words = normalized.split(' ').filter((word) => !merchantStopWords.has(word))
  const merchant = words.slice(0, 5).join(' ').trim()

  return merchant.length >= 3 ? merchant : normalized
}

function categorizeByDirection(
  input: CategorizationInput,
  categoryByName: Map<string, CategoryRecord>,
  normalizedMerchant: string | null,
): CategorizationResult | null {
  const normalized = normalizeForMatching(input.description)

  if (input.amount >= 0 && /\b(refund|return|rebate|cashback|cash\s+back|reversal)\b/.test(normalized)) {
    const category = categoryByName.get('shopping')
    return category ? {
      categoryId: category.id,
      categoryName: category.name,
      categorySource: 'smart',
      categoryConfidence: 0.72,
      categoryReason: 'positive transaction matched refund or return language',
      normalizedMerchant,
    } : null
  }

  if (input.amount >= 0) {
    const category = categoryByName.get('income')
    return category ? {
      categoryId: category.id,
      categoryName: category.name,
      categorySource: 'smart',
      categoryConfidence: 0.62,
      categoryReason: 'positive transaction treated as income',
      normalizedMerchant,
    } : null
  }

  if (/\bach\s+(withdrawal|debit|payment)\b/.test(normalized)) {
    const category = categoryByName.get('transfers')
    return category ? {
      categoryId: category.id,
      categoryName: category.name,
      categorySource: 'smart',
      categoryConfidence: 0.68,
      categoryReason: 'ACH outflow without stronger local merchant signal',
      normalizedMerchant,
    } : null
  }

  return null
}

function normalizeForMatching(value: string) {
  return value
    .toLocaleLowerCase()
    .replace(/&amp;/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9+.*& -]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function matchesPhrase(value: string, phrase: string) {
  return new RegExp(`(^|\\s)${escapeRegExp(phrase)}(\\s|$)`).test(value)
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const merchantStopWords = new Set([
  'the',
  'inc',
  'llc',
  'ltd',
  'co',
  'company',
  'corp',
  'corporation',
  'store',
  'stores',
  'market',
  'payment',
  'paymnt',
])

const knownMerchantAliases = [
  'whole foods',
  'trader joe',
  'kroger',
  'safeway',
  'aldi',
  'publix',
  'wegmans',
  'instacart',
  'starbucks',
  'dunkin',
  'mcdonalds',
  'chipotle',
  'doordash',
  'ubereats',
  'grubhub',
  'shell',
  'chevron',
  'exxon',
  'mobil',
  'uber',
  'lyft',
  'cvs',
  'walgreens',
  'rite aid',
  'netflix',
  'spotify',
  'hulu',
  'airbnb',
  'delta',
  'united',
  'southwest',
  'amazon',
  'walmart',
  'target',
  'costco',
  'best buy',
  'apple',
  'home depot',
  'lowes',
  'ikea',
]
