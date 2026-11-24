import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { Chart } from '../workspace/chart.ts'

/**
 * Says a PDF has been imported before and names the charts that came from it. The stitcher can open one,
 * import a separate copy under titles of their own (filled in with `suggestedTitles`), or cancel.
 * `onCopy` rejects when the titles are refused, and the dialog stays open showing why.
 */
export function ImportedBeforeDialog({
  charts,
  suggestedTitles,
  onOpen,
  onCopy,
  onCancel,
}: {
  charts: Chart[]
  suggestedTitles: string[]
  onOpen: (chartId: string) => void
  onCopy: (titles: string[]) => Promise<void>
  onCancel: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [titles, setTitles] = useState(suggestedTitles)
  const [copying, setCopying] = useState(false)
  const [refusal, setRefusal] = useState<string>()
  useEffect(() => {
    dialog.current?.showModal()
  }, [])

  async function copy(event: FormEvent) {
    event.preventDefault()
    setRefusal(undefined)
    setCopying(true)
    try {
      await onCopy(titles)
    } catch (refused) {
      setRefusal(refused instanceof Error ? refused.message : String(refused))
    } finally {
      setCopying(false)
    }
  }

  return (
    <dialog ref={dialog} className="confirm-dialog" aria-labelledby="imported-before-heading" onCancel={onCancel}>
      <h2 id="imported-before-heading">This PDF has been imported before</h2>
      <p>{charts.length === 1 ? 'This chart came from it:' : 'These charts came from it:'}</p>
      <ul className="imported-before-charts">
        {charts.map((chart) => (
          <li key={chart.id}>
            <button type="button" className="button" onClick={() => onOpen(chart.id)}>
              Open {chart.title ?? 'Untitled chart'}
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={copy}>
        <h3>Or import a separate copy</h3>
        {charts.map((chart, i) => (
          <label key={chart.id} className="dialog-field">
            {charts.length === 1 ? 'Title' : `Title for the copy of ${chart.title ?? 'Untitled chart'}`}
            <input type="text" value={titles[i]} onChange={(event) => setTitles(titles.with(i, event.target.value))} />
          </label>
        ))}
        {refusal && (
          <p role="alert" className="import-error">
            {refusal}
          </p>
        )}
        <div className="confirm-dialog-buttons">
          <button type="button" className="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="button button-primary" disabled={copying}>
            Import a separate copy
          </button>
        </div>
      </form>
    </dialog>
  )
}
