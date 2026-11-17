"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { saveProjectAction } from "@/app/project-actions";

/** One writer per editor. An explicit flush also drains edits made during a save. */
export function useProjectSave(projectId: string, payload: { title: string; language: string; content: unknown }, initialUpdatedAt?: string) {
  const serialized = JSON.stringify(payload);
  const latest = useRef(serialized);
  latest.current = serialized;
  const persisted = useRef(serialized);
  const running = useRef<Promise<boolean> | null>(null);
  const version = useRef(initialUpdatedAt);
  const draftKey = `eisax-draft-v1:${projectId}`;
  const [recovery, setRecovery] = useState<typeof payload | null>(null);
  const [checked, setChecked] = useState(false);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const recoveryPending = useRef(false);
  useEffect(() => {
    try {
      const stored = localStorage.getItem(draftKey);
      if (stored && stored !== latest.current) {
        const candidate = JSON.parse(stored);
        if (typeof candidate.title === "string" && typeof candidate.language === "string" && candidate.content) {
          recoveryPending.current = true;
          setRecovery(candidate);
        }
      }
    } catch { /* A blocked/full browser store must not prevent editing. */ }
    setChecked(true);
  }, [draftKey]);

  const flush = useCallback((): Promise<boolean> => {
    if (recoveryPending.current) return Promise.resolve(false);
    if (running.current) return running.current;
    const work = async () => {
      try {
        while (latest.current !== persisted.current) {
          setState("saving");
          const snapshot = latest.current;
          const result = await saveProjectAction(projectId, JSON.parse(snapshot), version.current);
          if (!result.ok) throw new Error(result.error ?? "save_failed");
          persisted.current = snapshot;
          version.current = result.updatedAt ?? version.current;
          try { if (localStorage.getItem(draftKey) === snapshot) localStorage.removeItem(draftKey); } catch {}
        }
        setError(null);
        setState("saved");
        return true;
      } catch (e) {
        setState("error");
        setError(e instanceof Error ? e.message : "save_failed");
        return false;
      }
    };
    running.current = work().finally(() => { running.current = null; });
    return running.current;
  }, [projectId, draftKey]);

  useEffect(() => {
    if (!checked || recoveryPending.current) return;
    if (serialized === persisted.current) {
      if (!running.current) {
        setError(null);
        setState("saved");
      }
      return;
    }
    setState("saving");
    try { localStorage.setItem(draftKey, serialized); } catch { setError("draft_storage_unavailable"); }
    const timer = setTimeout(() => { void flush(); }, 800);
    return () => clearTimeout(timer);
  }, [serialized, flush, checked, draftKey, recovery]);

  const resolveRecovery = useCallback(() => {
    recoveryPending.current = false;
    setRecovery(null);
    try { localStorage.removeItem(draftKey); } catch {}
  }, [draftKey]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      // An in-flight snapshot can still change the server even if the user has
      // since edited the document back to its last persisted value.
      if (latest.current === persisted.current && !running.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
    };
  }, [flush]);
  return { state, error, flush, recovery, resolveRecovery };
}
