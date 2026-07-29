import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { MarkerAnimator } from '../markerAnimation'

beforeAll(() => {
  global.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    return setTimeout(() => cb(performance.now()), 16) as unknown as number
  }) as typeof global.requestAnimationFrame
  global.cancelAnimationFrame = ((id: number) =>
    clearTimeout(id)) as typeof global.cancelAnimationFrame
})

afterAll(() => {
  delete (global as any).requestAnimationFrame
  delete (global as any).cancelAnimationFrame
})

describe('MarkerAnimator', () => {
  it('calls onUpdate immediately on first updateTarget', () => {
    const onUpdate = vi.fn()
    const animator = new MarkerAnimator(onUpdate)
    animator.updateTarget('v1', 12.34, 56.78, null, null)
    expect(onUpdate).toHaveBeenCalledWith('v1', 12.34, 56.78, null)
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

  it('snaps when distance < 0.5m', () => {
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
