// Every acceptance case file. Each runner registers all of them against its driver.
import displayStyleCases from './displayStyles.ts'
import importCases from './import.ts'
import legendCases from './legend.ts'
import legendPanelCases from './legendPanel.ts'
import libraryCases from './library.ts'
import multiPageCases from './multiPage.ts'
import pdfStyleCases from './pdfStyles.ts'
import projectCases from './projects.ts'
import shortcutHelpCases from './shortcutHelp.ts'
import viewControlCases from './viewControls.ts'

export const cases = [
  importCases,
  multiPageCases,
  pdfStyleCases,
  legendCases,
  libraryCases,
  displayStyleCases,
  viewControlCases,
  projectCases,
  legendPanelCases,
  shortcutHelpCases,
]
