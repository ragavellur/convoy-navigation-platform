import { io, type Socket } from 'socket.io-client'
import * as mediasoupClient from 'mediasoup-client'

const VOICE_SERVER_URL = import.meta.env.VITE_VOICE_SERVER_URL || 'http://localhost:3001'

export interface VoicePeer {
  peerId: string
  userId: string
  userName: string
  consumer?: mediasoupClient.types.Consumer
}

export type VoiceState = 'disconnected' | 'connecting' | 'connected' | 'speaking'

function emitWithAck(socket: Socket, event: string, data: unknown): Promise<any> {
  return new Promise((resolve, reject) => {
    socket.emit(event, data, (response: any) => {
      if (response?.error) reject(new Error(response.error))
      else resolve(response)
    })
  })
}

class VoiceChannel {
  private socket: Socket | null = null
  private device: mediasoupClient.Device | null = null
  private sendTransport: mediasoupClient.types.Transport | null = null
  private recvTransport: mediasoupClient.types.Transport | null = null
  private producer: mediasoupClient.types.Producer | null = null
  private peers = new Map<string, VoicePeer>()
  private roomId: string | null = null
  private userId: string | null = null
  private state: VoiceState = 'disconnected'
  private gainNode: GainNode | null = null
  private audioContext: AudioContext | null = null

  private onStateChange?: (state: VoiceState) => void
  private onPeersChange?: (peers: VoicePeer[]) => void
  private onActiveSpeaker?: (userId: string | null, userName: string | null) => void

  async join(
    roomId: string,
    userId: string,
    userName: string,
    callbacks: {
      onStateChange?: (state: VoiceState) => void
      onPeersChange?: (peers: VoicePeer[]) => void
      onActiveSpeaker?: (userId: string | null, userName: string | null) => void
    },
  ): Promise<void> {
    this.roomId = roomId
    this.userId = userId
    this.onStateChange = callbacks.onStateChange
    this.onPeersChange = callbacks.onPeersChange
    this.onActiveSpeaker = callbacks.onActiveSpeaker

    this.setState('connecting')

    this.socket = io(VOICE_SERVER_URL, {
      transports: ['websocket'],
    })

    this.audioContext = new AudioContext()
    this.gainNode = this.audioContext.createGain()
    this.gainNode.connect(this.audioContext.destination)

    this.setupSocketListeners()

    await new Promise<void>((resolve) => {
      this.socket!.on('connect', () => resolve())
    })

    const result = await emitWithAck(this.socket!, 'join-room', {
      roomId,
      userId,
      userName,
    })

    this.device = new mediasoupClient.Device()
    await this.device.load({ routerRtpCapabilities: result.rtpCapabilities })

    this.recvTransport = this.device.createRecvTransport({
      id: result.routerId,
      iceParameters: {} as any,
      iceCandidates: [],
      dtlsParameters: { role: 'auto', fingerprints: [] } as any,
    })
    this.recvTransport.on('connect', async ({ dtlsParameters }: any, cb: any) => {
      await emitWithAck(this.socket!, 'connect-transport', {
        roomId,
        transportId: this.recvTransport!.id,
        dtlsParameters,
      })
      cb()
    })

    for (const peer of result.peers) {
      if (peer.userId !== userId) {
        this.peers.set(peer.peerId, {
          peerId: peer.peerId,
          userId: peer.userId,
          userName: peer.userName,
        })
      }
    }
    this.emitPeersChange()
    this.setState('connected')
  }

  async startProducing(): Promise<void> {
    if (!this.device || !this.socket || !this.roomId) return
    await this.ensureSendTransport()
    if (!this.sendTransport) return

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const track = stream.getAudioTracks()[0]

    this.producer = await this.sendTransport.produce({
      track,
      codecOptions: {
        opusStereo: true,
        opusDtx: true,
      },
    })
  }

  private async ensureSendTransport(): Promise<void> {
    if (this.sendTransport) return
    if (!this.socket || !this.roomId || !this.device) return

    const result = await emitWithAck(this.socket, 'create-web-transport', {
      roomId: this.roomId,
      direction: 'send',
    })

    this.sendTransport = this.device.createSendTransport({
      id: result.id,
      iceParameters: result.iceParameters,
      iceCandidates: result.iceCandidates,
      dtlsParameters: result.dtlsParameters,
    })

    this.sendTransport.on('connect', async ({ dtlsParameters }: any, cb: any) => {
      await emitWithAck(this.socket!, 'connect-transport', {
        roomId: this.roomId,
        transportId: this.sendTransport!.id,
        dtlsParameters,
      })
      cb()
    })

    this.sendTransport.on('produce', async ({ kind, rtpParameters }: any, cb: any) => {
      const id = await emitWithAck(this.socket!, 'produce', {
        roomId: this.roomId,
        transportId: this.sendTransport!.id,
        kind,
        rtpParameters,
      })
      cb({ id })
    })
  }

