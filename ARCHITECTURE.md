# EISAX Studio — Architecture

## Stack (with rationale)

| Concern | Choice | Rationale |
|---|---|---|
| Framework | Next.js 15 App Router + TypeScript (strict) | Brief default; server components keep permission checks server-side. |
| Styling | Tailwind CSS v4, design tokens via CSS variables | Brief default; RTL support via logical properties. |
| Database | PostgreSQL semantics via **PGlite** (embedded WASM Postgres) + Drizzle ORM | No Docker or Postgres server exists on the build machine. PGlite runs *real* PostgreSQL (single connection, file-persisted to `./.data/pg`) so all SQL, migrations, and Drizzle code are written against the Postgres dialect. Swapping to a hosted `DATABASE_URL` later only changes the driver adapter in `src/lib/db/index.ts`. |
| Migrations | Plain SQL files in `src/lib/db/migrations/`, applied idempotently at first DB access + `npm run db:migrate` | Avoids drizzle-kit codegen coupling; keeps migration history reviewable in Git. |
| Auth | Custom session auth: scrypt password hashing (Node crypto), opaque session token in HttpOnly/SameSite=Lax cookie, sessions stored in `sessions` table | Brief allows "suitable secure auth library" but none needed locally; avoids heavy dependency and next-auth's provider coupling. CSRF: all mutating server actions/route handlers verify the session cookie is SameSite=Lax + origin check middleware. |
| i18n | Lightweight custom dictionary (`src/lib/i18n/`), locale cookie `locale=en|ar`, `dir=rtl` on `<html>` for Arabic | No runtime i18n framework needed for 2 locales; mixed-direction content handled per-element (`dir="auto"`). |
| AI | `AIProvider` interface; `DemoProvider` (deterministic, no network) first; OpenAI-compatible adapter behind env config later | Brief principle 4/5. No external calls without explicit user configuration/approval. |
| Export (Phase 2+) | PptxGenJS (PPTX), `docx` (DOCX), browser-print/server PDF — all MIT | Will be verified with real OOXML inspection before claiming support. |
| Tests | Vitest (unit/integration over the real PGlite DB), Playwright later for browser E2E | Vitest is fast and MIT. Browser tests added in Phase 1 gate. |
| Storage | Local filesystem adapter under `./.data/storage` behind an S3-shaped interface (Phase 2+) | Brief principle 8. |

## Data model (initial, Postgres)

- `users` — id (uuid), email (unique, lowercased), password_hash, display_name, locale, created_at
- `sessions` — id (token hash), user_id FK, expires_at, created_at
- `workspaces` — id, name, owner_id FK, plan (`free` default), created_at
- `workspace_members` — workspace_id, user_id, role (`owner|editor|viewer`), PK (workspace_id,user_id)
- `projects` — id, workspace_id, owner_id, type (`presentation|document`), title, language, content (jsonb, versioned), archived_at (soft delete), created_at, updated_at
- `project_revisions` — id, project_id, revision_no, content jsonb, created_by, created_at (retention: keep last 20)
- `generation_jobs` / `usage_ledger` / `assets` / `subscriptions` — schema stubs added in later phases with their features.

Content JSON is validated with Zod and carries a `schemaVersion` for future migrations.

## Security posture (enforced server-side)

- Every project/workspace route resolves membership and checks role before any read/write.
- Passwords: scrypt (N=16384) with random salt; timing-safe compare.
- Sessions: 32-byte random token, stored as SHA-256 hash, 30-day expiry, rotation on sign-in, invalidated on sign-out.
- Cookies: HttpOnly, Secure in production, SameSite=Lax; Origin/Host check on POST.
- Input validation with Zod at every route boundary; no raw prompt content in logs.
- Rate limits (in-memory per process, per user/IP) on auth, AI, export routes.

## Directory layout

```
src/
  app/            # Next.js routes (landing, auth, dashboard, projects)
  components/     # UI primitives + design system
  lib/db/         # PGlite driver, schema, migrations
  lib/auth/       # password hashing, sessions, guards
  lib/i18n/       # dictionaries, locale helpers
  lib/ai/         # provider interface + demo provider (Phase 3)
  lib/validation/ # Zod schemas
```

## Design tokens

Dark shell `#060B14`, turquoise `#00D4C8`, sky `#0EA5E9`, gold `#D4AF37` (accents only). Editor content surface stays light. Arabic uses system Arabic-capable stack (`Segoe UI`, `Noto Naskh`, `Tahoma` fallbacks) until a licensed Arabic webfont is provided.
