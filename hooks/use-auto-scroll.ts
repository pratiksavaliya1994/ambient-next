import * as React from "react"

const SPEED_PX_PER_SECOND = 30
const EDGE_PAUSE_MS = 5_000
const PAUSE_AFTER_INPUT_MS = 15_000

/**
 * Slowly scrolls `ref` to the bottom, holds, returns to the top, holds, and
 * loops — while `active` and only if the content actually overflows. The
 * dashboards turn it on in fullscreen, which is how they're shown on the wall
 * screens: nobody is there to scroll, so every card still gets its turn.
 *
 * A wheel, touch, click or key press hands control back for a while, so
 * someone reading a card isn't fought by the loop. Heights are re-read every
 * frame, so an auto-refresh that grows or shrinks the list is simply picked up.
 *
 * An effect because this drives the DOM from an animation frame loop —
 * nothing here feeds back into render.
 */
export function useAutoScroll<T extends HTMLElement>(ref: React.RefObject<T | null>, active: boolean) {
  React.useEffect(() => {
    const node = ref.current
    if (!active || !node) return

    let frame = 0
    let last = performance.now()
    let holdUntil = last + EDGE_PAUSE_MS
    // `scrollTop` rounds on some displays, so sub-pixel steps accumulate here.
    let position = node.scrollTop

    function step(now: number) {
      const elapsed = now - last
      last = now

      if (node && now >= holdUntil) {
        const max = node.scrollHeight - node.clientHeight
        if (max > 0) {
          if (position >= max) {
            position = 0
            node.scrollTo({ top: 0, behavior: "smooth" })
            holdUntil = now + EDGE_PAUSE_MS
          } else {
            position = Math.min(max, position + (SPEED_PX_PER_SECOND * elapsed) / 1000)
            node.scrollTop = position
            if (position >= max) holdUntil = now + EDGE_PAUSE_MS
          }
        }
      }

      frame = requestAnimationFrame(step)
    }

    function onInput() {
      holdUntil = performance.now() + PAUSE_AFTER_INPUT_MS
      if (node) position = node.scrollTop
    }

    const events = ["wheel", "touchstart", "pointerdown", "keydown"] as const
    for (const event of events) node.addEventListener(event, onInput, { passive: true })
    frame = requestAnimationFrame(step)

    return () => {
      cancelAnimationFrame(frame)
      for (const event of events) node.removeEventListener(event, onInput)
    }
  }, [ref, active])
}
