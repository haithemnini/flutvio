/**
 * browserUrl.ts — address bar text → URL for the browser panel.
 */

export const START = 'about:blank'

/** Address bar text → URL: localhost / hosts get a scheme, words become a search. */
export function toUrl(input: string): string {
  const t = input.trim()
  if (!t) return START
  if (/^https?:\/\//i.test(t) || t === 'about:blank') return t
  if (/^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(:\d+)?(\/.*)?$/i.test(t)) return `http://${t}`
  if (/^:\d+/.test(t)) return `http://localhost${t}`
  if (!/\s/.test(t) && /\.[a-z]{2,}(:\d+)?(\/.*)?$/i.test(t)) return `https://${t}`
  return `https://www.google.com/search?q=${encodeURIComponent(t)}`
}
