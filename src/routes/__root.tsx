/// <reference types="vite/client" />
import type { ReactNode } from 'react'
import {
  Bell,
  CircleHelp,
  CreditCard,
  Gauge,
  LayoutDashboard,
  Search,
  Settings,
  Sparkles,
  Tags,
} from 'lucide-react'
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
            <span className={styles.logoMark}>F</span>
            <span className={styles.title}>Personal Finance</span>
          </div>
          <nav className={styles.nav} aria-label="Primary navigation">
            <Link to="/" className={styles.navLink} activeProps={{ className: `${styles.navLink} ${styles.active}` }}>
              <span className={styles.navIcon}><LayoutDashboard size={18} /></span>
              Dashboard
            </Link>
            <Link to="/accounts" className={styles.navLink} activeProps={{ className: `${styles.navLink} ${styles.active}` }}>
              <span className={styles.navIcon}><CreditCard size={18} /></span>
              Accounts
            </Link>
            <Link to="/transactions" className={styles.navLink} activeProps={{ className: `${styles.navLink} ${styles.active}` }}>
              <span className={styles.navIcon}><Gauge size={18} /></span>
              Transactions
            </Link>
            <Link to="/categories" className={styles.navLink} activeProps={{ className: `${styles.navLink} ${styles.active}` }}>
              <span className={styles.navIcon}><Tags size={18} /></span>
              Categories
            </Link>
            <Link to="/setup" className={styles.navLink} activeProps={{ className: `${styles.navLink} ${styles.active}` }}>
              <span className={styles.navIcon}><Settings size={18} /></span>
              Setup
            </Link>
          </nav>
          <div className={styles.sidebarCard}>
            <span className={styles.sidebarCardIcon}><Sparkles size={16} /></span>
            <strong>Cash flow lab</strong>
            <span>Synced accounts, rules, and monthly movement in one workspace.</span>
          </div>
        </aside>
        <main className={styles.main}>
          <div className={styles.topbar}>
            <label className={styles.search}>
              <Search size={17} />
              <input placeholder="Search transactions, accounts, categories..." />
            </label>
            <button className={styles.iconButton} type="button" aria-label="Notifications"><Bell size={18} /></button>
            <button className={styles.iconButton} type="button" aria-label="Help"><CircleHelp size={18} /></button>
            <div className={styles.profile}>
              <span className={styles.avatar}>PF</span>
              <span>Local workspace</span>
            </div>
          </div>
          <div className={styles.content}>
            <Outlet />
          </div>
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
