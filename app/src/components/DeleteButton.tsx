import { useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * A button that deletes something once the stitcher confirms. Deletes can't be undone, so the confirmation is the safeguard.
 * When `refusal` says why it can't be deleted, the button says that instead of asking.
 * As an icon, it shows a bin in place of the word, for lists where there's no room for one.
 */
export function DeleteButton({
  name,
  label = `Delete ${name}`,
  losing,
  refusal,
  onDelete,
  icon = false,
}: {
  /** What's being deleted, as the stitcher knows it. */
  name: string
  /** The button's name, when `Delete <name>` could be mistaken for another's. */
  label?: string
  /** What goes with it, such as 'Its corrections'. */
  losing: string
  refusal?: string
  onDelete: () => void
  icon?: boolean
}) {
  const [asking, setAsking] = useState(false)
  return (
    <>
      <button
        type="button"
        className={icon ? 'button icon-button' : 'button'}
        aria-label={label}
        title={icon ? label : undefined}
        onClick={() => setAsking(true)}
      >
        {icon ? <BinIcon /> : 'Delete'}
      </button>
      {asking &&
        (refusal ? (
          <Dialog heading={`${name} can't be deleted`} onCancel={() => setAsking(false)}>
            <p>{refusal}</p>
            <div className="confirm-dialog-buttons">
              <button type="button" className="button button-primary" onClick={() => setAsking(false)}>
                OK
              </button>
            </div>
          </Dialog>
        ) : (
          <Dialog heading={`Delete ${name}?`} onCancel={() => setAsking(false)}>
            <p>{losing} will be lost. This can't be undone.</p>
            <div className="confirm-dialog-buttons">
              <button type="button" className="button" onClick={() => setAsking(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="button button-primary"
                onClick={() => {
                  setAsking(false)
                  onDelete()
                }}
              >
                Delete
              </button>
            </div>
          </Dialog>
        ))}
    </>
  )
}

function Dialog({ heading, onCancel, children }: { heading: string; onCancel: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    dialog.current?.showModal()
  }, [])
  return (
    <dialog ref={dialog} className="confirm-dialog" aria-labelledby="delete-dialog-heading" onCancel={onCancel}>
      <h2 id="delete-dialog-heading">{heading}</h2>
      {children}
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
