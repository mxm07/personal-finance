import { getStore } from './storage/store'

const simpleFinAccessUrlKey = 'simplefin.accessUrl'

export async function readAccessUrl() {
  return getStore().getSetting(simpleFinAccessUrlKey)
}

export async function writeAccessUrl(accessUrl: string) {
  await getStore().putSetting(simpleFinAccessUrlKey, accessUrl)
}

export async function clearAccessUrl() {
  await getStore().deleteSetting(simpleFinAccessUrlKey)
}
