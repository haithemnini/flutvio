/**
 * BrowserPanel.tsx — a small web browser beside the code (Flutter web, localhost, docs).
 *
 * Uses Electron's <webview> (separate process, sandboxed, no Node; see will-attach-webview in
 * src/main/index.ts). Pages that open new windows go to the default browser.
 */

import React, { useEffect, useRef, useState } from 'react'
import type { WebviewElement } from '../../env'
import { usePersisted } from '../../lib/usePersisted'
import { START, toUrl } from '../../lib/browserUrl'
import { ArrowLeftIcon, ArrowRightIcon, CodeIcon, ExternalIcon, GlobeIcon, PhoneIcon, RefreshIcon, SpinnerIcon, XIcon } from '../Icons'

const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'

const QUICK = [
  { label: 'Flutter docs', url: 'https://docs.flutter.dev' },
  { label: 'pub.dev', url: 'https://pub.dev' },
  { label: 'Dart API', url: 'https://api.dart.dev' },
  { label: 'Flutter API', url: 'https://api.flutter.dev' },
]


export default function BrowserPanel({ leading }: { leading?: React.ReactNode }): React.JSX.Element {
  const [lastUrl, setLastUrl] = usePersisted('flutvio.browser.url', START)
  const [mobile, setMobile] = usePersisted('flutvio.browser.mobile', false)
  const [address, setAddress] = useState(lastUrl === START ? '' : lastUrl)
  const [url, setUrl] = useState(lastUrl)
  const [loading, setLoading] = useState(false)
  const [nav, setNav] = useState({ back: false, forward: false })
  const [error, setError] = useState<string | null>(null)
  const viewRef = useRef<WebviewElement | null>(null)
  const ready = useRef(false)
  const editing = useRef(false)
  const addressRef = useRef<HTMLInputElement>(null)
  const [isReady, setReady] = useState(false)

  // Wire webview events once.
  useEffect(() => {
    const v = viewRef.current
    if (!v) return
    const sync = (): void => {
      if (!ready.current) return
      const u = v.getURL()
      setUrl(u)
      if (!editing.current) setAddress(u === START ? '' : u)
      setLastUrl(u)
      setNav({ back: v.canGoBack(), forward: v.canGoForward() })
    }
    const onReady = (): void => {
      // While the user is typing an address, the page must not take the keyboard focus.
      if (editing.current) requestAnimationFrame(() => addressRef.current?.focus())
      if (!ready.current) setReady(true)
      ready.current = true
      if (mobile) v.setUserAgent(MOBILE_UA)
      sync()
    }
    const onStart = (): void => {
      setLoading(true)
      setError(null)
    }
    const onStop = (): void => {
      setLoading(false)
      sync()
    }
    const onFail = (e: Event): void => {
      const ev = e as Event & { errorCode: number; errorDescription: string; validatedURL: string; isMainFrame: boolean }
      if (ev.isMainFrame && ev.errorCode !== -3) setError(`${ev.errorDescription || 'Could not load the page'} — ${ev.validatedURL}`)
    }
    v.addEventListener('dom-ready', onReady)
    v.addEventListener('did-start-loading', onStart)
    v.addEventListener('did-stop-loading', onStop)
    v.addEventListener('did-navigate', sync)
    v.addEventListener('did-navigate-in-page', sync)
    v.addEventListener('did-fail-load', onFail)
    return () => {
      v.removeEventListener('dom-ready', onReady)
      v.removeEventListener('did-start-loading', onStart)
      v.removeEventListener('did-stop-loading', onStop)
      v.removeEventListener('did-navigate', sync)
      v.removeEventListener('did-navigate-in-page', sync)
      v.removeEventListener('did-fail-load', onFail)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const go = (input: string): void => {
    const next = toUrl(input)
    setError(null)
    editing.current = false
    setAddress(next === START ? '' : next)
    void viewRef.current?.loadURL(next).catch(() => undefined)
  }

  const toggleMobile = (): void => {
    const v = viewRef.current
    const next = !mobile
    setMobile(next)
    if (v && ready.current) {
      v.setUserAgent(next ? MOBILE_UA : navigator.userAgent.replace(/Electron\/\S+\s?/, ''))
      v.reload()
    }
  }

  const blank = url === START

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface-1" data-testid="browser" data-ready={isReady ? '1' : undefined}>
      {/* Toolbar */}
      <div className="flex h-9 flex-shrink-0 items-center gap-0.5 pl-2 pr-1.5">
        {leading}
        <button className="icon-btn" disabled={!nav.back} onClick={() => viewRef.current?.goBack()} aria-label="Back">
          <ArrowLeftIcon size={13} />
        </button>
        <button className="icon-btn" disabled={!nav.forward} onClick={() => viewRef.current?.goForward()} aria-label="Forward">
          <ArrowRightIcon size={13} />
        </button>
        <button
          className="icon-btn"
          onClick={() => (loading ? viewRef.current?.stop() : viewRef.current?.reload())}
          aria-label={loading ? 'Stop' : 'Reload'}
          disabled={blank}
        >
          {loading ? <XIcon size={12} /> : <RefreshIcon size={12} />}
        </button>
        <form
          className="mx-1 flex h-6 min-w-0 flex-1 items-center gap-1.5 rounded-md bg-surface-4/60 px-2"
          onSubmit={(e) => {
            e.preventDefault()
            go(address)
          }}
        >
          {loading ? <SpinnerIcon size={10} className="flex-shrink-0 text-text-tertiary" /> : <GlobeIcon size={11} className="flex-shrink-0 text-text-tertiary" />}
          <input
            ref={addressRef}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            onFocus={(e) => {
              editing.current = true
              e.currentTarget.select()
            }}
            onBlur={() => (editing.current = false)}
            onKeyDown={(e) => e.key === 'Escape' && (e.currentTarget.blur(), setAddress(blank ? '' : url))}
            placeholder="Search or enter address (localhost:8080)"
            spellCheck={false}
            data-testid="browser-address"
            className="min-w-0 flex-1 bg-transparent text-2xs text-text-primary outline-none placeholder:text-text-tertiary"
          />
        </form>
        <button className="icon-btn" aria-pressed={mobile} onClick={toggleMobile} data-tip="Phone width">
          <PhoneIcon size={13} />
        </button>
        <button
          className="icon-btn"
          disabled={blank}
          onClick={() => {
            const v = viewRef.current
            if (!v) return
            if (v.isDevToolsOpened()) v.closeDevTools()
            else v.openDevTools()
          }}
          data-tip="Page dev tools"
        >
          <CodeIcon size={13} />
        </button>
        <button className="icon-btn" disabled={blank} onClick={() => window.open(url)} data-tip="Open in browser">
          <ExternalIcon size={12} />
        </button>
      </div>

      {/* Page */}
      <div className="relative min-h-0 flex-1">
        <div className={`absolute inset-0 flex justify-center ${mobile ? 'py-3' : ''}`}>
          <div
            className={`h-full overflow-hidden bg-white ${mobile ? 'rounded-[18px] border border-border-default' : 'w-full'}`}
            style={mobile ? { width: 390, maxWidth: '100%' } : undefined}
          >
            <webview ref={viewRef} src={lastUrl} partition="persist:flutvio-browser" className="h-full w-full" />
          </div>
        </div>

        {blank && !loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-surface-1 px-8 text-center">
            <GlobeIcon size={22} className="text-text-tertiary" />
            <p className="mt-3 text-xs text-text-secondary">Open a page beside your code</p>
            <p className="mt-1 text-2xs text-text-tertiary">Flutter web (localhost), docs, or anything else.</p>
            <div className="mt-5 flex flex-wrap justify-center gap-1.5">
              {QUICK.map((q) => (
                <button key={q.url} onClick={() => go(q.url)} className="h-6 rounded-md border border-border-default px-2.5 text-2xs text-text-secondary hover:bg-surface-4">
                  {q.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="absolute inset-x-3 top-2 z-10 flex items-start gap-2 rounded-md border border-border-default bg-surface-3 px-2.5 py-1.5 text-2xs text-accent-red shadow-pop">
            <span className="flex-1 break-words">{error}</span>
            <button onClick={() => setError(null)} aria-label="Dismiss" className="text-text-tertiary hover:text-text-primary">
              <XIcon size={11} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
