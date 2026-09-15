import type { AppState } from './types'
import { emptyState } from './types'

const DB_NAME = 'tide-return-window'
const STORE = 'state'
const KEY = 'current'

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/** 从 IndexedDB 读取本地抄录与进度；不存在则返回空状态 */
export async function loadState(): Promise<AppState> {
  try {
    const db = await openDB()
    const stored = await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const r = tx.objectStore(STORE).get(KEY)
      r.onsuccess = () => resolve(r.result)
      r.onerror = () => reject(r.error)
    })
    db.close()
    if (stored && typeof stored === 'object') {
      const base = emptyState()
      // 合并以容忍旧版本缺字段
      return {
        ...base,
        ...(stored as object),
        settings: { ...base.settings, ...(stored as AppState).settings }
      }
    }
  } catch (e) {
    console.warn('IndexedDB 读取失败，使用空状态', e)
  }
  return emptyState()
}

let saveTimer: ReturnType<typeof setTimeout> | null = null

/** 防抖写入 IndexedDB；数据仅留在本机浏览器中 */
export function saveState(state: AppState): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(async () => {
    try {
      const db = await openDB()
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite')
        tx.objectStore(STORE).put(state, KEY)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
      db.close()
    } catch (e) {
      console.warn('IndexedDB 写入失败', e)
    }
  }, 400)
}

export async function clearState(): Promise<void> {
  const db = await openDB()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(KEY)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}
