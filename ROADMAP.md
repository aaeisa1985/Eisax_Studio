# EISAX Studio — Roadmap

Status legend: ☐ pending · ◐ in progress · ☑ done (see STATUS.md for evidence)

## Phase 0 — Repo audit & plan ☑
- [x] Audit environment (Node 22.23, npm 10.9, git 2.53; no Docker, no Postgres server)
- [x] Docs: ARCHITECTURE.md, ROADMAP.md, STATUS.md, README.md, .env.example
- [x] License review of chosen packages
- [x] Git repo initialized locally (no remote created)

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

## Phase 2 — Presentation editor & export ☐
- [ ] Slide schema, thumbnails, add/delete/reorder/duplicate
- [ ] Canvas editing (text, shapes), themes, undo/redo
- [ ] PPTX export with editable text; OOXML inspection test
- [ ] PDF export verification

## Phase 3 — AI creation ☐
- [ ] Provider interface + deterministic demo provider
- [ ] Outline → content pipeline with Zod validation
- [ ] Usage ledger + free-plan quotas enforced server-side
- [ ] AI edit commands with preview/undo

## Phase 4 — Documents ☐
- [ ] Structured document editor (headings, lists, tables, links)
- [ ] AI document generation
- [ ] DOCX/PDF export verification
- [ ] Arabic/mixed-direction test cases

## Phase 5 — SaaS hardening & billing readiness ☐
- [ ] Entitlements, quotas, rate limits, audit log
- [ ] Stripe integration behind disabled feature flag (no charges)
- [ ] Dockerfile, compose, staging deploy docs (no production deploy)
