"use client";

import { useCallback, useEffect, useRef } from "react";
import Link from "next/link";

export function PrintButton({ projectId }: { projectId: string }) {
  const printing = useRef(false);
  const printWhenReady = useCallback(async () => {
    if (printing.current) return;
    printing.current = true;
    try {
      if ("fonts" in document) await document.fonts.ready;
      await Promise.all(
        Array.from(document.images, (image) =>
          image.complete
            ? Promise.resolve()
            : new Promise<void>((resolve) => {
                image.addEventListener("load", () => resolve(), { once: true });
                image.addEventListener("error", () => resolve(), { once: true });
              }),
        ),
      );
      window.print();
    } catch {
      printing.current = false;
      window.print();
    }
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "p") {
        e.preventDefault();
        void printWhenReady();
      }
    };
    const afterPrint = () => { printing.current = false; };
    window.addEventListener("keydown", onKey);
    window.addEventListener("afterprint", afterPrint);
    if (new URLSearchParams(window.location.search).get("autoprint") === "1") {
      void printWhenReady();
    }
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("afterprint", afterPrint);
    };
  }, [printWhenReady]);
  return (
    <div className="no-print flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <Link href={`/projects/${projectId}`} className="no-underline text-sm" style={{ color: "#5a6a7a" }}>
        ← Back to editor
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs text-slate-600" lang="en">
          Turn off browser headers and footers in print settings.
        </span>
        <span className="text-xs text-slate-600" lang="ar" dir="rtl">
          أوقف ترويسات وتذييلات المتصفح من إعدادات الطباعة.
        </span>
        <button type="button" onClick={() => void printWhenReady()} className="btn btn-primary text-sm">
          Print / Save as PDF
        </button>
      </div>
    </div>
  );
}
