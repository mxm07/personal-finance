import { z } from 'zod'

export const simpleFinConnectionSchema = z.object({
  conn_id: z.string(),
  name: z.string(),
  org_id: z.string().optional(),
  org_name: z.string().optional(),
  org_url: z.string().optional(),
  sfin_url: z.string().optional(),
})

export const simpleFinTransactionSchema = z.object({
  id: z.string(),
  posted: z.number(),
  amount: z.string(),
  description: z.string(),
  transacted_at: z.number().optional(),
  pending: z.boolean().optional(),
  extra: z.unknown().optional(),
})

export const simpleFinAccountSchema = z.object({
  id: z.string(),
  name: z.string(),
  conn_id: z.string(),
  conn_name: z.string().optional(),
  currency: z.string(),
  balance: z.string(),
  'available-balance': z.string().optional(),
  'balance-date': z.number(),
  transactions: z.array(simpleFinTransactionSchema).optional(),
  extra: z.unknown().optional(),
})

export const simpleFinErrorSchema = z.object({
  code: z.string(),
  msg: z.string().optional(),
  message: z.string().optional(),
  conn_id: z.string().optional(),
  account_id: z.string().optional(),
})

export const simpleFinAccountSetSchema = z.object({
  errlist: z.array(simpleFinErrorSchema).default([]),
  errors: z.array(z.string()).optional(),
  connections: z.array(simpleFinConnectionSchema).default([]),
  accounts: z.array(simpleFinAccountSchema).default([]),
})

export type SimpleFinAccountSet = z.infer<typeof simpleFinAccountSetSchema>
export type SimpleFinTransaction = z.infer<typeof simpleFinTransactionSchema>
