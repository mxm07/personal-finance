import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { getDashboard, syncNow } from '../server-functions'
import { formatDate, formatDateTime, formatMoney } from '../lib/format'
import styles from './page.module.scss'

export const Route = createFileRoute('/')({
  loader: () => getDashboard(),
  component: OverviewPage,
})

function OverviewPage() {
  const data = Route.useLoaderData()
  const primaryBalance = data.balances[0]
  const primaryFlow = data.cashFlow[0]

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>Month to date</p>
          <h1 className={styles.heading}>Money map</h1>
        </div>
        <SyncButton />
      </header>

      {!data.status.connected ? (
        <div className={styles.error}>
          SimpleFIN is not connected yet. <Link to="/setup">Open setup</Link> to paste a SimpleFIN token.
        </div>
      ) : null}

      <div className={styles.grid}>
        <Metric label="Net worth" value={primaryBalance ? formatMoney(primaryBalance.netWorth, primaryBalance.currency) : 'No balances'} />
        <Metric label="Money in" value={primaryFlow ? formatMoney(primaryFlow.moneyIn, primaryFlow.currency) : '$0.00'} tone="positive" />
        <Metric label="Money out" value={primaryFlow ? formatMoney(primaryFlow.moneyOut, primaryFlow.currency) : '$0.00'} tone="negative" />
        <Metric label="Net cash flow" value={primaryFlow ? formatMoney(primaryFlow.net, primaryFlow.currency) : '$0.00'} tone={primaryFlow?.net && primaryFlow.net < 0 ? 'negative' : 'positive'} />
      </div>

      <div className={styles.twoColumn}>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Account</th>
                <th>Category</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {data.recentTransactions.map((transaction) => (
                <tr key={transaction.id}>
                  <td>{formatDate(transaction.postedAt)}</td>
                  <td>
                    {transaction.description}
                    {transaction.pending ? <span className={styles.pill}>Pending</span> : null}
                  </td>
                  <td>{transaction.accountName}</td>
                  <td>{transaction.categoryName ?? 'Uncategorized'}</td>
                  <td className={transaction.amount < 0 ? styles.negative : styles.positive}>
                    {formatMoney(transaction.amount, transaction.currency)}
                  </td>
                </tr>
              ))}
              {!data.recentTransactions.length ? (
                <tr><td colSpan={5}>No transactions synced yet.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <aside className={styles.stack}>
          <div className={styles.card}>
            <span className={styles.label}>Latest sync</span>
            <p>{data.status.latestSync ? `${data.status.latestSync.status} at ${formatDateTime(data.status.latestSync.finishedAt ?? data.status.latestSync.startedAt)}` : 'No sync has run yet.'}</p>
            {data.status.latestSync?.message ? <p className={styles.subtle}>{data.status.latestSync.message}</p> : null}
          </div>
          <div className={styles.card}>
            <span className={styles.label}>Accounts</span>
            {data.accounts.slice(0, 6).map((account) => (
              <p key={account.id}>
                <strong>{account.name}</strong><br />
                <span className={styles.subtle}>{account.connectionName} · {formatMoney(account.balance, account.currency)}</span>
              </p>
            ))}
            {!data.accounts.length ? <p className={styles.subtle}>No accounts synced yet.</p> : null}
          </div>
        </aside>
      </div>
    </section>
  )
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: 'positive' | 'negative' }) {
  return (
    <div className={styles.metric}>
      <span className={styles.label}>{label}</span>
      <span className={`${styles.value} ${tone === 'positive' ? styles.positive : ''} ${tone === 'negative' ? styles.negative : ''}`}>
        {value}
      </span>
    </div>
  )
}

function SyncButton() {
  const router = useRouter()

  return (
    <button
      className={styles.button}
      type="button"
      onClick={() => {
        void syncNow().then(() => router.invalidate())
      }}
    >
      Sync now
    </button>
  )
}
