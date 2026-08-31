"use client"

import * as React from "react"

type Theme = "light" | "dark" | "system"
type ResolvedTheme = "light" | "dark"

const STORAGE_KEY = "theme"
const DARK_QUERY = "(prefers-color-scheme: dark)"

/**
 * Runs from `<body>`'s first child, before anything below it is parsed, so the
 * class is on `<html>` ahead of the first paint.
 *
 * It is injected as raw HTML inside a wrapper `div` rather than rendered as a
 * React `<script>` element on purpose. React never executes a script it builds
 * on the client, and logs "Encountered a script tag while rendering React
 * component" whenever it has to build one — which is what `next-themes` tripped
 * over, since its provider rendered exactly such an element. Parsed straight out
 * of the HTML stream the browser runs this normally, and React only ever sees
 * the inert `div`.
 *
 * Keep in step with `readTheme` / `applyTheme` below: both sides read the same
 * storage key and write the same class, and a mismatch shows up as a flash.
 */
const THEME_INIT_SCRIPT = `(function(){try{var r=document.documentElement,s=localStorage.getItem("${STORAGE_KEY}"),t=s==="light"||s==="dark"?s:window.matchMedia("${DARK_QUERY}").matches?"dark":"light";r.classList.remove("light","dark");r.classList.add(t);r.style.colorScheme=t}catch(e){}})()`

function ThemeScript() {
  return (
    <div
      hidden
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: `<script>${THEME_INIT_SCRIPT}</script>` }}
    />
  )
}

function readTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === "light" || stored === "dark" || stored === "system") {
      return stored
    }
  } catch {
    // Storage is unreachable in private mode and behind some cookie blockers;
    // following the OS is the right thing to do when we can't remember a choice.
  }

  return "system"
}

function systemTheme(): ResolvedTheme {
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light"
}

/**
 * Transitions are suppressed across the swap so a theme change is instant rather
 * than every colour on the page animating independently.
 */
function applyTheme(resolved: ResolvedTheme) {
  const style = document.createElement("style")
  style.appendChild(
    document.createTextNode("*,*::before,*::after{transition:none !important}")
  )
  document.head.appendChild(style)

  const root = document.documentElement
  root.classList.remove("light", "dark")
  root.classList.add(resolved)
  root.style.colorScheme = resolved

  // Forcing a reflow commits the new colours while transitions are still off;
  // without it the style removal can win the race and the page animates anyway.
  window.getComputedStyle(document.body)
  setTimeout(() => style.remove(), 1)
}

/**
 * The theme lives outside React — the pre-paint script above already wrote it to
 * the DOM, and `storage` events from other tabs can change it. `useSyncExternal-
 * Store` reads it rather than an effect mirroring it into state, the same shape
 * `useIsMobile` uses.
 *
 * The snapshot is a `"<choice>:<system>"` string so it compares by value; React
 * would loop forever on a fresh object.
 */
const listeners = new Set<() => void>()
let snapshot: string | null = null

function getSnapshot() {
  snapshot ??= `${readTheme()}:${systemTheme()}`
  return snapshot
}

function getServerSnapshot() {
  return "system:light"
}

function emit() {
  snapshot = null
  for (const listener of listeners) {
    listener()
  }
}

function subscribe(onStoreChange: () => void) {
  const media = window.matchMedia(DARK_QUERY)
  const onExternalChange = () => {
    // The OS preference or another tab moved: the DOM has to follow, and this
    // handler is the only place that learns about it.
    const next = readTheme()
    applyTheme(next === "system" ? systemTheme() : next)
    emit()
  }

  listeners.add(onStoreChange)
  media.addEventListener("change", onExternalChange)
  window.addEventListener("storage", onExternalChange)

  return () => {
    listeners.delete(onStoreChange)
    media.removeEventListener("change", onExternalChange)
    window.removeEventListener("storage", onExternalChange)
  }
}

function setTheme(theme: Theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // Same as `readTheme`: the choice just doesn't survive a reload.
  }

  applyTheme(theme === "system" ? systemTheme() : theme)
  emit()
}

type ThemeContextValue = {
  theme: Theme
  resolvedTheme: ResolvedTheme
  setTheme: (theme: Theme) => void
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null)

function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, system] = React.useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot
  ).split(":") as [Theme, ResolvedTheme]

  const value = React.useMemo<ThemeContextValue>(
    () => ({ theme, resolvedTheme: theme === "system" ? system : theme, setTheme }),
    [theme, system]
  )

  return (
    <ThemeContext.Provider value={value}>
      <ThemeScript />
      <ThemeHotkey />
      {children}
    </ThemeContext.Provider>
  )
}

function useTheme() {
  const context = React.useContext(ThemeContext)

  if (!context) {
    throw new Error("useTheme must be used inside <ThemeProvider>")
  }

  return context
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  )
}

function ThemeHotkey() {
  const { resolvedTheme, setTheme } = useTheme()

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.repeat) {
        return
      }

      if (event.metaKey || event.ctrlKey || event.altKey) {
        return
      }

      if (event?.key?.toLowerCase() !== "d") {
        return
      }

      if (isTypingTarget(event.target)) {
        return
      }

      setTheme(resolvedTheme === "dark" ? "light" : "dark")
    }

    window.addEventListener("keydown", onKeyDown)

    return () => {
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [resolvedTheme, setTheme])

  return null
}

export { ThemeProvider, useTheme }
