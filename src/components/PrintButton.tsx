"use client";

import { useEffect } from "react";
import Link from "next/link";

export function PrintButton({ projectId }: { projectId: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "p") {
        e.preventDefault();
        window.print();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <div className="no-print mx-auto flex max-w-3xl items-center justify-between gap-3 py-4">
      <Link href={`/projects/${projectId}`} className="no-underline text-sm" style={{ color: "#5a6a7a" }}>
        ← Back to editor
      </Link>
      <button
        type="button"
        onClick={() => window.print()}
        className="btn btn-primary text-sm"
      >
        Print / Save as PDF
      </button>
    </div>
  );
}
