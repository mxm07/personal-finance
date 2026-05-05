import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { redirect } from '@tanstack/react-router'
import { getRequestUrl, useSession } from '@tanstack/react-start/server'

type AuthSessionData = {
  user?: {
    email: string
    name?: string
    picture?: string
  }
  oauthStateHash?: string
  redirectTo?: string
}

type GoogleTokenResponse = {
  access_token?: string
  expires_in?: number
  id_token?: string
  scope?: string
  token_type?: string
  error?: string
  error_description?: string
}

type GoogleTokenInfo = {
  aud?: string
  email?: string
  email_verified?: string | boolean
  name?: string
  picture?: string
}

const sessionName = 'pf_session'
const stateBytes = 32

export async function getAuthenticatedUser() {
  const sessionPassword = getConfigValue('SESSION_PASSWORD')
  if (!sessionPassword || sessionPassword.length < 32) {
    return null
  }
  const session = await getAuthSession()
  return session.data.user ?? null
}

export async function requireAuthenticatedUser() {
  const user = await getAuthenticatedUser()
  if (!user) {
    throw redirect({ to: '/login', search: { error: undefined, redirect: undefined } })
  }
  return user
}

export async function startGoogleSignIn() {
  const config = getGoogleAuthConfig()
  const requestUrl = getRequestUrl({ xForwardedHost: true })
  const redirectTo = sanitizeRedirectPath(requestUrl.searchParams.get('redirect'))
  const state = randomBytes(stateBytes).toString('base64url')
  const session = await getAuthSession()
  await session.update({ oauthStateHash: hashState(state), redirectTo })

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.searchParams.set('client_id', config.clientId)
  url.searchParams.set('redirect_uri', config.redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', 'openid email profile')
  url.searchParams.set('state', state)
  url.searchParams.set('prompt', 'select_account')

  return redirectResponse(url.toString())
}

export async function completeGoogleSignIn(request: Request) {
  const config = getGoogleAuthConfig()
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')
  if (error) {
    return redirectResponse(`/login?error=${encodeURIComponent(error)}`)
  }
  if (!code || !state) {
    return redirectResponse('/login?error=missing_oauth_response')
  }

  const session = await getAuthSession()
  if (!session.data.oauthStateHash || !safeEqual(session.data.oauthStateHash, hashState(state))) {
    await session.update({ oauthStateHash: undefined })
    return redirectResponse('/login?error=invalid_oauth_state')
  }

  const token = await exchangeCodeForToken(code, config).catch(() => null)
  if (!token?.id_token) {
    return redirectResponse('/login?error=missing_id_token')
  }

  const profile = await verifyGoogleIdToken(token.id_token, config.clientId).catch(() => null)
  if (!profile) {
    return redirectResponse('/login?error=invalid_id_token')
  }
  const email = profile.email?.toLocaleLowerCase()
  if (!email || !isEmailVerified(profile.email_verified)) {
    return redirectResponse('/login?error=email_not_verified')
  }
  if (!config.allowedEmails.includes(email)) {
    await session.update({ oauthStateHash: undefined, user: undefined })
    return redirectResponse('/login?error=unauthorized_email')
  }

  const redirectTo = session.data.redirectTo ?? '/'
  await session.update({
    oauthStateHash: undefined,
    redirectTo: undefined,
    user: {
      email,
      name: profile.name,
      picture: profile.picture,
    },
  })
  return redirectResponse(redirectTo)
}

export async function signOut() {
  const session = await getAuthSession()
  await session.clear()
  return redirectResponse('/login')
}

export function getAuthStatus() {
  const checks = getAuthConfigChecks()
  const configured = Boolean(
    checks.googleClientId &&
    checks.googleClientSecret &&
    checks.allowedEmails &&
    checks.sessionPassword,
  )
  return {
    configured,
    allowedEmails: getAllowedEmails(),
    missing: Object.entries(checks)
      .filter(([, present]) => !present)
      .map(([name]) => name),
  }
}

function getAuthSession() {
  return useSession<AuthSessionData>({
    name: sessionName,
    password: getSessionPassword(),
    maxAge: 60 * 60 * 24 * 30,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: getRequestUrl({ xForwardedHost: true }).protocol === 'https:',
      path: '/',
    },
  })
}

