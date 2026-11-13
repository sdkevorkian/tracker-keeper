// Every acceptance case file. Each runner registers all of them against its driver.
import importCases from './import.ts'
import legendCases from './legend.ts'
import libraryCases from './library.ts'
import multiPageCases from './multiPage.ts'
import pdfStyleCases from './pdfStyles.ts'

export const cases = [importCases, multiPageCases, pdfStyleCases, legendCases, libraryCases]
