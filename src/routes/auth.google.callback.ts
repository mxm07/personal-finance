import { createFileRoute } from '@tanstack/react-router'
import { completeGoogleSignIn } from '../server/auth'

export const Route = createFileRoute('/auth/google/callback')({
  server: {
    handlers: {
      GET: async ({ request }) => completeGoogleSignIn(request),
    },
  },
})
