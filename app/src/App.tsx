import { useState } from 'react'
import './App.css'

type UserAgentData = { brands: { brand: string }[] }

type Theme = 'light' | 'dark'

const swatches = [
  { name: 'Heading text', token: '--text-h' },
  { name: 'Body text', token: '--text' },
  { name: 'Primary', token: '--primary' },
  { name: 'Secondary', token: '--secondary' },
  { name: 'Tertiary', token: '--tertiary' },
]

// Chrome and Edge both report the "Chromium" brand; Firefox and Safari have no userAgentData.
function isSupportedBrowser(): boolean {
  const { userAgentData } = navigator as Navigator & { userAgentData?: UserAgentData }
  return userAgentData?.brands.some(({ brand }) => brand === 'Chromium') ?? false
}

function preferredTheme(): Theme {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function App() {
  const [theme, setTheme] = useState<Theme>(preferredTheme)
  const otherTheme = theme === 'dark' ? 'light' : 'dark'

  function toggleTheme() {
    document.documentElement.dataset.theme = otherTheme
    setTheme(otherTheme)
  }

  return (
    <>
      {!isSupportedBrowser() && (
        <p role="alert" className="browser-notice">
          tracker-keeper only works in Chrome and Edge. Please use Chrome or Edge to open it.
        </p>
      )}
      <main>
        <h1>tracker-keeper</h1>
        <p>Import, verify and track cross stitch charts in the browser.</p>
        <div className="palette-header">
          <h2>Palette</h2>
          <button type="button" className="theme-toggle" onClick={toggleTheme}>
            Switch to {otherTheme} mode
          </button>
        </div>
        <ul className="swatches">
          {swatches.map(({ name, token }) => (
            <li key={token}>
              <span className="swatch-name">{name}</span>
              <span className="swatch-line" style={{ background: `var(${token})` }} />
            </li>
          ))}
        </ul>
      </main>
    </>
  )
}

export default App
