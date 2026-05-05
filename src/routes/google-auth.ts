import { createFileRoute } from '@tanstack/react-router'
import { startGoogleSignIn } from '../server/auth'

export const Route = createFileRoute('/google-auth')({
  server: {
    handlers: {
      GET: async () => startGoogleSignIn().catch((error) => {
        console.error('Google sign-in start failed:', error)
        return new Response(`Google sign-in could not start: ${describeStartError(error)}`, {
          status: 200,
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
          },
        })
      }),
    },
  },
})

function describeStartError(error: unknown) {
  if (error instanceof Error) {
    if (error.message.includes('APP_BASE_URL')) {
      return 'invalid APP_BASE_URL'
    }
    if (error.message.includes('SESSION_PASSWORD')) {
      return 'invalid SESSION_PASSWORD'
    }
    if (error.message.includes('Google auth is not configured')) {
      return 'missing Google OAuth configuration'
    }
  }

  return 'server configuration error'
}
