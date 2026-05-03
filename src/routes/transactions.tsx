import { useState } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { getTransactionsData, setTransactionCategory, syncNow } from '../server-functions'
import { formatDate, formatMoney } from '../lib/format'
import styles from './page.module.scss'

export const Route = createFileRoute('/transactions')({
  loader: () => getTransactionsData({ data: {} }),
  component: TransactionsPage,
})

function TransactionsPage() {
  const router = useRouter()
  const data = Route.useLoaderData()
  const [search, setSearch] = useState('')
  const [accountId, setAccountId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [pending, setPending] = useState('')

  const filtered = data.transactions.filter((transaction) => {
    const matchesSearch = search ? transaction.description.toLowerCase().includes(search.toLowerCase()) : true
    const matchesAccount = accountId ? transaction.accountId === accountId : true
    const matchesCategory = categoryId ? String(transaction.categoryId ?? '') === categoryId : true
    const matchesPending = pending === 'pending' ? transaction.pending : pending === 'posted' ? !transaction.pending : true
    return matchesSearch && matchesAccount && matchesCategory && matchesPending
  })

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>All institutions</p>
          <h1 className={styles.heading}>Transactions</h1>
        </div>
        <button className={styles.button} type="button" onClick={() => void syncNow().then(() => router.invalidate())}>
          Sync now
        </button>
      </header>

      <div className={styles.toolbar}>
        <input className={styles.field} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search descriptions" />
        <select className={styles.field} value={accountId} onChange={(event) => setAccountId(event.target.value)}>
          <option value="">All accounts</option>
          {data.accounts.map((account) => (
            <option key={account.id} value={account.id}>{account.name}</option>
          ))}
        </select>
        <select className={styles.field} value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
          <option value="">All categories</option>
          {data.categories.map((category) => (
            <option key={category.id} value={category.id}>{category.name}</option>
          ))}
        </select>
        <select className={styles.field} value={pending} onChange={(event) => setPending(event.target.value)}>
          <option value="">Posted and pending</option>
          <option value="posted">Posted only</option>
          <option value="pending">Pending only</option>
        </select>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th>Account</th>
              <th>Institution</th>
              <th>Category</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((transaction) => (
              <tr key={transaction.id}>
                <td>{formatDate(transaction.postedAt)}</td>
                <td>
                  {transaction.description}
                  {transaction.pending ? <span className={styles.pill}>Pending</span> : null}
                </td>
                <td>{transaction.accountName}</td>
                <td>{transaction.connectionName}</td>
                <td>
                  <select
                    className={styles.field}
                    value={transaction.categoryId ?? ''}
                    onChange={(event) => {
                      const value = event.target.value
                      void setTransactionCategory({
                        data: {
                          transactionId: transaction.id,
                          categoryId: value ? Number(value) : null,
                        },
                      }).then(() => router.invalidate())
                    }}
                  >
                    <option value="">Uncategorized</option>
                    {data.categories.map((category) => (
                      <option key={category.id} value={category.id}>{category.name}</option>
                    ))}
                  </select>
                </td>
                <td className={transaction.amount < 0 ? styles.negative : styles.positive}>
                  {formatMoney(transaction.amount, transaction.currency)}
                </td>
              </tr>
            ))}
            {!filtered.length ? (
              <tr><td colSpan={6}>No matching transactions.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  )
}
