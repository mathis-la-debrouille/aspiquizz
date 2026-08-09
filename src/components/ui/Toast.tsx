"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, Info, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export type ToastTone = "neutral" | "success" | "error" | "info";

interface ToastItem {
  id: string;
  message: string;
  tone: ToastTone;
}

interface ToastContextValue {
  push: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TONE_ICON: Record<ToastTone, typeof Info> = {
  neutral: Info,
  success: CheckCircle2,
  error: TriangleAlert,
  info: Info,
};

const TONE_CLASS: Record<ToastTone, string> = {
  neutral: "border-border-hard text-ink-high",
  success: "border-moss-deep text-moss-glow",
  error: "border-clay-deep text-clay-soft",
  info: "border-gold-deep text-gold-soft",
};

const DEFAULT_DURATION_MS = 4000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [mounted, setMounted] = useState(false);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (message: string, tone: ToastTone = "neutral") => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setToasts((prev) => [...prev, { id, message, tone }]);
      setTimeout(() => dismiss(id), DEFAULT_DURATION_MS);
    },
    [dismiss],
  );

  useEffect(() => setMounted(true), []);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {mounted &&
        createPortal(
          <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[9999] flex flex-col items-center gap-2 px-4 sm:items-end sm:pr-6">
            {toasts.map((t) => {
              const Icon = TONE_ICON[t.tone];
              return (
                <div
                  key={t.id}
                  role="status"
                  className={cn(
                    "pointer-events-auto flex w-full max-w-sm items-center gap-2 rounded-md border bg-bg-raised px-4 py-3 text-14 shadow-[var(--shadow-2)]",
                    TONE_CLASS[t.tone],
                  )}
                >
                  <Icon aria-hidden="true" strokeWidth={1.5} className="h-4 w-4 shrink-0" />
                  <span className="flex-1">{t.message}</span>
                  <button
                    type="button"
                    aria-label="Fermer"
                    onClick={() => dismiss(t.id)}
                    className="text-ink-faint hover:text-ink-high"
                  >
                    <X strokeWidth={1.5} className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}
