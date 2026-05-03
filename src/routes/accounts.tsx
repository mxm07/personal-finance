import { createFileRoute } from '@tanstack/react-router'
import { getAccountsData } from '../server-functions'
import { formatDate, formatMoney } from '../lib/format'
import styles from './page.module.scss'

export const Route = createFileRoute('/accounts')({
  loader: () => getAccountsData(),
  component: AccountsPage,
})

function AccountsPage() {
  const data = Route.useLoaderData()

  return (
    <section className={styles.page}>
      <header>
        <p className={styles.kicker}>Institutions</p>
        <h1 className={styles.heading}>Accounts</h1>
      </header>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Institution</th>
              <th>Account</th>
              <th>Balance</th>
              <th>Available</th>
              <th>Balance date</th>
            </tr>
          </thead>
          <tbody>
            {data.accounts.map((account) => (
              <tr key={account.id}>
                <td>{account.connectionName ?? account.connectionId}</td>
                <td>{account.name}</td>
                <td>{formatMoney(account.balance, account.currency)}</td>
                <td>{account.availableBalance == null ? 'Not provided' : formatMoney(account.availableBalance, account.currency)}</td>
                <td>{formatDate(account.balanceDate)}</td>
              </tr>
            ))}
            {!data.accounts.length ? (
              <tr><td colSpan={5}>No accounts synced yet.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  )
}
