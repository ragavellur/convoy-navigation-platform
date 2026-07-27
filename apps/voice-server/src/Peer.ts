import type { Room } from './Room.js'

export class Peer {
  readonly socketId: string
  readonly userId: string
  readonly userName: string
  private room: Room
  private transports = new Map<string, any>()
  private producers = new Map<string, any>()
  private consumers = new Map<string, any>()

  constructor(socketId: string, userId: string, userName: string, room: Room) {
    this.socketId = socketId
    this.userId = userId
    this.userName = userName
    this.room = room
  }

  get id(): string {
    return this.socketId
  }

  async createTransport(direction: 'send' | 'recv', options: { listenInfos: any[] }): Promise<any> {
    const transport = await this.room.router.createWebRtcTransport({
      listenInfos: options.listenInfos,
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
    })

    transport.on('dtlsstatechange', (state: string) => {
      if (state === 'closed' || state === 'failed') {
        transport.close()
        this.transports.delete(transport.id)
      }
    })

    this.transports.set(transport.id, transport)
    return transport
  }

  getTransport(transportId: string): any | undefined {
    return this.transports.get(transportId)
  }

  addProducer(producer: any): void {
    this.producers.set(producer.id, producer)
    this.room.addProducer(producer)
  }

  getProducers(): any[] {
    return Array.from(this.producers.values())
  }

  addConsumer(consumer: any): void {
    this.consumers.set(consumer.id, consumer)
  }

  getConsumer(consumerId: string): any | undefined {
    return this.consumers.get(consumerId)
  }

  close(): void {
    for (const t of this.transports.values()) t.close()
    for (const p of this.producers.values()) p.close()
    for (const c of this.consumers.values()) c.close()
    this.transports.clear()
    this.producers.clear()
    this.consumers.clear()
  }
}
