import { createFileRoute } from '@tanstack/react-router'
import { startGoogleSignIn } from '../server/auth'

export const Route = createFileRoute('/auth/google')({
  server: {
    handlers: {
      GET: async () => startGoogleSignIn(),
    },
  },
})
