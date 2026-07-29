import { describe, it, expect, vi } from 'vitest'
import { MarkerAnimator } from '../markerAnimation'

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
