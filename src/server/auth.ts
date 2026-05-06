import { randomBytes } from 'node:crypto'
import { redirect } from '@tanstack/react-router'
import { getRequestUrl, setResponseStatus, useSession } from '@tanstack/react-start/server'
import { OAuth2Client } from 'google-auth-library'

type AuthSessionData = {
  user?: {
    email: string
    name?: string
    picture?: string
  }
  oauthState?: string
  redirectTo?: string
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

export async function requireAuthenticatedUserForPage(redirectTo?: string) {
  const user = await getAuthenticatedUser()
  if (!user) {
    throw redirect({
      to: '/login',
      search: {
        error: undefined,
        redirect: redirectTo,
      },
    })
  }
  return user
}

export async function requireAuthenticatedUserForServerFn() {
  const user = await getAuthenticatedUser()
  if (!user) {
    setResponseStatus(401, 'Unauthorized')
    throw new Error('Authentication required.')
  }
  return user
}

export async function startGoogleSignIn() {
  const config = getGoogleAuthConfig()
  const requestUrl = getRequestUrl({ xForwardedHost: true })
  const redirectTo = sanitizeRedirectPath(requestUrl.searchParams.get('redirect'))
  const state = randomBytes(stateBytes).toString('base64url')
  const session = await getAuthSession()
  await session.update({ oauthState: state, redirectTo })

  return redirectResponse(createGoogleOAuthClient(config).generateAuthUrl({
    prompt: 'select_account',
    scope: ['openid', 'email', 'profile'],
    state,
  }))
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
  if (!session.data.oauthState || session.data.oauthState !== state) {
    await session.update({ oauthState: undefined })
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
  if (!email || !profile.email_verified) {
    return redirectResponse('/login?error=email_not_verified')
  }
  if (!config.allowedEmails.includes(email)) {
    await session.update({ oauthState: undefined, user: undefined })
    return redirectResponse('/login?error=unauthorized_email')
  }

  const redirectTo = session.data.redirectTo ?? '/'
  await session.update({
    oauthState: undefined,
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
    checks.sessionPassword &&
    checks.appBaseUrl,
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
    return normalizeBaseUrl(configured)
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
    appBaseUrl: isValidBaseUrl(getConfigValue('APP_BASE_URL')),
  }
}

function isValidSessionPassword(value: string | undefined) {
  return Boolean(value && value.length >= 32)
}

function getConfigValue(name: string) {
  const value = process.env[name] ?? getAmplifySecretValue(name)
  if (typeof value !== 'string') {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed.replace(/^(['"])(.*)\1$/, '$2')
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

function isValidBaseUrl(value: string | undefined) {
  if (!value) {
    return true
  }

  try {
    normalizeBaseUrl(value)
    return true
  } catch {
    return false
  }
}

function normalizeBaseUrl(value: string) {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('APP_BASE_URL must be a valid absolute URL.')
  }

  if (url.protocol !== 'https:' && url.hostname !== 'localhost') {
    throw new Error('APP_BASE_URL must use https outside localhost.')
  }

  url.pathname = url.pathname.replace(/\/+$/, '')
  url.search = ''
  url.hash = ''
  return url.toString()
}

function createGoogleOAuthClient(config: ReturnType<typeof getGoogleAuthConfig>) {
  return new OAuth2Client(config.clientId, config.clientSecret, config.redirectUri)
}

async function exchangeCodeForToken(code: string, config: ReturnType<typeof getGoogleAuthConfig>) {
  const { tokens } = await createGoogleOAuthClient(config).getToken({
    code,
    redirect_uri: config.redirectUri,
  })
  return tokens
}

async function verifyGoogleIdToken(idToken: string, clientId: string) {
  const ticket = await new OAuth2Client(clientId).verifyIdToken({
    idToken,
    audience: clientId,
  })
  const payload = ticket.getPayload()
  if (!payload) {
    throw new Error('Google ID token did not include a payload.')
  }
  return payload
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
  return new Response(null, {
    status: 302,
    headers: {
      Location: location,
    },
  })
}
