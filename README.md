# EISAX Studio

**Open it. Edit it. Keep it.** — a lightweight local workspace for everyday Word and PowerPoint tasks. Open existing DOCX/PPTX files, make common edits, and save them back; an AI assistant is available when useful.

Repository: <https://github.com/aaeisa1985/Eisax_Studio.git> (branch `main`).

## Windows desktop

```bash
npm install
npm run desktop:prepare
npm run desktop
```

The desktop app provides native Open, Save/Save As and direct PDF download. The first file save asks for a destination; replacing an imported original requires confirmation. Files are stored in Electron's user-data directory. Installer builds (`npm run desktop:package`) register DOCX/PPTX file associations; Windows may ask you to choose the default app. No signing certificate is configured.

Unsaved editor drafts are retained on the device and offered for recovery on reopen. Conflicting saves from a stale window are rejected rather than replacing newer content.

## Quick start (local development)

Requirements: Node.js 20+ (built on Node 22). No external database server required — data is stored in an embedded Postgres (PGlite) at `./.data/`.

```bash
npm install
npm run build      # build once (repeat after code changes)
npm run local      # personal local profile at http://127.0.0.1:3000 (no login)
```

`npm run local:dev` starts the local profile with development tooling. The production build is lighter for daily use.

`npm run dev` remains the hosted-style development mode with accounts and workspaces. The local profile is separate from hosted accounts. Imported originals are retained separately from the working copy; saving is serialized, and Ctrl+S flushes pending saves.

EISAX Studio focuses on common everyday tasks, not full Microsoft Office fidelity. Some formatting, embedded objects, fonts, and layout details may change during import/export; verify important files in Microsoft Word or PowerPoint.

Other commands:

```bash
npm run build      # production build
npm run typecheck  # TypeScript strict check
npm run test       # Vitest unit/integration tests
npm run db:migrate # (re)apply DB migrations to local PGlite
npm run db:reset   # delete local database + uploaded files
```

Configuration: copy `.env.example` to `.env.local`. **No paid or external services are used by default.** AI runs from a deterministic local demo provider unless you explicitly configure a provider (see `.env.example`).

## Docs

- `PROJECT.md` — product brief
- `ARCHITECTURE.md` — technical choices & rationale
- `ROADMAP.md` — phased plan
- `STATUS.md` — verified milestones, test results, open issues

## Languages

English and Arabic with full RTL support. Switch from the header; content direction is per-element (`dir="auto"`).

Desktop fullscreen: use the visible Fullscreen button, View menu, or F11. Press Esc to exit. Close and reopen the desktop app after updating its build.
