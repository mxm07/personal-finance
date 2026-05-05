import { createFileRoute } from '@tanstack/react-router'
import { startGoogleSignIn } from '../server/auth'

export const Route = createFileRoute('/google-auth')({
  server: {
    handlers: {
      GET: async () => startGoogleSignIn(),
    },
  },
})
