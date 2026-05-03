import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

const dataDir = path.join(process.cwd(), '.data')
const secretPath = path.join(dataDir, 'simplefin.secret.json')

type SecretFile = {
  accessUrl: string
  updatedAt: string
}

export async function readAccessUrl() {
  try {
    const raw = await readFile(secretPath, 'utf8')
    const parsed = JSON.parse(raw) as SecretFile
    return parsed.accessUrl
  } catch {
    return null
  }
}

export async function writeAccessUrl(accessUrl: string) {
  await mkdir(dataDir, { recursive: true })
  await writeFile(secretPath, JSON.stringify({ accessUrl, updatedAt: new Date().toISOString() }, null, 2), {
    mode: 0o600,
  })
}

export async function clearAccessUrl() {
  await rm(secretPath, { force: true })
}
