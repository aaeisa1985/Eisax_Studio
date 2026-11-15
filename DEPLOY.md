# Deployment (staging) — EISAX Studio

> **Rule:** nothing here may be run against production systems or with billing enabled
> until explicitly approved. `FEATURE_BILLING` stays `false`.

## A. Local / staging with Docker

```bash
cp .env.example .env.local          # set AUTH_SECRET (required)
docker compose up --build -d
curl http://localhost:3000/api/health   # -> {"status":"ok","db":"ready"}
```

Data persists in the `app-data` volume (embedded PGlite at `/app/.data/pg`).
Back up with:

```bash
docker compose exec app tar czf - /app/.data/pg > backup-$(date +%F).tgz
```

Restore: stop the app, replace the volume content, start again.

## B. Node (no Docker)

```bash
npm ci
npm run build
npm run start          # PORT=3000 by default
```

## Health & readiness

- `GET /api/health` → 200 when the database answers a ping; 503 otherwise.
- The Dockerfile wires this into a HEALTHCHECK; use it as the load-balancer readiness probe.

## Migrations

Migrations apply automatically on first DB access (idempotent, tracked in `_migrations`).
For explicit control: `npm run db:migrate`.

## Swapping to a managed Postgres (when approved)

1. Provision Postgres 14+ and set `DATABASE_URL`.
2. Replace the PGlite adapter with `drizzle-orm/node-postgres` in `src/lib/db/index.ts`
   (single file change; schema and migrations are unchanged).
3. Apply `src/lib/db/migrations/*.sql` in order.

## Environment

| Variable | Required | Notes |
|---|---|---|
| `AUTH_SECRET` | yes (shared deploys) | Rotating it invalidates sessions. |
| `DATABASE_URL` | no | Embedded PGlite is the default. |
| `FEATURE_BILLING` | no | Must stay `false` until billing is approved. |
| `AI_*` | no | Unset ⇒ deterministic offline demo provider only. |

## Failure handling / rollback

- App is stateless apart from the data volume; rollback = redeploy previous image.
- Migrations are append-only and idempotent; rollback of schema changes should be a
  new forward migration (never edit applied files).
- Timeouts: Next default server timeouts apply; exports stream as buffers (small decks/docs).

## Known limits (staging)

- Single instance only while PGlite is embedded (file-lock); scale after managed-Postgres swap.
- Rate limits are per-process; add a shared store (e.g. Redis) before multi-instance deploys.
