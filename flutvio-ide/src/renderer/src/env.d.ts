/// <reference types="vite/client" />
import type { FlutvioAPI } from '../../shared/flutvio-api'

/** The parts of Electron's <webview> element the browser panel uses. */
export interface WebviewElement extends HTMLElement {
  src: string
  loadURL: (url: string) => Promise<void>
  getURL: () => string
  getTitle: () => string
  goBack: () => void
  goForward: () => void
  canGoBack: () => boolean
  canGoForward: () => boolean
  reload: () => void
  stop: () => void
  isLoading: () => boolean
  openDevTools: () => void
  closeDevTools: () => void
  isDevToolsOpened: () => boolean
  setUserAgent: (ua: string) => void
}

declare global {
  interface Window {
    flutvio: FlutvioAPI
  }
  namespace React.JSX {
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<React.HTMLAttributes<WebviewElement>, WebviewElement> & {
        src?: string
        partition?: string
        useragent?: string
      }
    }
  }
}

export {}
