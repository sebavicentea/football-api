# Promiedos API wrapper

Authenticated, provider-neutral football data API for the applications in this workspace.

## Development

Copy `.env.example` to `.env`, set a private `APP_TOKEN`, then run:

```bash
npm install
npm run dev
```

The server binds to `0.0.0.0:3001` by default and is available locally at `http://127.0.0.1:3001`. Production requires one instance with a durable volume for `DATABASE_PATH`; use a shared database adapter before scaling horizontally.

## Interface

- `GET /health`
- `GET /v1/leagues`
- `GET /v1/fixtures/rounds`
- `GET /v1/fixtures`
- `GET /v1/fixtures/remaining-regular` — unfinished regular-phase fixtures for a stage; `stage` is a canonical stage ID discovered from `GET /v1/fixtures/rounds`
- `GET /v1/standings`
- `GET /openapi.json`

All routes except `/health` require `Authorization: Bearer <APP_TOKEN>`.

## Verification

```bash
npm test
npm run lint
npm run build
```