function getGoogleAuthConfig() {
  const clientId = getConfigValue('GOOGLE_CLIENT_ID')
  const clientSecret = getConfigValue('GOOGLE_CLIENT_SECRET')
  const allowedEmails = getAllowedEmails()
  if (!clientId || !clientSecret || !allowedEmails.length) {
    throw new Error('Google auth is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_ALLOWED_EMAILS.')
  }

  return {
    clientId,
    clientSecret,
    allowedEmails,
    redirectUri: new URL('/google-auth-callback', getBaseUrl()).toString(),
  }
}

function getAllowedEmails() {
  const value = getConfigValue('GOOGLE_ALLOWED_EMAILS') ?? getConfigValue('GOOGLE_ALLOWED_EMAIL') ?? ''
  return [...new Set(value
    .split(',')
    .map((email) => email.trim().toLocaleLowerCase())
    .filter(Boolean))]
}

function getSessionPassword() {
  const password = getConfigValue('SESSION_PASSWORD')
  if (!password || password.length < 32) {
    throw new Error('SESSION_PASSWORD must be set to at least 32 characters.')
  }
  return password
}

function getBaseUrl() {
  const configured = getConfigValue('APP_BASE_URL')
  if (configured) {
    return configured
  }

  const requestUrl = getRequestUrl({ xForwardedHost: true })
  return `${requestUrl.protocol}//${requestUrl.host}`
}

function getAuthConfigChecks() {
  return {
    googleClientId: Boolean(getConfigValue('GOOGLE_CLIENT_ID')),
    googleClientSecret: Boolean(getConfigValue('GOOGLE_CLIENT_SECRET')),
    allowedEmails: getAllowedEmails().length > 0,
    sessionPassword: isValidSessionPassword(getConfigValue('SESSION_PASSWORD')),
  }
}

function isValidSessionPassword(value: string | undefined) {
  return Boolean(value && value.length >= 32)
}

function getConfigValue(name: string) {
  return process.env[name] ?? getAmplifySecretValue(name)
}

function getAmplifySecretValue(name: string) {
  const secrets = parseAmplifySecrets()
  const value = secrets[name]
  return typeof value === 'string' ? value : undefined
}

function parseAmplifySecrets(): Record<string, unknown> {
  const raw = process.env.secrets
  if (!raw) {
    return {}
  }

  try {
    const parsed = JSON.parse(raw) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  } catch {
    return {}
  }
}

async function exchangeCodeForToken(code: string, config: ReturnType<typeof getGoogleAuthConfig>) {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: config.redirectUri,
  })
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const payload = await response.json() as GoogleTokenResponse
  if (!response.ok || payload.error) {
    throw new Error(payload.error_description ?? payload.error ?? 'Google token exchange failed.')
  }
  return payload
}

async function verifyGoogleIdToken(idToken: string, clientId: string) {
  const url = new URL('https://oauth2.googleapis.com/tokeninfo')
  url.searchParams.set('id_token', idToken)
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error('Google ID token verification failed.')
  }

  const payload = await response.json() as GoogleTokenInfo
  if (payload.aud !== clientId) {
    throw new Error('Google ID token audience did not match this app.')
  }
  return payload
}

function isEmailVerified(value: GoogleTokenInfo['email_verified']) {
  return value === true || value === 'true'
}

function hashState(state: string) {
  return createHash('sha256').update(state).digest('base64url')
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

function sanitizeRedirectPath(value: string | null) {
  if (!value || !value.startsWith('/')) {
    return '/'
  }
  if (value.startsWith('//') || value.startsWith('/auth/')) {
    return '/'
  }
  return value
}

function redirectResponse(location: string) {
  return new Response(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta http-equiv="refresh" content="0;url=${escapeHtmlAttribute(location)}">
    <title>Redirecting</title>
    <script>location.replace(${JSON.stringify(location)})</script>
  </head>
  <body>
    <a href="${escapeHtmlAttribute(location)}">Continue</a>
  </body>
</html>`, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    },
  })
}

function escapeHtmlAttribute(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}
