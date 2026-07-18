"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Autosave an in-progress form to localStorage so switching tabs or
 * navigating away never loses work. Returns a saved snapshot to restore
 * (once, on mount) and a `clear` to call after a successful submit.
 */
export function useDraftAutosave<T>(
  key: string,
  snapshot: T,
  options: { debounceMs?: number; enabled?: boolean } = {}
): { restored: T | null; clear: () => void; dismissRestored: () => void } {
  const { debounceMs = 600, enabled = true } = options;
  const [restored, setRestored] = useState<T | null>(null);
  const loadedRef = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load any saved draft once, before the first autosave overwrites it.
  useEffect(() => {
    if (!enabled || loadedRef.current) return;
    loadedRef.current = true;
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as T;
        // One-time surfacing of a restorable draft on mount.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setRestored(parsed);
      }
    } catch {
      // ignore corrupt drafts
    }
  }, [key, enabled]);

  // Debounced save on every snapshot change (after the initial load).
  useEffect(() => {
    if (!enabled || !loadedRef.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      try {
        localStorage.setItem(key, JSON.stringify(snapshot));
      } catch {
        // storage full / unavailable — non-fatal
      }
    }, debounceMs);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [key, snapshot, debounceMs, enabled]);

  const clear = useCallback(() => {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
  }, [key]);

  const dismissRestored = useCallback(() => setRestored(null), []);

  return { restored, clear, dismissRestored };
}
