import { useEffect, useRef, useState } from 'react'
import type { Chart } from '../workspace/chart.ts'

/**
 * A button that deletes a chart once the stitcher confirms. Deletes can't be undone, so the confirmation is the safeguard.
 * As an icon, it shows a bin in place of the word, for lists where there's no room for one.
 */
export function DeleteChartButton({
  chart,
  onDelete,
  icon = false,
}: {
  chart: Chart
  onDelete: () => void
  icon?: boolean
}) {
  const [confirming, setConfirming] = useState(false)
  const title = chart.title ?? 'Untitled chart'
  return (
    <>
      <button
        type="button"
        className={icon ? 'button icon-button' : 'button'}
        aria-label={`Delete ${title}`}
        title={icon ? `Delete ${title}` : undefined}
        onClick={() => setConfirming(true)}
      >
        {icon ? <BinIcon /> : 'Delete'}
      </button>
      {confirming && (
        <ConfirmDelete
          title={title}
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false)
            onDelete()
          }}
        />
      )}
    </>
  )
}

function ConfirmDelete({ title, onCancel, onConfirm }: { title: string; onCancel: () => void; onConfirm: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    dialog.current?.showModal()
  }, [])
  return (
    <dialog ref={dialog} className="confirm-dialog" aria-labelledby="confirm-delete-heading" onCancel={onCancel}>
      <h2 id="confirm-delete-heading">Delete {title}?</h2>
      <p>Its corrections will be lost. This can't be undone.</p>
      <div className="confirm-dialog-buttons">
        <button type="button" className="button" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="button button-primary" onClick={onConfirm}>
          Delete
        </button>
      </div>
    </dialog>
  )
}

function BinIcon() {
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
      <path d="M3 6h18" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  )
}
