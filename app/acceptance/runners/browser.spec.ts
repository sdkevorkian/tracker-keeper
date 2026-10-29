// Runs the acceptance cases against the built app in Chromium, under Playwright Test.
import { cases } from '../cases/index.ts'
import { playwrightAcceptanceTest } from './playwright.ts'

for (const register of cases) register(playwrightAcceptanceTest)
