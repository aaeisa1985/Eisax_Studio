"use client";

import Link from "next/link";
import { useState } from "react";
import { deleteProjectAction, duplicateProjectAction, renameProjectAction } from "@/app/project-actions";
import { t, type Locale } from "@/lib/i18n";

export type ProjectCardData = {
  id: string;
  type: "presentation" | "document";
  title: string;
  updatedAt: string;
  language: string;
};

export function ProjectCard({ project, locale }: { project: ProjectCardData; locale: Locale }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(project.title);
  const tr = (k: Parameters<typeof t>[1]) => t(locale, k);

  return (
    <div className="card relative p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--turquoise)" }}>
            {project.type === "presentation" ? `▦ ${tr("presentation")}` : `📄 ${tr("document")}`}
          </p>
          {renaming ? (
            <form action={renameProjectAction} className="mt-1 flex gap-2" onSubmit={() => setRenaming(false)}>
              <input type="hidden" name="projectId" value={project.id} />
              <input
                name="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                maxLength={200}
                dir="auto"
                className="input !py-1.5"
                autoFocus
              />
              <button type="submit" className="btn btn-primary !px-3 !py-1.5 text-xs">
                {tr("save")}
              </button>
            </form>
          ) : (
            <Link
              href={`/projects/${project.id}`}
              className="mt-1 block truncate font-semibold no-underline"
              style={{ color: "var(--text)" }}
            >
              {project.title}
            </Link>
          )}
          <p className="mt-1 text-xs" style={{ color: "var(--text-dim)" }}>
            {new Date(project.updatedAt).toLocaleString(locale === "ar" ? "ar" : "en-GB", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </p>
        </div>
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={locale === "ar" ? "خيارات المشروع" : "Project options"}
          className="btn btn-ghost !px-2 !py-1 text-lg"
          onClick={() => setMenuOpen((v) => !v)}
        >
          ⋯
        </button>
      </div>
      {menuOpen && (
        <div
          role="menu"
          className="absolute end-5 top-14 z-10 min-w-40 overflow-hidden rounded-lg border shadow-xl"
          style={{ background: "var(--obsidian-2)", borderColor: "var(--border)" }}
          onMouseLeave={() => setMenuOpen(false)}
        >
          <button
            type="button"
            role="menuitem"
            className="block w-full px-4 py-2 text-start text-sm hover:bg-white/5"
            onClick={() => {
              setMenuOpen(false);
              setRenaming(true);
            }}
          >
            {tr("rename")}
          </button>
          <form action={duplicateProjectAction}>
            <input type="hidden" name="projectId" value={project.id} />
            <button type="submit" role="menuitem" className="block w-full px-4 py-2 text-start text-sm hover:bg-white/5">
              {tr("duplicate")}
            </button>
          </form>
          <form action={deleteProjectAction}>
            <input type="hidden" name="projectId" value={project.id} />
            <button
              type="submit"
              role="menuitem"
              className="block w-full px-4 py-2 text-start text-sm hover:bg-white/5"
              style={{ color: "#ff8b8b" }}
            >
              {tr("delete")}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
