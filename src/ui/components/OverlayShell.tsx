import { useEffect, useRef, type ReactNode } from "react"
import "./OverlayShell.css"

export type OverlayShellProps = {
  open: boolean
  onClose: () => void
  ariaLabel: string
  children: ReactNode
}

export function OverlayShell({ open, onClose, ariaLabel, children }: OverlayShellProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const prevFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) {
      prevFocusRef.current?.focus()
      prevFocusRef.current = null
      return
    }

    prevFocusRef.current = document.activeElement as HTMLElement
    const origOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"

    const getFocusable = () => Array.from(
      overlayRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      ) || []
    ).filter(el => !el.hasAttribute('disabled'))

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") return onClose()
      if (e.key === "Tab") {
        const els = getFocusable()
        if (!els.length) return e.preventDefault()
        
        if (e.shiftKey && (document.activeElement === els[0] || document.activeElement === overlayRef.current)) {
          e.preventDefault()
          els[els.length - 1].focus()
        } else if (!e.shiftKey && document.activeElement === els[els.length - 1]) {
          e.preventDefault()
          els[0].focus()
        }
      }
    }

    document.addEventListener("keydown", onKeyDown)
    requestAnimationFrame(() => (getFocusable()[0] || overlayRef.current)?.focus())

    return () => {
      document.body.style.overflow = origOverflow
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [open, onClose])

  useEffect(() => {
    if (overlayRef.current) {
      if (open) overlayRef.current.removeAttribute("inert")
      else overlayRef.current.setAttribute("inert", "")
    }
  }, [open])

  return (
    <>
      <div className="overlay-shell-backdrop" data-open={open} onMouseDown={onClose} aria-hidden="true" />
      <div
        ref={overlayRef}
        className="overlay-shell-content"
        data-open={open}
        role="dialog"
        aria-hidden={!open}
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
      >
        <button className="overlay-shell-close" onClick={onClose} type="button" aria-label="Close">×</button>
        {children}
      </div>
    </>
  )
}
