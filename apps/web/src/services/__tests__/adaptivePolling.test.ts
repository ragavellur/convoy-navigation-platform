import { describe, it, expect } from 'vitest'
import { classifyMovement, getPollingConfig, shouldPublish } from '../adaptivePolling'

describe('classifyMovement', () => {
  it('returns highway when speed > 40 km/h', () => {
    expect(classifyMovement(12, null, null, 0, 0)).toBe('highway')
  })

  it('returns urban when speed > 1 km/h and <= 40 km/h', () => {
    expect(classifyMovement(5, null, null, 0, 0)).toBe('urban')
  })

  it('returns stationary when speed <= 1 km/h', () => {
    expect(classifyMovement(0.2, null, null, 0, 0)).toBe('stationary')
  })

  it('classifies by distance when speed is null and prev position exists', () => {
    expect(classifyMovement(null, 0, 0, 0.0002, 0.0002)).toBe('urban')
    expect(classifyMovement(null, 0, 0, 0.00001, 0.00001)).toBe('stationary')
  })

  it('returns urban when speed is null and no prev position', () => {
    expect(classifyMovement(null, null, null, 0, 0)).toBe('urban')
  })

  it('classifies highway by large distance when no speed', () => {
    expect(classifyMovement(null, 0, 0, 0.01, 0.01)).toBe('highway')
  })
})

describe('getPollingConfig', () => {
  it('returns stationary config (30s interval, no threshold)', () => {
    expect(getPollingConfig('stationary')).toEqual({ intervalMs: 30000, distanceThresholdM: 0 })
  })

  it('returns urban config (5s, 15m threshold)', () => {
    expect(getPollingConfig('urban')).toEqual({ intervalMs: 5000, distanceThresholdM: 15 })
  })

  it('returns highway config (3s, 40m threshold)', () => {
    expect(getPollingConfig('highway')).toEqual({ intervalMs: 3000, distanceThresholdM: 40 })
  })
})

describe('shouldPublish', () => {
  it('returns true when distance threshold is 0 (stationary)', () => {
    expect(shouldPublish('stationary', 0, 0, 0.001, 0.001)).toBe(true)
  })

  it('returns true when no previous position', () => {
    expect(shouldPublish('urban', null, null, 0, 0)).toBe(true)
  })

  it('returns true when distance exceeds threshold (urban)', () => {
    expect(shouldPublish('urban', 0, 0, 0.0002, 0.0002)).toBe(true)
  })

  it('returns false when distance below threshold (urban)', () => {
    expect(shouldPublish('urban', 0, 0, 0.00005, 0.00005)).toBe(false)
  })

  it('returns false when distance below threshold (highway)', () => {
    expect(shouldPublish('highway', 0, 0, 0.0001, 0.0001)).toBe(false)
  })
})
