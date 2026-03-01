import { useRef, useCallback, useEffect } from "react"
import type React from "react"
import "./ColumnResizeHandle.css"

type ColumnResizeHandleProps = {
  onResize: (deltaFraction: number) => void
  columnIndex: number
  style?: React.CSSProperties
}

/**
 * Thin vertical drag handle positioned between grid columns.
 * Tracks mouse movement during drag via refs to avoid re-renders,
 * then reports the cumulative delta as a fraction of container width.
 */
export function ColumnResizeHandle({ onResize, columnIndex, style }: ColumnResizeHandleProps) {
  const draggingRef = useRef(false)
  const startXRef = useRef(0)
  const containerWidthRef = useRef(0)
  const handleRef = useRef<HTMLDivElement>(null)

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()

      draggingRef.current = true
      startXRef.current = e.clientX

      const stack = handleRef.current?.closest(".project-stack")
      containerWidthRef.current = stack ? stack.getBoundingClientRect().width : window.innerWidth

      document.body.style.cursor = "col-resize"
      document.body.style.userSelect = "none"

      handleRef.current?.classList.add("column-resize-handle--dragging")
    },
    [],
  )

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!draggingRef.current) return
      e.preventDefault()
    }

    const onMouseUp = (e: MouseEvent) => {
      if (!draggingRef.current) return
      draggingRef.current = false

      document.body.style.cursor = ""
      document.body.style.userSelect = ""

      handleRef.current?.classList.remove("column-resize-handle--dragging")

      const deltaPixels = e.clientX - startXRef.current
      if (containerWidthRef.current > 0 && deltaPixels !== 0) {
        const deltaFraction = deltaPixels / containerWidthRef.current
        onResize(deltaFraction)
      }
    }

    document.addEventListener("mousemove", onMouseMove)
    document.addEventListener("mouseup", onMouseUp)

    return () => {
      document.removeEventListener("mousemove", onMouseMove)
      document.removeEventListener("mouseup", onMouseUp)
    }
  }, [onResize])

  return (
    <div
      ref={handleRef}
      className="column-resize-handle"
      style={style}
      data-column-index={columnIndex}
      onMouseDown={onMouseDown}
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize column ${columnIndex + 1}`}
    />
  )
}
