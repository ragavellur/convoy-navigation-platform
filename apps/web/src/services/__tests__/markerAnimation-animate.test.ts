import { describe, it, expect, vi, afterEach } from 'vitest'
import { MarkerAnimator } from '../markerAnimation'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('MarkerAnimator updateTarget', () => {
  it('schedules animation when position changes significantly', () => {
    const rafSpy = vi.fn()
    vi.stubGlobal('requestAnimationFrame', rafSpy)

    const onUpdate = vi.fn()
    const animator = new MarkerAnimator(onUpdate)

    animator.updateTarget('v1', 12.34, 56.78, 90, 10)
    expect(onUpdate).toHaveBeenCalledTimes(1)

    onUpdate.mockClear()
    animator.updateTarget('v1', 12.35, 56.79, 90, 10)
    expect(rafSpy).toHaveBeenCalled()
    animator.destroy()
  })

  it('does not schedule animation for small distance changes', () => {
    const rafSpy = vi.fn()
    vi.stubGlobal('requestAnimationFrame', rafSpy)

    const onUpdate = vi.fn()
    const animator = new MarkerAnimator(onUpdate)

    animator.updateTarget('v1', 12.34, 56.78, null, null)
    onUpdate.mockClear()

    animator.updateTarget('v1', 12.3400001, 56.7800001, null, null)
    expect(rafSpy).not.toHaveBeenCalled()
    animator.destroy()
  })
})
