// Which page the app shows, kept in the URL's hash so a reload or the back button
// keeps the stitcher where they were. A hash needs no server rewrites, which GitHub Pages lacks.
import { useSyncExternalStore } from 'react'

export type Route = { page: 'your charts' } | { page: 'chart'; chartId: string }

export const yourChartsHref = '#/'

export function chartHref(chartId: string) {
  return `#/charts/${encodeURIComponent(chartId)}`
}

function routeOf(hash: string): Route {
  const chart = /^#\/charts\/([^/]+)$/.exec(hash)
  return chart ? { page: 'chart', chartId: decodeURIComponent(chart[1]) } : { page: 'your charts' }
}

function subscribe(listener: () => void) {
  window.addEventListener('hashchange', listener)
  return () => window.removeEventListener('hashchange', listener)
}

/** The page the URL names, updated as it changes. */
export function useRoute(): Route {
  return routeOf(useSyncExternalStore(subscribe, () => window.location.hash))
}

export function goTo(href: string) {
  window.location.hash = href
}
