import type { AcceptanceTest } from '../dsl/acceptanceTest.ts'

export default function shortcutHelpCases(test: AcceptanceTest) {
  test(
    '? opens the list of keyboard shortcuts, with the chart view’s, and Escape closes it',
    { needs: ['import', 'shortcut help'] },
    async ({ stitcher }) => {
      await stitcher.importsChart({ grid: ['#^'] })

      await stitcher.opensShortcutHelp('keyboard')

      await stitcher.seesShortcutsFor([
        'Zoom in',
        'Zoom out',
        'Fit the whole chart',
        'Pan a few stitches (outside a project)',
      ])
      await stitcher.closesShortcutHelp()
      await stitcher.seesNoShortcutHelp()
    },
  )

  test(
    'the shortcut help lists the keys for marking stitches and undoing',
    { needs: ['import', 'shortcut help'] },
    async ({ stitcher }) => {
      await stitcher.importsChart({ grid: ['#^'] })

      await stitcher.opensShortcutHelp('keyboard')

      await stitcher.seesShortcutsFor([
        'Move the cell cursor',
        'Mark the stitch under the cursor done or not done',
        'Mark stitches done as the cursor moves',
        'Undo the last mark',
        'Redo',
        'Clear the highlighted legend entry',
      ])
    },
  )

  test(
    '? typed into a text field is typed, and doesn’t open the shortcut help',
    { needs: ['import', 'projects', 'shortcut help'] },
    async ({ stitcher }) => {
      await stitcher.importsChart({ grid: ['#^'] })
      await stitcher.startsProject()
      await stitcher.focusesProjectName()

      await stitcher.pressesKey('?')

      await stitcher.seesNoShortcutHelp()
    },
  )

  test(
    'the Keyboard shortcuts button opens the help, and closing it puts focus back on the button',
    { needs: ['shortcut help'] },
    async ({ stitcher }) => {
      await stitcher.opensShortcutHelp('button')
      await stitcher.seesShortcutsFor(['Show keyboard shortcuts'])

      await stitcher.closesShortcutHelp()

      await stitcher.seesFocusBackOnTheShortcutsButton()
    },
  )
}
