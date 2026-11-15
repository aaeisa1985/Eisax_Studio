# EISAX Studio

**Describe it. Create it. Own it.** — AI-first studio for professional documents and presentations, exported to real, editable Office formats.

Repository: <https://github.com/aaeisa1985/Eisax_Studio.git> (branch `main`).

## Quick start (local development)

Requirements: Node.js 20+ (built on Node 22). No external database server required — data is stored in an embedded Postgres (PGlite) at `./.data/`.

```bash
npm install
npm run dev        # http://localhost:3000
```

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
