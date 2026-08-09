"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "aspiquiz:sound-enabled";

/** Muted by default, toggle in the header, persisted in localStorage — brief §4.6. */
export function useSoundEnabled(): [boolean, (next: boolean) => void] {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    setEnabled(stored === "true");
  }, []);

  const update = useCallback((next: boolean) => {
    setEnabled(next);
    window.localStorage.setItem(STORAGE_KEY, String(next));
  }, []);

  return [enabled, update];
}
