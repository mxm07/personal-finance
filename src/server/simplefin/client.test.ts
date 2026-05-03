import { afterEach, describe, expect, it, vi } from 'vitest'
import { claimAccessUrl, decodeClaimInput, fetchAccountSet } from './client'

describe('SimpleFIN client', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends Access URL credentials as Basic Auth headers', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        errlist: [],
        connections: [],
        accounts: [],
      }),
    } as Response))
    vi.stubGlobal('fetch', fetchMock)

    await fetchAccountSet('https://demo:p%40ss@example.com/simplefin/', 123)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit]
    expect(url.toString()).toBe('https://example.com/simplefin/accounts?version=2&pending=1&start-date=123')
    expect(init.headers).toBeInstanceOf(Headers)
    expect((init.headers as Headers).get('Authorization')).toBe(`Basic ${Buffer.from('demo:p@ss').toString('base64')}`)
  })

  it('reports invalid claim input as a SimpleFIN validation error', () => {
    expect(() => decodeClaimInput('not a token')).toThrow('Enter a valid SimpleFIN token or HTTPS claim URL.')
  })

  it('reports invalid claim responses clearly', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => '<!doctype html>',
    } as Response)))

    await expect(claimAccessUrl('aHR0cHM6Ly9leGFtcGxlLmNvbS9jbGFpbS90b2tlbg=='))
      .rejects.toThrow('SimpleFIN claim did not return a valid Access URL.')
  })
})
