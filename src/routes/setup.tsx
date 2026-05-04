import { useState } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import {
  claimSimpleFinToken,
  clearSimpleFin,
  getSetupData,
  importSimpleFinHistory,
  importTransactionsCsv,
  syncNow,
} from '../server-functions'
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
  const [csvFiles, setCsvFiles] = useState<FileList | null>(null)
  const [csvAccountId, setCsvAccountId] = useState('')
  const [importingCsv, setImportingCsv] = useState(false)

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
            <button
              className={styles.secondaryButton}
              type="button"
              onClick={() => {
                setMessage('Importing historical transactions...')
                void importSimpleFinHistory()
                  .then((result) => {
                    setMessage(result.message)
                    return router.invalidate()
                  })
                  .catch((error: unknown) => {
                    setMessage(error instanceof Error ? error.message : 'Historical import failed.')
                  })
              }}
            >
              Import history
            </button>
            <button className={styles.secondaryButton} type="button" onClick={() => void clearSimpleFin().then(() => router.invalidate())}>
              Clear credentials
            </button>
          </div>
        </div>
      </div>

      <div className={styles.card}>
        <span className={styles.label}>CSV Import</span>
        <p className={styles.subtle}>
          Import Capital One or Discover CSV exports for history that is not available through SimpleFIN. Choose an account for Discover files; Capital One files are matched by card number when possible.
        </p>
        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault()
            if (!csvFiles?.length) {
              setMessage('Choose one or more CSV files first.')
              return
            }

            setImportingCsv(true)
            setMessage('Importing CSV transactions...')
            void importCsvFiles([...csvFiles], csvAccountId || null)
              .then((messages) => {
                setMessage(messages.join(' '))
                setCsvFiles(null)
                return router.invalidate()
              })
              .catch((error: unknown) => {
                setMessage(error instanceof Error ? error.message : 'CSV import failed.')
              })
              .finally(() => {
                setImportingCsv(false)
              })
          }}
        >
          <input
            key={csvFiles ? [...csvFiles].map((file) => file.name).join('|') : 'empty'}
            accept=".csv,text/csv"
            className={styles.field}
            multiple
            type="file"
            onChange={(event) => setCsvFiles(event.target.files)}
          />
          <select className={styles.field} value={csvAccountId} onChange={(event) => setCsvAccountId(event.target.value)}>
            <option value="">Auto-detect account</option>
            {data.accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.connectionName ? `${account.connectionName} - ` : ''}{account.name}
              </option>
            ))}
          </select>
          <button className={styles.button} disabled={importingCsv} type="submit">
            {importingCsv ? 'Importing...' : 'Import CSV'}
          </button>
        </form>
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

async function importCsvFiles(files: File[], accountId: string | null) {
  const messages: string[] = []
  for (const file of files) {
    const contents = await file.text()
    const result = await importTransactionsCsv({
      data: {
        fileName: file.name,
        contents,
        accountId,
      },
    })
    messages.push(`${file.name}: ${result.message}`)
  }
  return messages
}
