# AGENTS.md

Короткая карта проекта для coding agents.

## Source of truth

- `PRODUCT.md` — продуктовая логика, терминология, flow и запрещённые паттерны.
- `ARCHITECTURE.md` — границы компонентов, auth, DB, API и принятые решения.
- FastAPI OpenAPI — API contract после появления API.
- Alembic migrations — схема PostgreSQL после появления БД.

## Layout

- `apps/web` — Next.js/React frontend.
- `apps/api` — FastAPI backend и backend tests.
- `content/ru` — продуктовые тексты и шаблоны.
- `packages/api-client` — генерируемый TypeScript API client.
- `docs/decisions` — короткие ADR.

## Commands

Команды будут зафиксированы при bootstrap и продублированы в `README.md`:

- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`;
- `pnpm test:e2e`;
- `uv run pytest` из `apps/api`;
- `uv run alembic upgrade head` из `apps/api`;
- `docker compose up postgres`.

Не выдумывать новую команду: сначала сверяться с `package.json`, `pyproject.toml` и
`README.md`.

## Non-negotiable rules

1. No runtime LLM in MVP.
2. API-first: frontend не обращается к БД и не владеет бизнес-правилами.
3. Product copy вне UI-компонентов, где это практически возможно.
4. Активированная Intention и её snapshots неизменяемы.
5. Нет email/phone auth; recovery secret никогда не хранится в plaintext.
6. Каждый доступ к пользовательскому объекту проверяет ownership.
7. Mobile-first, accessibility не жертвуется ради анимации.
8. Деньги не хранятся в float, timestamps хранятся в UTC.
9. Не добавлять Redis, queues, microservices и абстракции без текущей необходимости.
10. После изменений запускать релевантные tests; перед milestone — полный набор.

