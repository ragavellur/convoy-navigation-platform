import { openDB, type IDBPDatabase } from 'idb'

const DB_NAME = 'convoy-offline'
const DB_VERSION = 1

export interface OfflineConvoy {
  id: string
  code: string
  name: string
  description?: string
  source_lat?: number
  source_lng?: number
  source_name?: string
  dest_lat?: number
  dest_lng?: number
  dest_name?: string
  status: string
  settings?: Record<string, unknown>
  updated: string
}

export interface OfflineMember {
  id: string
  convoy: string
  user: string
  vehicle?: string
  role?: string
  status?: string
  joined_at?: string
  userName?: string
  vehicleType?: string
}

export interface OfflinePosition {
  id: string
  vehicle: string
  convoy: string
  lat: number
  lng: number
  speed?: number
  heading?: number
  accuracy?: number
  updated: string
}

export interface OfflinePendingPosition {
  id: string
  vehicleId: string
  convoyId: string
  lat: number
  lng: number
  speed?: number
  heading?: number
  accuracy?: number
  timestamp: string
}

interface ConvoyDB {
  convoys: OfflineConvoy
  members: OfflineMember
  positions: OfflinePosition
  pendingPositions: OfflinePendingPosition
}

let dbPromise: Promise<IDBPDatabase<ConvoyDB>> | null = null

function getDB(): Promise<IDBPDatabase<ConvoyDB>> {
  if (!dbPromise) {
    dbPromise = openDB<ConvoyDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('convoys')) {
          const convoyStore = db.createObjectStore('convoys', { keyPath: 'id' })
          convoyStore.createIndex('by-code', 'code')
        }
        if (!db.objectStoreNames.contains('members')) {
          const memberStore = db.createObjectStore('members', { keyPath: 'id' })
          memberStore.createIndex('by-convoy', 'convoy')
        }
        if (!db.objectStoreNames.contains('positions')) {
          const positionStore = db.createObjectStore('positions', { keyPath: 'id' })
          positionStore.createIndex('by-convoy', 'convoy')
          positionStore.createIndex('by-vehicle', 'vehicle')
        }
        if (!db.objectStoreNames.contains('pendingPositions')) {
          db.createObjectStore('pendingPositions', { keyPath: 'id' })
        }
      },
    })
  }
  return dbPromise
}

export async function saveConvoy(convoy: OfflineConvoy): Promise<void> {
  const db = await getDB()
  await db.put('convoys', { ...convoy, updated: new Date().toISOString() })
}

export async function getConvoy(id: string): Promise<OfflineConvoy | undefined> {
  const db = await getDB()
  return db.get('convoys', id)
}

export async function getConvoyByCode(code: string): Promise<OfflineConvoy | undefined> {
  const db = await getDB()
  return db.getFromIndex('convoys', 'by-code', code)
}

export async function saveMembers(members: OfflineMember[]): Promise<void> {
  const db = await getDB()
  const tx = db.transaction('members', 'readwrite')
  for (const member of members) {
    await tx.store.put(member)
  }
  await tx.done
}

export async function getMembersByConvoy(convoyId: string): Promise<OfflineMember[]> {
  const db = await getDB()
  return db.getAllFromIndex('members', 'by-convoy', convoyId)
}

export async function savePosition(position: OfflinePosition): Promise<void> {
  const db = await getDB()
  await db.put('positions', position)
}

export async function savePositions(positions: OfflinePosition[]): Promise<void> {
  const db = await getDB()
  const tx = db.transaction('positions', 'readwrite')
  for (const pos of positions) {
    await tx.store.put(pos)
  }
  await tx.done
}

export async function getPositionsByConvoy(convoyId: string): Promise<OfflinePosition[]> {
  const db = await getDB()
  return db.getAllFromIndex('positions', 'by-convoy', convoyId)
}

export async function getPositionByVehicle(
  vehicleId: string,
): Promise<OfflinePosition | undefined> {
  const db = await getDB()
  return db.getFromIndex('positions', 'by-vehicle', vehicleId)
}

export async function queuePendingPosition(pos: OfflinePendingPosition): Promise<void> {
  const db = await getDB()
  await db.put('pendingPositions', pos)
}

export async function getPendingPositions(): Promise<OfflinePendingPosition[]> {
  const db = await getDB()
  return db.getAll('pendingPositions')
}

export async function removePendingPosition(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('pendingPositions', id)
}

export async function clearPendingPositions(): Promise<void> {
  const db = await getDB()
  await db.clear('pendingPositions')
}

export async function clearConvoyData(convoyId: string): Promise<void> {
  const db = await getDB()

  const memberTx = db.transaction('members', 'readwrite')
  const memberIndex = memberTx.store.index('by-convoy')
  let memberCursor = await memberIndex.openCursor(convoyId)
  while (memberCursor) {
    await memberCursor.delete()
    memberCursor = await memberCursor.continue()
  }
  await memberTx.done

  const posTx = db.transaction('positions', 'readwrite')
  const posIndex = posTx.store.index('by-convoy')
  let posCursor = await posIndex.openCursor(convoyId)
  while (posCursor) {
    await posCursor.delete()
    posCursor = await posCursor.continue()
  }
  await posTx.done

  await db.delete('convoys', convoyId)
}
