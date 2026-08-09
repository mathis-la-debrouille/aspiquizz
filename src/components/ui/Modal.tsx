"use client";

import { useEffect, useRef } from "react";
import type { MouseEvent, ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

/**
 * Native <dialog> — focus trap, Escape-to-close, and top-layer stacking come
 * for free instead of being hand-rolled.
 */
export function Modal({ open, onClose, title, children, footer, className }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function handleBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === ref.current) onClose();
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={onClose}
      onClick={handleBackdropClick}
      className={cn(
        "m-auto w-[min(480px,calc(100vw-2rem))] rounded-xl border border-border-hard",
        "bg-bg-raised p-0 text-ink-high shadow-[var(--shadow-lift)] backdrop:bg-bg-void/70",
        className,
      )}
    >
      {title && (
        <header className="flex items-center justify-between border-b border-border-soft px-5 py-4">
          <h2 className="font-display text-20">{title}</h2>
          <button
            type="button"
            aria-label="Fermer"
            onClick={onClose}
            className="text-ink-faint hover:text-ink-high"
          >
            <X strokeWidth={1.5} className="h-5 w-5" />
          </button>
        </header>
      )}
      <div className="px-5 py-4">{children}</div>
      {footer && (
        <footer className="flex justify-end gap-2 border-t border-border-soft px-5 py-4">
          {footer}
        </footer>
      )}
    </dialog>
  );
}
