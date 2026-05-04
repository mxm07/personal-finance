import { describe, expect, it } from 'vitest'
import {
  buildHistoricalBackfillWindows,
  createHistoricalBackfillStates,
  formatHistoricalImportMessage,
  getHistoricalBackfillCursor,
  getSyncStartDateFromLatest,
  summarizeSimpleFinMessages,
} from './sync'

describe('SimpleFIN sync windows', () => {
  it('uses a 90 day lookback for the first transaction sync', () => {
    const now = 1_700_000_000

    expect(getSyncStartDateFromLatest(null, now)).toBe(now - (60 * 60 * 24 * 90))
  })

  it('overlaps incremental syncs by 3 days', () => {
    const latestPostedAt = 1_700_000_000

    expect(getSyncStartDateFromLatest(latestPostedAt)).toBe(latestPostedAt - (60 * 60 * 24 * 3))
  })

  it('deduplicates repeated SimpleFIN advisory messages', () => {
    const message = 'Requested date range exceeds recommended range of 45 days. In the future, this may be capped.'

    expect(summarizeSimpleFinMessages([
      message,
      message,
      '  ',
      undefined,
      'Another account-specific warning.',
    ])).toBe(`${message} Another account-specific warning.`)
  })

  it('uses 45 day windows for historical backfills', () => {
    const earliestPostedAt = 1_700_000_000
    const [window] = buildHistoricalBackfillWindows(createHistoricalBackfillStates([{
      accountId: 'account-1',
      connectionId: 'connection-1',
      simplefinId: 'simplefin-1',
      historyCursor: null,
      earliestPostedAt,
    }]))

    expect(window.endDate - window.startDate).toBe(60 * 60 * 24 * 45)
  })

  it('starts each historical backfill from the account cursor before falling back to its oldest transaction', () => {
    expect(getHistoricalBackfillCursor(1_600_000_000, 1_700_000_000)).toBe(1_600_000_000)
    expect(getHistoricalBackfillCursor(null, 1_700_000_000)).toBe(1_700_000_000)
  })

  it('does not let an older account move another account past its missing history window', () => {
    const capitalOneEarliest = 1_696_291_200
    const schwabEarliest = 1_668_902_400
    const windows = buildHistoricalBackfillWindows(createHistoricalBackfillStates([
      {
        accountId: 'capital-one',
        connectionId: 'connection-1',
        simplefinId: 'card-1',
        historyCursor: null,
        earliestPostedAt: capitalOneEarliest,
      },
      {
        accountId: 'schwab',
        connectionId: 'connection-2',
        simplefinId: 'brokerage-1',
        historyCursor: null,
        earliestPostedAt: schwabEarliest,
      },
    ]))

    expect(windows.some((window) => (
      window.endDate === capitalOneEarliest
      && window.accountIds.includes('capital-one')
    ))).toBe(true)
  })

  it('reports newly stored historical transactions separately from re-seen provider rows', () => {
    expect(formatHistoricalImportMessage({
      requestedWindows: 30,
      receivedTransactions: 350,
      insertedTransactions: 0,
    })).toBe('Historical import checked 30 windows, received 350 transactions from SimpleFIN, and stored 0 new transactions.')
  })
})
