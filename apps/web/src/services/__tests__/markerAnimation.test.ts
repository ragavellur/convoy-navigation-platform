import { describe, it, expect, vi } from 'vitest'
import { lerp, lerpPosition, calculateDeadReckoning, MarkerAnimator } from '../markerAnimation'

describe('lerp', () => {
  it('returns start when t=0', () => {
    expect(lerp(10, 20, 0)).toBe(10)
  })

  it('returns end when t=1', () => {
    expect(lerp(10, 20, 1)).toBe(20)
  })

  it('returns midpoint when t=0.5', () => {
    expect(lerp(10, 20, 0.5)).toBe(15)
  })

  it('clamps t to [0, 1]', () => {
    expect(lerp(10, 20, -0.5)).toBe(10)
    expect(lerp(10, 20, 1.5)).toBe(20)
  })
})

describe('lerpPosition', () => {
  it('interpolates between two positions', () => {
    const result = lerpPosition(0, 0, 10, 20, 0.5)
    expect(result.lat).toBe(5)
    expect(result.lng).toBe(10)
  })
})

describe('calculateDeadReckoning', () => {
  it('returns same position when heading is null', () => {
    const result = calculateDeadReckoning(12, 34, null, 10, 1000)
    expect(result.lat).toBe(12)
    expect(result.lng).toBe(34)
  })

  it('returns same position when speed is < 0.5', () => {
    const result = calculateDeadReckoning(12, 34, 90, 0.3, 1000)
    expect(result.lat).toBe(12)
    expect(result.lng).toBe(34)
  })

  it('calculates new position given heading and speed', () => {
    const result = calculateDeadReckoning(0, 0, 0, 10, 1000)
    expect(result.lat).not.toBe(0)
    expect(result.lng).toBe(0)
  })
})

describe('MarkerAnimator', () => {
  it('calls onUpdate immediately on first updateTarget', () => {
    const onUpdate = (_id: string, lat: number, lng: number, _heading: number | null) => {
      expect(lat).toBe(12.34)
      expect(lng).toBe(56.78)
    }
    const animator = new MarkerAnimator(onUpdate)
    animator.updateTarget('v1', 12.34, 56.78, null, null)
    animator.destroy()
  })

  it('ignores invalid coordinates', () => {
    const onUpdate = vi.fn()
    const animator = new MarkerAnimator(onUpdate)
    animator.updateTarget('v1', NaN, 56.78, null, null)
    animator.updateTarget('v1', 12.34, Infinity, null, null)
    expect(onUpdate).not.toHaveBeenCalled()
    animator.destroy()
  })

  it('skips animation when distance < 1m', () => {
    const onUpdate = vi.fn()
    const animator = new MarkerAnimator(onUpdate)
    animator.updateTarget('v1', 12.34, 56.78, null, null)
    onUpdate.mockClear()
    animator.updateTarget('v1', 12.3400001, 56.7800001, null, null)
    expect(onUpdate).toHaveBeenCalled()
    animator.destroy()
  })

  it('destroy clears all state', () => {
    const onUpdate = vi.fn()
    const animator = new MarkerAnimator(onUpdate)
    animator.updateTarget('v1', 12.34, 56.78, null, null)
    animator.destroy()
    onUpdate.mockClear()
    animator.updateTarget('v1', 13.0, 57.0, null, null)
    expect(onUpdate).toHaveBeenCalledTimes(1)
  })
})
