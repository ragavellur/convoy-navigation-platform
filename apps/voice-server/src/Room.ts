import type { Socket } from 'socket.io'
import { getWorker } from './mediasoupWorkers.js'
import { Peer } from './Peer.js'

export class Room {
  readonly id: string
  readonly router: any
  private peers = new Map<string, Peer>()
  private producers = new Map<string, any>()
  private activeSpeakerUserId: string | null = null

  private constructor(id: string, router: any) {
    this.id = id
    this.router = router
  }

  static async create(id: string): Promise<Room> {
    const worker = getWorker()
    const router = await worker.createRouter({
      mediaCodecs: [
        {
          kind: 'audio' as const,
          mimeType: 'audio/opus',
          clockRate: 48000,
          channels: 2,
          parameters: {
            'sprop-stereo': 1,
            stereo: 1,
            useinbandfec: 1,
            usedtx: 1,
          },
        },
      ],
    })
    return new Room(id, router)
  }

  async addPeer(socket: Socket, userId: string, userName: string): Promise<Peer> {
    const peer = new Peer(socket.id, userId, userName, this)
    this.peers.set(socket.id, peer)
    socket.join(this.id)
    return peer
  }

  removePeer(socketId: string): void {
    const peer = this.peers.get(socketId)
    if (!peer) return
    for (const producer of peer.getProducers()) {
      this.producers.delete(producer.id)
    }
    peer.close()
    this.peers.delete(socketId)
  }

  getPeer(socketId: string): Peer | undefined {
    return this.peers.get(socketId)
  }

  hasPeer(socketId: string): boolean {
    return this.peers.has(socketId)
  }

  addProducer(producer: any): void {
    this.producers.set(producer.id, producer)
  }

  getProducer(producerId: string): any | undefined {
    return this.producers.get(producerId)
  }

  getPeerList(): Array<{ peerId: string; userId: string; userName: string }> {
    return Array.from(this.peers.values()).map((p) => ({
      peerId: p.socketId,
      userId: p.userId,
      userName: p.userName,
    }))
  }

  setActiveSpeaker(userId: string): void {
    this.activeSpeakerUserId = userId
  }

  clearActiveSpeaker(): void {
    this.activeSpeakerUserId = null
  }

  getActiveSpeaker(): string | null {
    return this.activeSpeakerUserId
  }

  isEmpty(): boolean {
    return this.peers.size === 0
  }

  close(): void {
    for (const peer of this.peers.values()) {
      peer.close()
    }
    this.peers.clear()
    this.producers.clear()
    this.router.close()
  }
}
