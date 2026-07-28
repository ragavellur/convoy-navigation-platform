import { describe, it, expect, vi, afterEach } from 'vitest'
import { throttle, debounce } from '../throttle'

afterEach(() => {
  vi.useRealTimers()
})

describe('throttle', () => {
  it('calls the function immediately on first invocation', () => {
    const fn = vi.fn()
    const throttled = throttle(fn, 100)
    throttled()
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('calls only once if invoked multiple times within the limit', () => {
    vi.useFakeTimers()
    const fn = vi.fn()
    const throttled = throttle(fn, 100)
    throttled()
    throttled()
    throttled()
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('calls again after the limit has passed', () => {
    vi.useFakeTimers()
    const fn = vi.fn()
    const throttled = throttle(fn, 100)
    throttled()
    vi.advanceTimersByTime(150)
    throttled()
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('schedules a trailing call when invoked during cooldown', () => {
    vi.useFakeTimers()
    const fn = vi.fn()
    const throttled = throttle(fn, 100)
    throttled()
    vi.advanceTimersByTime(50)
    throttled()
    vi.advanceTimersByTime(100)
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('passes arguments to the original function', () => {
    const fn = vi.fn()
    const throttled = throttle(fn, 100)
    throttled(1, 'a')
    expect(fn).toHaveBeenCalledWith(1, 'a')
  })
})

describe('debounce', () => {
  it('calls the function after the delay', () => {
    vi.useFakeTimers()
    const fn = vi.fn()
    const debounced = debounce(fn, 100)
    debounced()
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(100)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('cancels previous call if invoked again within delay', () => {
    vi.useFakeTimers()
    const fn = vi.fn()
    const debounced = debounce(fn, 100)
    debounced()
    vi.advanceTimersByTime(50)
    debounced()
    vi.advanceTimersByTime(50)
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(50)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('passes the latest arguments', () => {
    vi.useFakeTimers()
    const fn = vi.fn()
    const debounced = debounce(fn, 100)
    debounced(1)
    debounced(2)
    vi.advanceTimersByTime(100)
    expect(fn).toHaveBeenCalledWith(2)
  })
})
