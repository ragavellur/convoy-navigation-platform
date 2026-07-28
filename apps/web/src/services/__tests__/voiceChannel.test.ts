import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockSocketOn = vi.fn()
const mockSocketEmit = vi.fn()
const mockSocketDisconnect = vi.fn()
const mockRecvTransportOn = vi.fn()
const mockDeviceLoad = vi.fn()
const mockDeviceCreateRecvTransport = vi.fn()
const mockDeviceCreateSendTransport = vi.fn()

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => ({
    on: mockSocketOn,
    emit: mockSocketEmit,
    disconnect: mockSocketDisconnect,
  })),
}))

vi.mock('mediasoup-client', () => ({
  Device: function () {
    return {
      load: mockDeviceLoad,
      createRecvTransport: mockDeviceCreateRecvTransport,
      createSendTransport: mockDeviceCreateSendTransport,
      loaded: false,
      rtpCapabilities: {},
    }
  },
}))

import { voiceChannel } from '../voiceChannel'

beforeEach(() => {
  mockSocketOn.mockReset()
  mockSocketEmit.mockReset()
  mockSocketDisconnect.mockReset()
  mockRecvTransportOn.mockReset()
  mockDeviceLoad.mockReset()
  mockDeviceCreateRecvTransport.mockReset()
  mockDeviceCreateSendTransport.mockReset()

  vi.stubGlobal('AudioContext', function () {
    return {
      createGain: vi.fn(() => ({ connect: vi.fn(), gain: { value: 1 } })),
      createMediaStreamSource: vi.fn(() => ({ connect: vi.fn() })),
      close: vi.fn(),
      destination: {},
    }
  })
  vi.stubGlobal(
    'MediaStream',
    vi.fn(() => ({})),
  )
  vi.stubGlobal(
    'Audio',
    vi.fn(() => ({ play: vi.fn() })),
  )
  vi.stubGlobal(
    'MediaStream',
    vi.fn(() => ({})),
  )
  vi.stubGlobal('navigator', {
    mediaDevices: { getUserMedia: vi.fn() },
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  voiceChannel.leave()
})

describe('voiceChannel', () => {
  it('starts disconnected', () => {
    expect(voiceChannel.getState()).toBe('disconnected')
  })

  it('getPeers returns empty initially', () => {
    expect(voiceChannel.getPeers()).toEqual([])
  })

  it('leave does not throw when not connected', () => {
    expect(() => voiceChannel.leave()).not.toThrow()
  })

  it('setNonSpeakerVolume does nothing when gainNode is null', () => {
    expect(() => voiceChannel.setNonSpeakerVolume(0.5)).not.toThrow()
  })

  it('stopSpeaking does not throw when not connected', () => {
    expect(() => voiceChannel.stopSpeaking()).not.toThrow()
  })

  it('startSpeaking does not throw when not connected', async () => {
    await expect(voiceChannel.startSpeaking()).resolves.not.toThrow()
  })

  it('join connects to room', async () => {
    mockSocketOn.mockImplementation((event, cb) => {
      if (event === 'connect') cb()
    })
    mockSocketEmit.mockImplementation((event, _data, cb) => {
      if (event === 'join-room') cb({ rtpCapabilities: {}, routerId: 'r1', peers: [] })
    })
    mockDeviceLoad.mockResolvedValueOnce(undefined)
    mockRecvTransportOn.mockImplementation((_event, _cb) => {})
    mockDeviceCreateRecvTransport.mockReturnValueOnce({
      id: 'recv-1',
      on: mockRecvTransportOn,
      close: vi.fn(),
    })

    await expect(
      voiceChannel.join('room1', 'user1', 'Alice', { onStateChange: vi.fn() }),
    ).resolves.toBeUndefined()

    expect(voiceChannel.getPeers()).toEqual([])
  })
})
