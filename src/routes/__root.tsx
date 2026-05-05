/// <reference types="vite/client" />
import { useEffect, useState, type FormEvent } from "react";
import type { ReactNode } from "react";
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
} from "lucide-react";
import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRoute,
  redirect,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import { getCurrentUser } from "../server-functions";
import "../styles/global.scss";
import styles from "./__root.module.scss";

export const Route = createRootRoute({
  beforeLoad: async ({ location }) => {
    if (
      location.pathname === "/login" ||
      location.pathname.startsWith("/auth/")
    ) {
      return { user: null };
    }

    const { user } = await getCurrentUser();
    if (!user) {
      throw redirect({
        to: "/login",
        search: {
          error: undefined,
          redirect: location.href,
        },
      });
    }

    return { user };
  },
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Personal Finance" },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  const router = useRouter();
  const location = useRouterState({ select: (state) => state.location });
  const pathname = location.pathname;
  const currentSearch = location.search as { search?: string };
  const { user } = Route.useRouteContext();
  const [globalSearch, setGlobalSearch] = useState(currentSearch.search ?? "");

  useEffect(() => {
    setGlobalSearch(
      pathname === "/transactions" ? (currentSearch.search ?? "") : "",
    );
  }, [currentSearch.search, pathname]);

  if (pathname === "/login") {
    return (
      <RootDocument>
        <Outlet />
      </RootDocument>
    );
  }

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = globalSearch.trim();

    void router.navigate({
      to: "/transactions",
      search: {
        search: query || undefined,
        page: 1,
        sortBy: "date",
        sortDir: "desc",
      },
    });
  };

  return (
    <RootDocument>
      <div className={styles.shell}>
        <aside className={styles.sidebar}>
          <div className={styles.brand}>
            <span className={styles.logoMark}>F</span>
            <span className={styles.title}>Personal Finance</span>
          </div>
          <nav className={styles.nav} aria-label="Primary navigation">
            <Link
              to="/"
              className={styles.navLink}
              activeProps={{ className: `${styles.navLink} ${styles.active}` }}
            >
              <span className={styles.navIcon}>
                <LayoutDashboard size={18} />
              </span>
              Dashboard
            </Link>
            <Link
              to="/accounts"
              className={styles.navLink}
              activeProps={{ className: `${styles.navLink} ${styles.active}` }}
            >
              <span className={styles.navIcon}>
                <CreditCard size={18} />
              </span>
              Accounts
            </Link>
            <Link
              to="/transactions"
              className={styles.navLink}
              activeProps={{ className: `${styles.navLink} ${styles.active}` }}
            >
              <span className={styles.navIcon}>
                <Gauge size={18} />
              </span>
              Transactions
            </Link>
            <Link
              to="/categories"
              className={styles.navLink}
              activeProps={{ className: `${styles.navLink} ${styles.active}` }}
            >
              <span className={styles.navIcon}>
                <Tags size={18} />
              </span>
              Categories
            </Link>
            <Link
              to="/setup"
              className={styles.navLink}
              activeProps={{ className: `${styles.navLink} ${styles.active}` }}
            >
              <span className={styles.navIcon}>
                <Settings size={18} />
              </span>
              Setup
            </Link>
          </nav>
        </aside>
        <main className={styles.main}>
          <div className={styles.topbar}>
            <form
              className={styles.search}
              role="search"
              onSubmit={submitSearch}
            >
              <button
                className={styles.searchButton}
                type="submit"
                aria-label="Search transactions"
              >
                <Search size={17} />
              </button>
              <input
                aria-label="Search transactions"
                placeholder="Search transactions..."
                value={globalSearch}
                onChange={(event) => setGlobalSearch(event.target.value)}
              />
            </form>
            <button
              className={styles.iconButton}
              type="button"
              aria-label="Notifications"
            >
              <Bell size={18} />
            </button>
            <button
              className={styles.iconButton}
              type="button"
              aria-label="Help"
            >
              <CircleHelp size={18} />
            </button>
            <div className={styles.profile}>
              {user?.picture ? (
                <img
                  className={styles.avatarImage}
                  src={user.picture}
                  alt=""
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span className={styles.avatar}>
                  {getUserInitials(user?.name ?? user?.email)}
                </span>
              )}
              <span className={styles.profileText}>
                {user?.name ?? user?.email ?? "Signed in"}
              </span>
              <a className={styles.logoutLink} href="/logout">
                Sign out
              </a>
            </div>
          </div>
          <div className={styles.content}>
            <Outlet />
          </div>
        </main>
      </div>
    </RootDocument>
  );
}

function getUserInitials(value?: string) {
  if (!value) {
    return "PF";
  }

  const [first, second] = value
    .replace(/@.*/, "")
    .split(/[\s._-]+/)
    .filter(Boolean);
  return `${first?.[0] ?? "P"}${second?.[0] ?? first?.[1] ?? "F"}`.toLocaleUpperCase();
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
  );
}
