import dotenv from 'dotenv'
dotenv.config()

import express from 'express'
import http from 'http'
import { Server as SocketIOServer } from 'socket.io'
import cors from 'cors'
import { createWorkers } from './mediasoupWorkers.js'
import { Room } from './Room.js'

const PORT = parseInt(process.env.VOICE_PORT || '3001', 10)
const MEDIASOUP_LISTEN_IP = process.env.MEDIASOUP_LISTEN_IP || '0.0.0.0'
const MEDIASOUP_PORT_MIN = parseInt(process.env.MEDIASOUP_PORT_MIN || '20000', 10)
const MEDIASOUP_PORT_MAX = parseInt(process.env.MEDIASOUP_PORT_MAX || '20100', 10)

const app = express()
app.use(cors())
app.use(express.json())

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', rooms: rooms.size })
})

const server = http.createServer(app)
const io = new SocketIOServer(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
})

const rooms = new Map<string, Room>()

async function start() {
  console.log('[VoiceServer] Creating mediasoup workers...')
  await createWorkers({
    numWorkers: 2,
    listenIp: MEDIASOUP_LISTEN_IP,
    portRange: { min: MEDIASOUP_PORT_MIN, max: MEDIASOUP_PORT_MAX },
  })
  console.log('[VoiceServer] mediasoup workers ready')

  io.on('connection', (socket: any) => {
    console.log(`[VoiceServer] Client connected: ${socket.id}`)

    socket.on('join-room', async (data: any, cb: any) => {
      const { roomId, userId, userName } = data
      let room = rooms.get(roomId)
      if (!room) {
        room = await Room.create(roomId)
        rooms.set(roomId, room)
      }

      const peer = await room.addPeer(socket, userId, userName)
      cb({
        routerId: room.router.id,
        peers: room.getPeerList(),
        rtpCapabilities: room.router.rtpCapabilities,
      })

      socket.to(roomId).emit('peer-joined', { peerId: peer.id, userId, userName })
      console.log(`[VoiceServer] ${userName} joined room ${roomId}`)
    })

    socket.on('leave-room', (data: any) => {
      handleLeaveRoom(socket, data.roomId)
    })

    socket.on('create-web-transport', async (data: any, cb: any) => {
      const room = rooms.get(data.roomId)
      if (!room) return cb({ error: 'Room not found' })

      const peer = room.getPeer(socket.id)
      if (!peer) return cb({ error: 'Peer not found' })

      try {
        const transport = await peer.createTransport(data.direction, {
          listenInfos: [
            {
              protocol: 'udp',
              ip: MEDIASOUP_LISTEN_IP,
              announcedIp: process.env.MEDIASOUP_ANNOUNCED_IP || undefined,
            },
          ],
        })
        cb({
          id: transport.id,
          iceParameters: transport.iceParameters,
          iceCandidates: transport.iceCandidates,
          dtlsParameters: transport.dtlsParameters,
        })
      } catch (err) {
        cb({ error: (err as Error).message })
      }
    })

    socket.on('connect-transport', async (data: any, cb: any) => {
      const room = rooms.get(data.roomId)
      if (!room) return cb({ error: 'Room not found' })

      const peer = room.getPeer(socket.id)
      if (!peer) return cb({ error: 'Peer not found' })

      const transport = peer.getTransport(data.transportId)
      if (!transport) return cb({ error: 'Transport not found' })

      await transport.connect({ dtlsParameters: data.dtlsParameters })
      cb({ ok: true })
    })

    socket.on('produce', async (data: any, cb: any) => {
      const room = rooms.get(data.roomId)
      if (!room) return cb({ error: 'Room not found' })

      const peer = room.getPeer(socket.id)
      if (!peer) return cb({ error: 'Peer not found' })

      const transport = peer.getTransport(data.transportId)
      if (!transport) return cb({ error: 'Transport not found' })

      const producer = await transport.produce({
        kind: data.kind,
        rtpParameters: data.rtpParameters,
      })
      peer.addProducer(producer)

      socket.to(data.roomId).emit('new-producer', {
        producerId: producer.id,
        producerUserId: peer.userId,
        producerUserName: peer.userName,
      })

      cb({ id: producer.id })
    })

    socket.on('consume', async (data: any, cb: any) => {
      const room = rooms.get(data.roomId)
      if (!room) return cb({ error: 'Room not found' })

      const peer = room.getPeer(socket.id)
      if (!peer) return cb({ error: 'Peer not found' })

      const transport = peer.getTransport(data.transportId)
      if (!transport) return cb({ error: 'Transport not found' })

      const producer = room.getProducer(data.producerId)
      if (!producer) return cb({ error: 'Producer not found' })

      if (
        !room.router.canConsume({
          producerId: data.producerId,
          rtpCapabilities: data.rtpCapabilities,
        })
      ) {
        return cb({ error: 'Cannot consume' })
      }

      const consumer = await transport.consume({
        producerId: data.producerId,
        rtpCapabilities: data.rtpCapabilities,
        paused: true,
      })
      peer.addConsumer(consumer)

      cb({
        id: consumer.id,
        producerId: data.producerId,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters,
      })
    })

    socket.on('resume-consumer', async (data: any) => {
      const room = rooms.get(data.roomId)
      if (!room) return
      const peer = room.getPeer(socket.id)
      if (!peer) return
      const consumer = peer.getConsumer(data.consumerId)
      if (consumer) await consumer.resume()
    })

    socket.on('ptt-start', (data: any) => {
      const room = rooms.get(data.roomId)
      if (!room) return
      const peer = room.getPeer(socket.id)
      if (!peer) return

      room.setActiveSpeaker(peer.userId)
      io.to(data.roomId).emit('ptt-active', { userId: peer.userId, userName: peer.userName })
    })

    socket.on('ptt-stop', (data: any) => {
      const room = rooms.get(data.roomId)
      if (!room) return
      room.clearActiveSpeaker()
      io.to(data.roomId).emit('ptt-inactive', {})
    })

    socket.on('disconnect', () => {
      for (const [roomId, room] of rooms) {
        if (room.hasPeer(socket.id)) {
          handleLeaveRoom(socket, roomId)
        }
      }
      console.log(`[VoiceServer] Client disconnected: ${socket.id}`)
    })
  })

  server.listen(PORT, () => {
    console.log(`[VoiceServer] Listening on port ${PORT}`)
  })
}

function handleLeaveRoom(socket: any, roomId: string) {
  const room = rooms.get(roomId)
  if (!room) return

  const peer = room.getPeer(socket.id)
  const peerUserId = peer?.userId

  room.removePeer(socket.id)
  socket.leave(roomId)

  if (room.isEmpty()) {
    room.close()
    rooms.delete(roomId)
    console.log(`[VoiceServer] Room ${roomId} destroyed (empty)`)
  } else if (peerUserId) {
    io.to(roomId).emit('peer-left', { peerId: socket.id, userId: peerUserId })
  }
}

start().catch((err) => {
  console.error('[VoiceServer] Failed to start:', err)
  process.exit(1)
})
