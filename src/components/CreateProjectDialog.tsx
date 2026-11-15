"use client";

import { useState } from "react";
import { createProjectAction } from "@/app/project-actions";
import { t, type Locale } from "@/lib/i18n";

export function CreateProjectDialog({ locale }: { locale: Locale }) {
  const [open, setOpen] = useState(false);
  const tr = (k: Parameters<typeof t>[1]) => t(locale, k);
  return (
    <>
      <button type="button" className="btn btn-primary text-sm" onClick={() => setOpen(true)}>
        + {tr("newProject")}
      </button>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={tr("newProject")}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(2,6,12,0.7)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="card w-full max-w-md p-6" onKeyDown={(e) => e.key === "Escape" && setOpen(false)}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">{tr("newProject")}</h2>
              <button
                type="button"
                className="btn btn-ghost !px-2.5 !py-1 text-sm"
                aria-label="Close"
                onClick={() => setOpen(false)}
              >
                ✕
              </button>
            </div>
            <form action={createProjectAction} className="space-y-4">
              <div>
                <label htmlFor="np-title" className="mb-1 block text-sm font-medium">
                  {tr("title")}
                </label>
                <input
                  id="np-title"
                  name="title"
                  required
                  maxLength={200}
                  dir="auto"
                  className="input"
                  placeholder={locale === "ar" ? "عنوان المشروع" : "Project title"}
                />
              </div>
              <div>
                <span className="mb-1 block text-sm font-medium">
                  {locale === "ar" ? "النوع" : "Type"}
                </span>
                <div className="flex gap-2">
                  <label className="card flex flex-1 cursor-pointer items-center gap-2 p-3 text-sm">
                    <input type="radio" name="type" value="presentation" defaultChecked />
                    ▦ {tr("presentation")}
                  </label>
                  <label className="card flex flex-1 cursor-pointer items-center gap-2 p-3 text-sm">
                    <input type="radio" name="type" value="document" />
                    📄 {tr("document")}
                  </label>
                </div>
              </div>
              <div>
                <label htmlFor="np-language" className="mb-1 block text-sm font-medium">
                  {tr("language")}
                </label>
                <select id="np-language" name="language" defaultValue="en" className="input">
                  <option value="en">English</option>
                  <option value="ar">العربية</option>
                </select>
              </div>
              <button type="submit" className="btn btn-primary w-full justify-center">
                {tr("createProject")}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
