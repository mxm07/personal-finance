import { simpleFinAccountSetSchema } from './types'

export class SimpleFinError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message)
    this.name = 'SimpleFinError'
  }
}

export function decodeClaimInput(input: string) {
  const trimmed = input.trim()
  const decoded = trimmed.startsWith('http')
    ? trimmed
    : Buffer.from(trimmed, 'base64').toString('utf8')
  const url = parseUrl(decoded, 'Enter a valid SimpleFIN token or HTTPS claim URL.')

  if (url.protocol !== 'https:') {
    throw new SimpleFinError('SimpleFIN claim URLs must use HTTPS.')
  }

  return url.toString()
}

export async function claimAccessUrl(tokenOrUrl: string) {
  const claimUrl = decodeClaimInput(tokenOrUrl)
  const response = await fetch(claimUrl, { method: 'POST' })

  if (response.status === 403) {
    throw new SimpleFinError('The SimpleFIN token was rejected. It may have already been claimed.', 403)
  }

  if (!response.ok) {
    throw new SimpleFinError(`SimpleFIN claim failed with HTTP ${response.status}.`, response.status)
  }

  const accessUrl = (await response.text()).trim()
  const parsed = parseUrl(accessUrl, 'SimpleFIN claim did not return a valid Access URL.')
  if (parsed.protocol !== 'https:') {
    throw new SimpleFinError('SimpleFIN returned a non-HTTPS access URL.')
  }

  return accessUrl
}

export async function fetchAccountSet(accessUrl: string, startDate?: number, endDate?: number, accountIds: string[] = []) {
  const { headers, root } = getAccessRequestParts(accessUrl)
  const url = new URL(`${root}/accounts`)
  url.searchParams.set('version', '2')
  url.searchParams.set('pending', '1')
  if (startDate && startDate > 0) {
    url.searchParams.set('start-date', String(startDate))
  }
  if (endDate && endDate > 0) {
    url.searchParams.set('end-date', String(endDate))
  }
  for (const accountId of accountIds) {
    url.searchParams.append('account', accountId)
  }

  const response = await fetch(url, { headers })

  if (response.status === 403) {
    throw new SimpleFinError('SimpleFIN access was revoked or credentials are invalid.', 403)
  }

  if (!response.ok) {
    throw new SimpleFinError(`SimpleFIN account fetch failed with HTTP ${response.status}.`, response.status)
  }

  const payload = await response.json()
  return simpleFinAccountSetSchema.parse(payload)
}

function parseUrl(value: string, message: string) {
  try {
    return new URL(value)
  } catch {
    throw new SimpleFinError(message)
  }
}

function getAccessRequestParts(accessUrl: string) {
  const url = new URL(accessUrl)
  const username = decodeURIComponent(url.username)
  const password = decodeURIComponent(url.password)
  const headers = new Headers()

  url.username = ''
  url.password = ''

  if (username || password) {
    headers.set('Authorization', `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`)
  }

  return {
    headers,
    root: url.toString().replace(/\/+$/, ''),
  }
}

export function sanitizeSimpleFinMessage(message: string) {
  return message.replace(/https:\/\/\S+/g, '[url]').replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]')
}
