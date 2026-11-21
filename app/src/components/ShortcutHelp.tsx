import { useEffect, useRef } from 'react'
import { SHORTCUTS } from './shortcuts.ts'

/** The list of keyboard shortcuts, as a dialog. Focus goes back where it was when it closes. */
export function ShortcutHelp({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const opener = document.activeElement
    dialog.current?.showModal()
    return () => {
      if (opener instanceof HTMLElement) opener.focus()
    }
  }, [])
  return (
    <dialog
      ref={dialog}
      className="confirm-dialog shortcut-help"
      aria-labelledby="shortcut-help-heading"
      onCancel={(event) => {
        // Closed by React, so focus goes back through the effect's cleanup.
        event.preventDefault()
        onClose()
      }}
    >
      <h2 id="shortcut-help-heading">Keyboard shortcuts</h2>
      {SHORTCUTS.map(({ where, shortcuts }) => (
        <section key={where}>
          <h3>{where}</h3>
          <dl>
            {shortcuts.map(({ keys, does }) => (
              <div key={does} className="shortcut">
                <dt>
                  {keys.map((key, i) => (
                    <span key={key}>
                      {i > 0 && ' or '}
                      <kbd>{key}</kbd>
                    </span>
                  ))}
                </dt>
                <dd>{does}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
      <div className="confirm-dialog-buttons">
        <button type="button" className="button" onClick={onClose}>
          Close
        </button>
      </div>
    </dialog>
  )
}
