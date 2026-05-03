import { useState } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { claimSimpleFinToken, clearSimpleFin, getSetupData, syncNow } from '../server-functions'
import { formatDateTime } from '../lib/format'
import styles from './page.module.scss'

export const Route = createFileRoute('/setup')({
  loader: () => getSetupData(),
  component: SetupPage,
})

function SetupPage() {
  const router = useRouter()
  const data = Route.useLoaderData()
  const [token, setToken] = useState('')
  const [message, setMessage] = useState<string | null>(null)

  return (
    <section className={styles.page}>
      <header>
        <p className={styles.kicker}>SimpleFIN</p>
        <h1 className={styles.heading}>Setup</h1>
      </header>

      <div className={styles.twoColumn}>
        <div className={styles.card}>
          <span className={styles.label}>Connection</span>
          <p className={styles.subtle}>
            Paste a SimpleFIN token from Bridge or a claim URL. The server claims it once and stores only the returned Access URL in `.data/simplefin.secret.json`.
          </p>
          <form
            className={styles.form}
            onSubmit={(event) => {
              event.preventDefault()
              setMessage('Claiming token...')
              void claimSimpleFinToken({ data: { token } })
                .then((result) => {
                  setToken('')
                  setMessage(result.message)
                  return router.invalidate()
                })
                .catch((error: unknown) => {
                  setMessage(error instanceof Error ? error.message : 'Claim failed.')
                })
            }}
          >
            <textarea
              className={styles.field}
              rows={5}
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="Paste SimpleFIN token or HTTPS claim URL"
            />
            <button className={styles.button} type="submit">Claim and sync</button>
          </form>
          {message ? <p className={styles.subtle}>{message}</p> : null}
        </div>

        <div className={styles.card}>
          <span className={styles.label}>Status</span>
          <p>{data.status.connected ? 'Connected' : 'Not connected'}</p>
          <p className={styles.subtle}>
            Latest sync: {data.status.latestSync ? `${data.status.latestSync.status} at ${formatDateTime(data.status.latestSync.finishedAt ?? data.status.latestSync.startedAt)}` : 'never'}
          </p>
          {data.status.latestSync?.message ? <p className={styles.subtle}>{data.status.latestSync.message}</p> : null}
          <div className={styles.toolbar}>
            <button className={styles.button} type="button" onClick={() => void syncNow().then(() => router.invalidate())}>
              Sync now
            </button>
            <button className={styles.secondaryButton} type="button" onClick={() => void clearSimpleFin().then(() => router.invalidate())}>
              Clear credentials
            </button>
          </div>
        </div>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Started</th>
              <th>Trigger</th>
              <th>Status</th>
              <th>Message</th>
            </tr>
          </thead>
          <tbody>
            {data.syncHistory.map((run) => (
              <tr key={run.id}>
                <td>{formatDateTime(run.startedAt)}</td>
                <td>{run.trigger}</td>
                <td>{run.status}</td>
                <td>{run.message ?? ''}</td>
              </tr>
            ))}
            {!data.syncHistory.length ? (
              <tr><td colSpan={4}>No sync history yet.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  )
}
