# EISAX Studio — STATUS

> Updated autonomously after each milestone. Only verified results are recorded as passing.

## Milestone 0 — Environment audit & repo plan (2026-11-15)

**Observed environment**
- Node v22.23.2, npm 10.9.8, git 2.53.0.windows.1
- Docker: **not installed** · PostgreSQL client/server: **not installed**

**Adaptation (rationale recorded in ARCHITECTURE.md):** use PGlite (embedded real-Postgres WASM, Apache-2.0) with Drizzle so all DB code targets the Postgres dialect; swap to hosted `DATABASE_URL` later by changing one driver file.

**Package license review:** next/react (MIT), drizzle-orm (Apache-2.0), @electric-sql/pglite (Apache-2.0), zod (MIT), tailwindcss (MIT), vitest (MIT). No GPL/copyleft runtime deps adopted.

**Built:** docs (ARCHITECTURE/ROADMAP/STATUS/README/.env.example), git repo (local only, no remote).

---

## Milestone 1 — Phase 1: Functional shell & persistence (2026-11-15)

**Built (all real, no mocks):**
- Next.js 15 App Router + TypeScript strict + Tailwind v4; PGlite (embedded Postgres) + Drizzle with SQL migrations (`src/lib/db/migrations/0001_init.sql`): users, sessions, workspaces, workspace_members, projects, project_revisions, audit_log.
- Auth: sign-up / sign-in / sign-out. scrypt password hashing, opaque session tokens stored as SHA-256 hashes, HttpOnly SameSite=Lax cookies, server-side session lookup, per-IP rate limits on auth actions. Email verification / password reset **not implemented** (requires email provider config — disclosed below).
- i18n: full EN/AR dictionaries, `dir` switched per locale (verified `rtl` in browser), per-element `dir="auto"` + `unicode-bidi: plaintext` for mixed content, locale switcher (cookie + persisted to user profile).
- Landing page: value prop, demo prompt block, 4-tier pricing (marked as draft hypothesis), FAQ.
- Dashboard: project grid with type badge, search, create dialog (title/type/language), rename inline, duplicate, soft-delete, empty/loading/error states.
- Editors (shell): presentation editor (slide list, add/delete/move, title/subtitle/speaker notes) and document editor (heading/paragraph blocks); debounced autosave with saved/saving/error indicator; content validated server-side per type (Zod).
- Revisions: every real content change creates a numbered revision (last 20 kept); restore endpoint verified. No-op autosaves are filtered (jsonb-normalized canonical comparison).
- Health endpoint `/api/health` (DB ping), `npm run db:migrate`, `npm run db:reset`.
- Fix during build: PGlite requires parent dir; jsonb key reordering required canonical stringify for change detection; `gen_random_uuid()` defaults added to migration SQL; LocaleSwitcher converted to client component.

**Verified (exact commands and results):**
- `npm run typecheck` → exit 0, no errors.
- `npm test` → **14/14 passed** (`tests/phase1.test.ts`): password hashing, rate limiter, session-token hashing, validation schemas, project tenancy (cross-workspace access denied for read/update/delete/list), CRUD, revision creation/no-op filtering/restore, duplicate, soft delete, Arabic RTL content creation.
- `npm run build` → production build succeeded (6 routes).
- Browser smoke test (Chromium, dev server):
  - `/api/health` → 200 `{"status":"ok","db":"ready"}`
  - Sign-up → auto signed in → `/dashboard` rendered with empty state.
  - Created presentation "Solar Energy Overview" → editor opened, 1 seeded slide + revision #1.
  - Added slide, typed title/subtitle → autosave "Saved" → reloaded → both slides and subtitle persisted (3 revisions).
  - Locale switched to Arabic → `html dir="rtl" lang="ar"`, full Arabic UI, English slide content stayed LTR (screenshot: `docs/screenshots/editor-rtl-arabic.png`).
  - Sign-out → redirected to landing as anonymous; `/dashboard` as anonymous → redirected to `/sign-in`.

**Cost / quota (observed only):**
- Agent model: GLM (free tier, per session harness). No token/credit metrics are exposed by the harness, so none are recorded (per PROJECT.md rule: do not invent metrics).
- No external APIs called by the application; AI runs nothing external (demo path only in later phases).

**Open issues / limitations:**
1. Email verification & password reset deferred (needs configured email provider; no external service used without approval).
2. Rate limiting is per-process (documented in code); move to shared store before multi-instance deployment.
3. AI generation not yet present (Phase 3) — creation flow is manual for now.
4. Undo/redo inside the editor and full slide canvas (shapes/images) are Phase 2.
5. PGlite is single-connection; swap to hosted Postgres requires a real `DATABASE_URL` + driver change (documented in ARCHITECTURE.md).
6. Arabic webfont is system fallback (licensed font asset not provided).
7. Playwright E2E suite not yet added; browser flow verified manually via automated browser this milestone.

**Next:** Phase 2 — structured slide schema hardening, PPTX export (PptxGenJS) with OOXML inspection test, PDF export, undo/redo.
