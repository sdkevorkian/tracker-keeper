import './App.css'

type UserAgentData = { brands: { brand: string }[] }

// Chrome and Edge both report the "Chromium" brand; Firefox and Safari have no userAgentData.
function isSupportedBrowser(): boolean {
  const { userAgentData } = navigator as Navigator & { userAgentData?: UserAgentData }
  return userAgentData?.brands.some(({ brand }) => brand === 'Chromium') ?? false
}

function App() {
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
      </main>
    </>
  )
}

export default App
