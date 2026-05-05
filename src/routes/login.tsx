import { createFileRoute } from '@tanstack/react-router'
import { ShieldCheck } from 'lucide-react'
import { getCurrentUser } from '../server-functions'
import styles from './login.module.scss'

export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>) => ({
    error: typeof search.error === 'string' ? search.error : undefined,
    redirect: typeof search.redirect === 'string' ? search.redirect : undefined,
  }),
  loader: () => getCurrentUser(),
  component: LoginPage,
})

function LoginPage() {
  const data = Route.useLoaderData()
  const search = Route.useSearch()
  const configured = data.auth.configured
  const signInHref = search.redirect
    ? `/auth/google?redirect=${encodeURIComponent(search.redirect)}`
    : '/auth/google'

  return (
    <main className={styles.page}>
      <section className={styles.panel}>
        <div className={styles.mark}>
          <ShieldCheck size={24} />
        </div>
        <p className={styles.kicker}>Personal Finance</p>
        <h1>Sign in</h1>
        <p className={styles.copy}>
          Access is restricted to your configured Google account.
        </p>

        {search.error ? (
          <p className={styles.error}>{formatLoginError(search.error)}</p>
        ) : null}

        {!configured ? (
          <div className={styles.notice}>
            <strong>Authentication is not configured.</strong>
            <span>{formatMissingAuthConfig(data.auth.missing)}</span>
          </div>
        ) : (
          <a className={styles.googleButton} href={signInHref}>
            <span className={styles.googleMark}>G</span>
            Sign in with Google
          </a>
        )}

        {data.auth.allowedEmails.length ? (
          <p className={styles.allowed}>Allowed accounts: {data.auth.allowedEmails.join(', ')}</p>
        ) : null}
      </section>
    </main>
  )
}

function formatMissingAuthConfig(missing: string[] | undefined) {
  if (!missing?.length) {
    return 'Set Google OAuth environment variables before hosting this app.'
  }

  return `Missing or invalid server config: ${missing.join(', ')}.`
}

function formatLoginError(error: string) {
  const messages: Record<string, string> = {
    access_denied: 'Google sign-in was cancelled.',
    email_not_verified: 'This Google account does not have a verified email address.',
    invalid_oauth_state: 'The sign-in request expired. Try again.',
    invalid_id_token: 'Google could not verify the identity token.',
    missing_id_token: 'Google did not return an identity token.',
    missing_oauth_response: 'Google did not return the expected sign-in response.',
    unauthorized_email: 'That Google account is not allowed for this app.',
  }
  return messages[error] ?? 'Sign-in failed. Try again.'
}
