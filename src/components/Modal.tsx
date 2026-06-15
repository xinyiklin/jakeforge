import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

// One modal shell for every dialog / system message: a dimmed backdrop, a
// centered panel with a titled header + close button, Escape-to-close, and
// click-outside-to-close. Callers fill the body (and any footer) via children,
// using the `.modal__body` / `.modal__foot` classes for consistent spacing.
export function Modal({
  title,
  onClose,
  size = "sm",
  ariaLabel,
  children
}: {
  title: ReactNode;
  onClose: () => void;
  size?: "sm" | "lg";
  ariaLabel?: string;
  children: ReactNode;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    // Backdrop closes on click; the panel stops propagation so inner clicks don't.
    <div className="overlay" onMouseDown={onClose}>
      <div
        className={`modal modal--${size}`}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel ?? (typeof title === "string" ? title : undefined)}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal__head">
          <span>{title}</span>
          <button type="button" className="modal__close" onClick={onClose} aria-label="Close">
            <X size={16} aria-hidden="true" />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
