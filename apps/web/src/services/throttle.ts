// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function throttle<T extends (...args: any[]) => void>(fn: T, limitMs: number): T {
  let lastCall = 0
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  return ((...args: unknown[]) => {
    const now = Date.now()
    const elapsed = now - lastCall

    if (elapsed >= limitMs) {
      lastCall = now
      fn(...args)
    } else if (timeoutId === null) {
      timeoutId = setTimeout(() => {
        lastCall = Date.now()
        timeoutId = null
        fn(...args)
      }, limitMs - elapsed)
    }
  }) as T
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function debounce<T extends (...args: any[]) => void>(fn: T, delayMs: number): T {
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  return ((...args: unknown[]) => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId)
    }
    timeoutId = setTimeout(() => {
      timeoutId = null
      fn(...args)
    }, delayMs)
  }) as T
}
