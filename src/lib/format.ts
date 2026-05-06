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

export function formatDate(epochSeconds: number | null | undefined) {
  if (!epochSeconds) {
    return 'Not available'
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/New_York',
  }).format(new Date(epochSeconds * 1000))
}

export function formatDateTime(epochSeconds: number | null | undefined) {
  if (!epochSeconds) {
    return 'Not available'
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/New_York',
  }).format(new Date(epochSeconds * 1000))
}
