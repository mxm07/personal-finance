import { createFileRoute } from '@tanstack/react-router'
import { signOut } from '../server/auth'

export const Route = createFileRoute('/logout')({
  server: {
    handlers: {
      GET: async () => signOut(),
      POST: async () => signOut(),
    },
  },
})
