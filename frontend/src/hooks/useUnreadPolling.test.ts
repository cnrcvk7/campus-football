import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Tests for the unread announcements polling logic.
 *
 * The actual implementation lives in UnreadAnnouncementsContext.tsx as a React
 * context.  Here we test the core timing and visibility-pause behavior using
 * the same patterns (fake timers, event simulation) in a plain Node environment.
 */

// Simulate the core polling logic extracted from the context
function createPoller(fetchFn: () => void, interval: number) {
  let timerId: ReturnType<typeof setInterval> | null = null
  let hidden = false

  function start() {
    fetchFn()
    timerId = setInterval(fetchFn, interval)
  }

  function stop() {
    if (timerId) {
      clearInterval(timerId)
      timerId = null
    }
  }

  function onVisibilityChange(isHidden: boolean) {
    hidden = isHidden
    if (hidden) {
      stop()
    } else {
      fetchFn()
      timerId = setInterval(fetchFn, interval)
    }
  }

  function onFocus() {
    fetchFn()
  }

  function cleanup() {
    stop()
  }

  return { start, stop, onVisibilityChange, onFocus, cleanup }
}

describe('Unread announcements polling', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('fetches immediately on start', () => {
    const fetch = vi.fn()
    const poller = createPoller(fetch, 60_000)
    poller.start()
    expect(fetch).toHaveBeenCalledTimes(1)
    poller.cleanup()
  })

  it('fetches every 60 seconds', () => {
    const fetch = vi.fn()
    const poller = createPoller(fetch, 60_000)
    poller.start()
    expect(fetch).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(60_000)
    expect(fetch).toHaveBeenCalledTimes(2)

    vi.advanceTimersByTime(60_000)
    expect(fetch).toHaveBeenCalledTimes(3)

    poller.cleanup()
  })

  it('pauses when document becomes hidden', () => {
    const fetch = vi.fn()
    const poller = createPoller(fetch, 60_000)
    poller.start()
    expect(fetch).toHaveBeenCalledTimes(1)

    // Hide
    poller.onVisibilityChange(true)

    // Advance time — should NOT fetch
    vi.advanceTimersByTime(120_000)
    expect(fetch).toHaveBeenCalledTimes(1)

    poller.cleanup()
  })

  it('resumes and fetches immediately when becoming visible', () => {
    const fetch = vi.fn()
    const poller = createPoller(fetch, 60_000)
    poller.start()

    poller.onVisibilityChange(true)  // hide
    vi.advanceTimersByTime(120_000)
    expect(fetch).toHaveBeenCalledTimes(1)

    poller.onVisibilityChange(false) // show
    expect(fetch).toHaveBeenCalledTimes(2) // immediate fetch on resume

    // Polling continues
    vi.advanceTimersByTime(60_000)
    expect(fetch).toHaveBeenCalledTimes(3)

    poller.cleanup()
  })

  it('fetches on focus', () => {
    const fetch = vi.fn()
    const poller = createPoller(fetch, 60_000)
    poller.start()
    expect(fetch).toHaveBeenCalledTimes(1)

    poller.onFocus()
    expect(fetch).toHaveBeenCalledTimes(2)

    poller.cleanup()
  })

  it('stops polling on cleanup', () => {
    const fetch = vi.fn()
    const poller = createPoller(fetch, 60_000)
    poller.start()
    poller.cleanup()

    vi.advanceTimersByTime(120_000)
    expect(fetch).toHaveBeenCalledTimes(1) // only the initial fetch
  })
})
