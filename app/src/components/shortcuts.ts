// Every keyboard shortcut, listed in one place, so the shortcut help stays in step
// with the keys the app handles. A ticket that adds a shortcut adds it here.

export interface Shortcut {
  /** Each key or key combination that does it, as the help shows it. */
  keys: string[]
  does: string
}

export interface ShortcutGroup {
  /** Where the shortcuts work. */
  where: string
  shortcuts: Shortcut[]
}

export const SHORTCUTS: ShortcutGroup[] = [
  {
    where: 'Anywhere',
    shortcuts: [{ keys: ['?'], does: 'Show keyboard shortcuts' }],
  },
  {
    where: 'Chart view',
    shortcuts: [
      { keys: ['+', '='], does: 'Zoom in' },
      { keys: ['-'], does: 'Zoom out' },
      { keys: ['0'], does: 'Fit the whole chart' },
      { keys: ['Arrow keys'], does: 'Pan a few stitches (outside a project)' },
      { keys: ['Shift + arrow keys'], does: 'Pan a screen (outside a project)' },
    ],
  },
  {
    where: 'Chart view, in a project',
    shortcuts: [
      { keys: ['Arrow keys'], does: 'Move the cell cursor' },
      { keys: ['Space', 'Enter'], does: 'Mark the stitch under the cursor done or not done' },
      { keys: ['Shift + arrow keys'], does: 'Mark stitches done as the cursor moves' },
    ],
  },
  {
    where: 'In a project',
    shortcuts: [
      { keys: ['Ctrl + Z'], does: 'Undo the last mark' },
      { keys: ['Ctrl + Shift + Z', 'Ctrl + Y'], does: 'Redo' },
    ],
  },
]

/** Whether keys pressed in `target` are typing, which app shortcuts must leave alone. */
export function isTextField(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)
    return true
  if (!(target instanceof HTMLInputElement)) return false
  return !['button', 'checkbox', 'radio', 'range', 'color', 'file', 'submit', 'reset'].includes(target.type)
}
