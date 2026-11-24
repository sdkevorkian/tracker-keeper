import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { Chart } from '../workspace/chart.ts'

/**
 * A button that asks for a chart's new title. `onRename` throws when the title is refused,
 * and the dialog stays open showing why, with the chart's title unchanged.
 * As an icon, it shows a pencil in place of the word, for lists where there's no room for one.
 */
export function RenameChartButton({
  chart,
  onRename,
  icon = false,
}: {
  chart: Chart
  onRename: (title: string) => void
  icon?: boolean
}) {
  const [renaming, setRenaming] = useState(false)
  const title = chart.title ?? 'Untitled chart'
  return (
    <>
      <button
        type="button"
        className={icon ? 'button icon-button' : 'button'}
        aria-label={`Rename ${title}`}
        title={icon ? `Rename ${title}` : undefined}
        onClick={() => setRenaming(true)}
      >
        {icon ? <PencilIcon /> : 'Rename'}
      </button>
      {renaming && (
        <RenameDialog
          title={title}
          current={chart.title ?? ''}
          onCancel={() => setRenaming(false)}
          onRename={(newTitle) => {
            onRename(newTitle)
            setRenaming(false)
          }}
        />
      )}
    </>
  )
}

function RenameDialog({
  title,
  current,
  onCancel,
  onRename,
}: {
  title: string
  current: string
  onCancel: () => void
  onRename: (title: string) => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [newTitle, setNewTitle] = useState(current)
  const [refusal, setRefusal] = useState<string>()
  useEffect(() => {
    dialog.current?.showModal()
  }, [])

  function save(event: FormEvent) {
    event.preventDefault()
    try {
      onRename(newTitle)
    } catch (refused) {
      setRefusal(refused instanceof Error ? refused.message : String(refused))
    }
  }

  return (
    <dialog ref={dialog} className="confirm-dialog" aria-labelledby="rename-chart-heading" onCancel={onCancel}>
      <h2 id="rename-chart-heading">Rename {title}</h2>
      <form onSubmit={save}>
        <label className="dialog-field">
          Title
          <input type="text" value={newTitle} onChange={(event) => setNewTitle(event.target.value)} autoFocus />
        </label>
        {refusal && (
          <p role="alert" className="import-error">
            {refusal}
          </p>
        )}
        <div className="confirm-dialog-buttons">
          <button type="button" className="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="button button-primary">
            Save
          </button>
        </div>
      </form>
    </dialog>
  )
}

function PencilIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      <path d="m15 5 4 4" />
    </svg>
  )
}
