/**
 * shortcuts.ts — every keyboard shortcut of the app, in one place (shown in Settings › Shortcuts).
 * The terminal's own keys are implemented in TerminalView (`terminalKey`); menu shortcuts in
 * src/main/appUi.ts. Keep this list in step with both.
 */

export interface Shortcut {
  keys: string
  label: string
  /** Extra context, shown smaller. */
  note?: string
}

export const SHORTCUT_GROUPS: Array<{ title: string; items: Shortcut[] }> = [
  {
    title: 'Terminal — editing the line',
    items: [
      { keys: '⌫ (hold)', label: 'Delete characters continuously' },
      { keys: '⌥ ⌫', label: 'Delete the previous word' },
      { keys: '⌥ ⌦', label: 'Delete the next word' },
      { keys: '⌘ ⌫', label: 'Delete the whole line' },
      { keys: '⌥ ←  /  ⌥ →', label: 'Move one word left / right' },
      { keys: '⌘ ←  /  ⌘ →', label: 'Jump to the start / end of the line' },
      { keys: '⇧ ↩', label: 'New line without sending', note: 'multi-line prompts in agents' },
      { keys: '⌃ C', label: 'Stop the running command' },
      { keys: '⌃ R', label: 'Search command history', note: 'shell feature' },
    ],
  },
  {
    title: 'Terminal — tabs and screen',
    items: [
      { keys: '⌘ T', label: 'New terminal' },
      { keys: '⇧ ⌘ F', label: 'Flutter terminal', note: 'pub get, clean, builds, app output' },
      { keys: '⌘ W', label: 'Close the current tab' },
      { keys: '⌘ D', label: 'Split the terminal', note: 'up to 4 side by side' },
      { keys: '⌃ ⇥  /  ⌃ ⇧ ⇥', label: 'Next / previous tab' },
      { keys: '⌘ 1 … ⌘ 9', label: 'Go to tab 1 … 9' },
      { keys: '⌘ K', label: 'Clear the screen' },
      { keys: '⌘ C  /  ⌘ V', label: 'Copy the selection / paste' },
      { keys: '⌘ A', label: 'Select everything in the terminal' },
      { keys: '⌘ click', label: 'Open a link' },
    ],
  },
  {
    title: 'Panels',
    items: [
      { keys: '⌘ B', label: 'Side panel (Files · Changes · Git · Sessions · Agent)' },
      { keys: '⌘ J', label: 'Side panel on Changes' },
      { keys: '⇧ ⌘ A', label: 'Agent: context, limits, MCP servers' },
      { keys: '⇧ ⌘ M', label: 'Simulator on / off' },
      { keys: '⇧ ⌘ B', label: 'Browser' },
      { keys: '⇧ ⌘ L', label: 'Flutter logs' },
      { keys: '⌘ =  /  ⌘ −  /  ⌘ 0', label: 'Interface size: larger / smaller / reset' },
    ],
  },
  {
    title: 'Flutter',
    items: [
      { keys: '⌘ R', label: 'Run' },
      { keys: '⌘ .', label: 'Stop' },
      { keys: '⌘ \\', label: 'Hot reload' },
      { keys: '⇧ ⌘ \\', label: 'Hot restart' },
      { keys: '⇧ ⌘ 5', label: 'Screenshot of the device' },
    ],
  },
  {
    title: 'Editor',
    items: [
      { keys: '⌘ S', label: 'Save', note: 'hot reloads Dart files while the app runs' },
      { keys: '⌘ W', label: 'Close the file tab' },
      { keys: '⌃ Space', label: 'Suggestions' },
      { keys: '⌘ click', label: 'Go to definition' },
      { keys: '⌘ F', label: 'Find in file' },
      { keys: '⌘ /', label: 'Toggle comment', note: 'when the editor has the keyboard' },
      { keys: 'F1', label: 'Editor command palette' },
    ],
  },
  {
    title: 'App',
    items: [
      { keys: '⌘ O', label: 'Open project' },
      { keys: '⇧ ⌘ O', label: 'Open file' },
      { keys: '⌘ ,', label: 'Settings' },
      { keys: '⌘ /', label: 'This list' },
      { keys: 'Esc', label: 'Close a dialog or menu' },
    ],
  },
]

/**
 * What a key press in the terminal sends to the shell, for the Mac editing keys a plain
 * terminal doesn't know. Returns null when the terminal should handle the key itself.
 */
export function terminalKey(e: { key: string; metaKey: boolean; altKey: boolean; ctrlKey: boolean; shiftKey: boolean }): string | null {
  const { key, metaKey: cmd, altKey: alt, ctrlKey: ctrl, shiftKey: shift } = e
  if (ctrl) return null
  if (cmd && !alt) {
    if (key === 'Backspace') return '\x15' // kill line
    if (key === 'ArrowLeft') return '\x01' // line start
    if (key === 'ArrowRight') return '\x05' // line end
    return null
  }
  if (alt && !cmd) {
    // ^W rather than ESC-DEL: it deletes a word in emacs and vi shell modes alike, and in agents' prompts.
    if (key === 'Backspace') return '\x17' // delete word back
    if (key === 'Delete') return '\x1bd' // delete word forward
    if (key === 'ArrowLeft') return '\x1bb' // word left
    if (key === 'ArrowRight') return '\x1bf' // word right
    return null
  }
  if (shift && !cmd && !alt && key === 'Enter') return '\x1b\r' // newline without submitting
  return null
}
