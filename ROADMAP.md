# EISAX Studio — Roadmap

Status legend: ☐ pending · ◐ in progress · ☑ done (see STATUS.md for evidence)

## Phase 0 — Repo audit & plan ☑
- [x] Audit environment (Node 22.23, npm 10.9, git 2.53; no Docker, no Postgres server)
- [x] Docs: ARCHITECTURE.md, ROADMAP.md, STATUS.md, README.md, .env.example
- [x] License review of chosen packages
- [x] Git repo initialized locally and pushed to GitHub (`origin/main`)

## Phase 1 — Functional shell & persistence ☑
- [x] Scaffold Next.js + TS strict + Tailwind v4
- [x] DB: PGlite + Drizzle, migrations (users/sessions/workspaces/members/projects/revisions)
- [x] Auth: sign-up / sign-in / sign-out, session cookies, guards
- [x] i18n en/ar with RTL, locale switcher
- [x] Design system + landing page (value prop, pricing, FAQ)
- [x] Dashboard: recent projects, create/rename/duplicate/delete/archive, search
- [x] Project metadata editor + document/presentation content shell
- [x] Autosave + revisions (restore last 20)
- [x] Vitest unit + integration tests (auth, tenancy, CRUD, revisions)
- [x] Browser smoke test of the full flow

## Phase 2 — Presentation editor & export ☑
- [x] Slide schema, visual thumbnails, add/delete/reorder/duplicate
- [x] Canvas editing (text, bullets, layout presets, native accent shapes), themes, undo/redo
- [x] PPTX export with editable text, bullets, shapes & theme colors; OOXML inspection test
- [x] PDF print/export verification

## Phase 3 — AI creation ☑
- [x] Provider interface + deterministic demo provider + OpenAI-compatible adapter (env-configured)
- [x] AI-first creation wizard: prompt → outline review/edit → content pipeline with Zod validation
- [x] Usage ledger + free-plan quotas enforced server-side
- [x] AI edit commands with preview, inline error handling & undo

## Phase 4 — Documents ☑
- [x] Structured document editor (headings, paragraphs, lists, tables, quotes, links, inline emphasis)
- [x] AI document generation (headings, paragraphs, lists, tables, quotes)
- [x] DOCX/PDF export verification (semantic OOXML headings, lists, tables, hyperlinks)
- [x] Arabic/mixed-direction test cases

## Phase 5 — SaaS hardening & billing readiness ☑
- [x] Entitlements, quotas, rate limits (auth, AI, export), audit log
- [x] Local S3-shaped storage adapter (`src/lib/storage`) + `assets` & `subscriptions` migrations
- [x] Stripe webhook signature verification & checkout guard behind disabled `FEATURE_BILLING=false` flag (no charges)
- [x] Dockerfile, compose, staging deploy docs (no production deploy)

## Phase 6 — Everyday DOCX/PPTX editing foundation ◐
- [x] Refocus UX on blank documents/presentations and opening existing `.docx` / `.pptx` files directly (AI is optional)
- [x] Continuous WYSIWYG Word processor (`WordProcessor.tsx` on TipTap v3 + `.eisax-word-prose`) with rich formatting ribbon, tables, lists, images, links, page layout (A4/Letter, Portrait/Landscape, margins), per-paragraph RTL/LTR, and Undo/Redo
- [x] Interactive 16:9 Slide Canvas editor (`SlideCanvasEditor.tsx`) with draggable/resizable text boxes, inline editing, shapes (`rect`, `roundRect`, `ellipse`, `triangle`, `line`, `arrow`), images, charts, z-index layering, speaker notes, and slide management
- [x] Real OOXML `.docx` & `.pptx` import (`src/lib/import/docx.ts`, `src/lib/import/pptx.ts`) + `POST /api/projects/import` + round-trip export fidelity & explicit `fidelityWarnings`
- [x] Automated DOCX/PPTX import → edit → export → reopen round-trip tests and live browser E2E verification (application-level checks only; not proof of Office compatibility)

## Phase 7 — Mixed Arabic/English Bidi, Light/Dark Themes & PWA groundwork ◐
- [x] UAX #9 first-strong auto-RTL + `unicode-bidi: plaintext` across TipTap Word & 16:9 Slide Canvas editors, PDF print view, DOCX (`<w:bidi/>` + `START`/`END` + per-run `w:rtl`), and PPTX (`rtl="1"` per run)
- [x] Crisp Light Mode & Dark Mode toggle (`ThemeSwitcher`, cookie + SSR `data-ui-theme`) across Landing, Dashboard, and Editors
- [x] Installable PWA assets and controls exist; offline completeness and native desktop behavior are not claimed

## Phase 8 — Rich Media/Chart/Table Line-Drag Controls, Light Ribbon & Bilingual Typography ☑
- [x] Light Mode sticky ribbon, `<select>` options, and alert/banner contrast fixes (`WordProcessor.tsx`, `SlideCanvasEditor.tsx`, `AiAssist.tsx`, `globals.css`)
- [x] 8-handle resizing, edge crop bars + numeric crop (`<a:srcRect>` OOXML), rotation, alignment, and live `<ChartDataEditor>` across Word & Slides
- [x] Table column + horizontal row border drag resizing in Word (`colWidths`/`rowHeights`) and native draggable `kind: "table"` element in Slide Canvas + PPTX/DOCX/Print sync
- [x] 15 Arabic/Latin fonts, `8pt–72pt` / `8–72px` sizes, 10 numbering/bullet styles (`arabic-indic`, `arabic`, roman, alpha, bullets), `١٢٣↔123` digit script converter, and slide/page numbering toggles

## Compatibility and scope

EISAX Studio targets common everyday tasks (the practical 80/20), not complete Word/PowerPoint parity. Application tests establish that the app can import, edit, export, and reopen its supported content; real Office behavior still needs compatibility verification.

| Area | Implemented in the app | Needs real Office verification |
|---|---|---|
| DOCX | Import/export, common text formatting, headings, lists, tables, links, images, RTL and mixed direction | Word rendering, pagination, fonts, complex tables, embedded objects, tracked changes, and round-trip preservation |
| PPTX | Import/export, slide text and shapes, images, charts, tables, notes, and basic layout editing | PowerPoint rendering, fonts, animations, transitions, SmartArt, embedded media/objects, and round-trip preservation |
| Local profile | `npm run local` on loopback, no login, separate personal profile; original imports retained; serialized saves and Ctrl+S flush | Recovery behavior under interrupted writes and broader supported-file compatibility |

Do not describe this milestone as a “Genuine Microsoft Office Alternative” or imply full-fidelity compatibility.
