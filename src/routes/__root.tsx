/// <reference types="vite/client" />
import type { ReactNode } from 'react'
import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router'
import '../styles/global.scss'
import styles from './__root.module.scss'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Personal Finance' },
    ],
  }),
  component: RootComponent,
})

function RootComponent() {
  return (
    <RootDocument>
      <div className={styles.shell}>
        <aside className={styles.sidebar}>
          <div className={styles.brand}>
            <span className={styles.eyebrow}>Personal ledger</span>
            <span className={styles.title}>Finance</span>
          </div>
          <nav className={styles.nav} aria-label="Primary navigation">
            <Link to="/" className={styles.navLink} activeProps={{ className: `${styles.navLink} ${styles.active}` }}>
              Overview
            </Link>
            <Link to="/transactions" className={styles.navLink} activeProps={{ className: `${styles.navLink} ${styles.active}` }}>
              Transactions
            </Link>
            <Link to="/accounts" className={styles.navLink} activeProps={{ className: `${styles.navLink} ${styles.active}` }}>
              Accounts
            </Link>
            <Link to="/categories" className={styles.navLink} activeProps={{ className: `${styles.navLink} ${styles.active}` }}>
              Categories
            </Link>
            <Link to="/setup" className={styles.navLink} activeProps={{ className: `${styles.navLink} ${styles.active}` }}>
              Setup
            </Link>
          </nav>
        </aside>
        <main className={styles.main}>
          <Outlet />
        </main>
      </div>
    </RootDocument>
  )
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
