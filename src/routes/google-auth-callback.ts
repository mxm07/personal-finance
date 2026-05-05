import { createFileRoute } from '@tanstack/react-router'
import { completeGoogleSignIn } from '../server/auth'

export const Route = createFileRoute('/google-auth-callback')({
  server: {
    handlers: {
      GET: async ({ request }) => completeGoogleSignIn(request),
    },
  },
})
