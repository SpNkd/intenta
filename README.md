# ИНТЕНТА

Mobile-first веб-приложение для личного эксперимента с намерением.

Реализованы **Slice 0 — executable foundation** и два vertical slices:
`Landing → прозрачная anonymous session → onboarding` и
`500 ₽ → draft → paper → basic Technique`. Activation и recovery flow ещё не
реализованы.

## Stack

- Node.js 20.20+, pnpm 11.19;
- Next.js 16.3, React 19.2, TypeScript 5.9, Tailwind CSS 4.3;
- Python 3.13, uv 0.8+;
- FastAPI 0.141, Pydantic 2.13, SQLAlchemy 2.0, Alembic 1.19;
- PostgreSQL 17.6 through Docker Compose;
- pytest, Vitest, Testing Library, Ruff, mypy and ESLint.
- Playwright для browser E2E против реальных web/API/PostgreSQL.

## Repository structure

```text
apps/web                 Next.js frontend and component tests
apps/api                 FastAPI, Alembic, content loader and backend tests
content/ru               versioned Russian product content
packages/api-client      generated OpenAPI types and typed client adapter
scripts                  cross-platform workspace tooling
PRODUCT.md               product source of truth
ARCHITECTURE.md          architecture source of truth
AGENTS.md                short agent guide
```

## Prerequisites

- Docker with Compose;
- Node.js 20.20 or newer;
- pnpm 11.19 (`corepack enable` if pnpm is not available);
- uv. Python 3.13 is installed automatically by uv when necessary.

## First setup

Run from the repository root:

```bash
cp .env.example .env
pnpm install --frozen-lockfile
pnpm --filter @intenta/web exec playwright install chromium
uv --directory apps/api sync --frozen
docker compose up -d postgres
uv --directory apps/api run alembic upgrade head
pnpm generate:api
```

For the first dependency resolution before lockfiles exist, use `pnpm install` and
`uv --directory apps/api sync`; committed lockfiles make subsequent setup frozen.

## Local development

Terminal 1:

```bash
docker compose up -d postgres
uv --directory apps/api run alembic upgrade head
pnpm dev:api
```

Terminal 2:

```bash
pnpm dev:web
```

Open <http://127.0.0.1:3000>. The browser creates an opaque anonymous session and
calls `/api/v1/*` on the Next.js origin; the development rewrite proxies requests to
<http://127.0.0.1:8000>. Direct API docs are available at
<http://127.0.0.1:8000/docs>.

The session token is stored in an HttpOnly cookie and only its SHA-256 hash is kept
in PostgreSQL. Local HTTP development uses `SESSION_COOKIE_SECURE=false`; production
must enable the Secure cookie setting and list its HTTPS origin in `ALLOWED_ORIGINS`.

PostgreSQL is exposed on host port `5433` to avoid clashing with a system PostgreSQL;
inside Docker it still listens on `5432`. Override the host port with `POSTGRES_PORT` and
update `DATABASE_URL` together when needed.

## Checks

PostgreSQL must be running for backend tests:

```bash
docker compose up -d postgres
uv --directory apps/api run alembic upgrade head
pnpm content:validate
pnpm generate:api
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

Focused commands:

```bash
pnpm test:web
pnpm test:api
pnpm test:e2e
pnpm --filter @intenta/web lint
pnpm --filter @intenta/web typecheck
uv --directory apps/api run ruff check .
uv --directory apps/api run mypy app scripts
uv --directory apps/api run pytest
```

`packages/api-client/src/generated/schema.d.ts` is generated from FastAPI OpenAPI.
Never edit it manually. Regenerate it with `pnpm generate:api`.

`pnpm test:e2e` starts missing local servers when necessary and exercises the real
Next.js → FastAPI → PostgreSQL flow. It does not replace the API with mocks.

Next.js uses its supported Webpack mode for both dev and build. This avoids a
Turbopack/PostCSS worker limitation on restricted macOS environments while keeping
the same Next.js runtime and application contract.

Root `pnpm` scripts invoke uv through a tiny Node launcher. This keeps the child
process on Node's native architecture on macOS systems where package-script shells
may run under Rosetta; it is a transparent `uv` pass-through on other platforms.

## Migrations

Run from the repository root:

```bash
uv --directory apps/api run alembic upgrade head
uv --directory apps/api run alembic current
```

Create a migration only after changing SQLAlchemy metadata:

```bash
uv --directory apps/api run alembic revision --autogenerate -m "describe change"
```

## Environment

Defaults are safe for local development only. Copy `.env.example` to `.env` when
overrides are needed. Never commit `.env` or production secrets.
