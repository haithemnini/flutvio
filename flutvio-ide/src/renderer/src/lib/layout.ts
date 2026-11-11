/**
 * layout.ts — which panes of the workspace are showing (remembered between launches).
 */

import type { PanelTab } from '../components/SidePanel'

export interface Layout {
  /** Right column (simulator or browser). */
  simulator: boolean
  right: 'simulator' | 'browser'
  /** Side panel: Files · Changes · Git · Sessions. */
  panel: boolean
  panelTab: PanelTab
  /** Centre tab: a terminal id, or 'editor'. */
  center: string
  /** Flutter output drawer under the simulator. */
  logs: boolean
}

export const DEFAULT_LAYOUT: Layout = { simulator: false, right: 'simulator', panel: false, panelTab: 'files', center: 'main', logs: false }