  async startSpeaking(): Promise<void> {
    if (!this.producer) {
      await this.startProducing()
    }
    this.socket?.emit('ptt-start', { roomId: this.roomId })
    this.setState('speaking')
  }

  stopSpeaking(): void {
    this.socket?.emit('ptt-stop', { roomId: this.roomId })
    this.setState('connected')
  }

  setNonSpeakerVolume(volume: number): void {
    if (this.gainNode) {
      this.gainNode.gain.value = volume
    }
  }

  private setupSocketListeners(): void {
    if (!this.socket) return

    this.socket.on('peer-joined', (data: { peerId: string; userId: string; userName: string }) => {
      if (data.userId !== this.userId) {
        this.peers.set(data.peerId, {
          peerId: data.peerId,
          userId: data.userId,
          userName: data.userName,
        })
        this.emitPeersChange()
      }
    })

    this.socket.on('peer-left', (data: { peerId: string }) => {
      const peer = this.peers.get(data.peerId)
      if (peer?.consumer) {
        peer.consumer.close()
      }
      this.peers.delete(data.peerId)
      this.emitPeersChange()
    })

    this.socket.on('new-producer', async (data: { producerId: string; producerUserId: string }) => {
      if (data.producerUserId !== this.userId) {
        const peer = Array.from(this.peers.values()).find((p) => p.userId === data.producerUserId)
        if (peer) {
          await this.consumeProducer(peer.peerId, data.producerId)
        }
      }
    })

    this.socket.on('ptt-active', (data: { userId: string; userName: string }) => {
      this.onActiveSpeaker?.(data.userId, data.userName)
      if (data.userId !== this.userId) {
        this.setNonSpeakerVolume(0.8)
      }
    })

    this.socket.on('ptt-inactive', () => {
      this.onActiveSpeaker?.(null, null)
      this.setNonSpeakerVolume(1.0)
    })
  }

  private async consumeProducer(peerId: string, producerId: string): Promise<void> {
    if (!this.recvTransport || !this.device || !this.socket || !this.roomId) return
    if (!this.device.loaded) return

    const result = await emitWithAck(this.socket, 'consume', {
      roomId: this.roomId,
      transportId: this.recvTransport.id,
      producerId,
      rtpCapabilities: this.device.rtpCapabilities,
    })

    if (result.error) return

    const consumer = await this.recvTransport.consume({
      id: result.id,
      producerId: result.producerId,
      kind: result.kind,
      rtpParameters: result.rtpParameters,
    })

    const peer = this.peers.get(peerId)
    if (peer) {
      peer.consumer = consumer
      const stream = new MediaStream([consumer.track])
      const audio = new Audio()
      audio.srcObject = stream
      audio.play()
      if (this.gainNode && this.audioContext) {
        const source = this.audioContext.createMediaStreamSource(stream)
        source.connect(this.gainNode)
      }
    }

    await emitWithAck(this.socket, 'resume-consumer', {
      roomId: this.roomId,
      consumerId: consumer.id,
    })
  }

  leave(): void {
    this.socket?.emit('leave-room', { roomId: this.roomId })
    this.producer?.close()
    this.sendTransport?.close()
    this.recvTransport?.close()
    this.socket?.disconnect()
    this.audioContext?.close()

    this.peers.clear()
    this.socket = null
    this.device = null
    this.sendTransport = null
    this.recvTransport = null
    this.producer = null
    this.roomId = null
    this.gainNode = null
    this.audioContext = null
    this.setState('disconnected')
    this.onActiveSpeaker?.(null, null)
  }

  private setState(state: VoiceState): void {
    this.state = state
    this.onStateChange?.(state)
  }

  private emitPeersChange(): void {
    this.onPeersChange?.(Array.from(this.peers.values()))
  }

  getState(): VoiceState {
    return this.state
  }

  getPeers(): VoicePeer[] {
    return Array.from(this.peers.values())
  }
}

export const voiceChannel = new VoiceChannel()
