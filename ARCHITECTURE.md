# ИНТЕНТА — архитектура MVP

Статус: proposed architecture для шага 1. Документ фиксирует направление до
написания application code. OpenAPI после появления API становится source of truth
сетевого контракта, а Alembic migrations — source of truth схемы PostgreSQL.

## 1. Цели и ограничения

- простой модульный монолит, запускаемый локально;
- mobile-first Next.js frontend и отдельный FastAPI REST API;
- вся бизнес-логика и авторизация на backend;
- PostgreSQL — единственное stateful-хранилище MVP;
- отсутствие runtime LLM и необязательной инфраструктуры;
- строгая изоляция данных пользователей и неизменяемость активированной Интенты;
- возможность позже заменить content provider, не меняя доменную модель.

## 2. Proposed repository structure

```text
intenta/
├── AGENTS.md
├── ARCHITECTURE.md
├── PRODUCT.md
├── README.md
├── .env.example
├── .gitignore
├── docker-compose.yml
├── pnpm-workspace.yaml
├── package.json
├── content/
│   └── ru/
│       ├── common.json
│       ├── onboarding.json
│       ├── intentions.json
│       ├── activation.json
│       ├── techniques.json
│       ├── waiting.json
│       ├── outcomes.json
│       └── reflections.json
├── docs/
│   ├── decisions/             # короткие ADR для спорных решений
│   └── flows/                 # flow/state diagrams при необходимости
├── apps/
│   ├── web/
│   │   ├── src/
│   │   │   ├── app/           # Next.js App Router, layouts и routes
│   │   │   ├── features/      # auth, onboarding, intentions, outcomes, history
│   │   │   ├── components/    # общие UI primitives
│   │   │   ├── lib/           # API client, query client, formatting
│   │   │   └── styles/
│   │   ├── public/
│   │   └── tests/             # component и Playwright E2E
│   └── api/
│       ├── pyproject.toml
│       ├── alembic.ini
│       ├── alembic/
│       │   └── versions/
│       ├── app/
│       │   ├── main.py
│       │   ├── api/v1/        # routers, dependencies, error mapping
│       │   ├── core/          # settings, security, DB, logging
│       │   ├── domain/        # enums, rules, value objects
│       │   ├── models/        # SQLAlchemy persistence models
│       │   ├── schemas/       # Pydantic request/response DTO
│       │   ├── services/      # use cases and transaction boundaries
│       │   ├── repositories/  # focused query/persistence helpers
│       │   └── content/       # loader/formatter over root content files
│       └── tests/
│           ├── unit/
│           └── integration/
├── packages/
│   └── api-client/            # generated TS types/client; no handwritten DTO copy
└── docker/
    └── postgres/
```

Не вводить общий `shared` пакет без конкретного потребителя. Не создавать интерфейс
на каждую функцию «ради Clean Architecture».

## 3. Runtime topology

```text
Browser
  │ same-origin HTTPS, HttpOnly cookie + CSRF header
  ▼
Reverse proxy / routing layer
  ├── /*        → Next.js
  └── /api/v1/* → FastAPI
                    │
                    ▼
              service/domain layer
                    │
                    ▼
              SQLAlchemy + PostgreSQL
```

В local development Next.js rewrite проксирует `/api/v1/*` к FastAPI. В production
оба приложения остаются same-origin за ingress/reverse proxy. Это избавляет
cookie-auth от CORS-зависимости. Frontend никогда не обращается к PostgreSQL.

## 4. Frontend architecture

### Стек

- Next.js с App Router, React, TypeScript;
- Tailwind CSS с design tokens через CSS variables;
- TanStack Query для server state;
- React Hook Form для форм и Zod только для UX-валидации;
- `openapi-typescript` + `openapi-fetch` (или один эквивалентный минимальный набор)
  для генерируемого клиента;
- Vitest + Testing Library для unit/component tests;
- Playwright для критических E2E.

Backend Pydantic остаётся окончательной границей валидации. Zod-схемы не должны
становиться вручную поддерживаемой копией всех DTO.

### Организация

Routes отвечают за композицию экранов; feature-модули содержат формы, query/mutation
hooks и UI конкретного flow; общие компоненты не знают доменных правил. Компоненты
не вычисляют следующий шаг, возможность закрытия, ownership или переход статуса.

Предлагаемые routes:

```text
/
/recover
/onboarding
/intention/new
/intention/[id]/write
/intention/[id]/technique
/intention/[id]/activated
/key
/intention
/history
/history/[id]
/outcome/[intentionId]
/settings
```

Route guard использует `GET /me` и серверное состояние, а не доверяет localStorage.
Recovery code выдаётся после активации и не сохраняется автоматически в
localStorage, analytics или logs.
Черновик формы можно держать в React state; сохранённый draft всегда перечитывается
из API.

Контент UI загружается типизированным helper-слоем из `content/ru`. Денежные суммы
форматируются через `Intl.NumberFormat`; timestamps backend передаёт в UTC, UI
локализует только отображение. Номер дня приходит вычисленным backend либо из
отдельного server-derived поля.

## 5. Backend architecture

### Стек

- Python 3.13 (при несовместимости зависимости — 3.12), `uv`;
- FastAPI, Pydantic Settings/Pydantic v2;
- SQLAlchemy 2 async + `psycopg`;
- Alembic;
- PostgreSQL;
- pytest, pytest-asyncio и HTTPX test client.

### Слои и зависимости

```text
API router/dependencies
        ↓
application service (use case + transaction)
        ↓
domain rules / repositories
        ↓
SQLAlchemy models / PostgreSQL
```

- routers переводят HTTP в DTO и вызывают use case;
- services являются транзакционными границами и реализуют сценарии;
- domain содержит статусы, допустимые переходы и чистые вычисления;
- repositories инкапсулируют нетривиальные запросы и ownership-фильтры;
- models не возвращаются напрямую из API;
- исключения домена централизованно отображаются в RFC 9457 Problem Details.

Не нужны отдельные deployable services, message broker или generic repository.
Критические изменения используют транзакцию и row lock/условный `UPDATE`, чтобы два
запроса не активировали или не завершили Интенту дважды.

### Конфигурация

Настройки поступают из environment через Pydantic Settings. `.env.example` содержит
только безопасные примеры. Время в базе — timezone-aware UTC. День считается чистой
backend-функцией из `activated_at` и текущего времени; тесты используют injectable
clock.

## 6. Database schema

Все идентификаторы внутренних объектов — UUIDv7 (если выбранная библиотека и
PostgreSQL-окружение поддерживают без лишней сложности), иначе UUIDv4. Денежные
значения — `BIGINT` в minor units и ISO 4217 currency (`RUB`), без float.

### `anonymous_users`

| column | type | constraints |
|---|---|---|
| id | uuid | PK |
| status | varchar/enum | active, disabled |
| onboarding_completed_at | timestamptz | nullable |
| recovery_code_acknowledged_at | timestamptz | nullable |
| created_at | timestamptz | not null |
| updated_at | timestamptz | not null |

### `recovery_credentials`

| column | type | constraints |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | FK users, indexed, not null |
| public_id | varchar | unique, indexed, not null |
| secret_hash | text | Argon2id PHC string, not null |
| created_at | timestamptz | not null |
| last_used_at | timestamptz | nullable |
| disabled_at | timestamptz | nullable |

До активации у user может не быть строки credential. Plaintext recovery secret
никогда не сохраняется. При замене создаётся новая строка/версия, а предыдущая
получает `disabled_at`; partial unique index допускает один active credential на user.

### `sessions`

| column | type | constraints |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | FK users, indexed, not null |
| token_hash | bytea | unique, not null |
| csrf_token_hash | bytea | not null |
| created_at | timestamptz | not null |
| last_seen_at | timestamptz | nullable |
| expires_at | timestamptz | indexed, not null |
| revoked_at | timestamptz | nullable |

Случайные session/CSRF tokens можно хешировать SHA-256: это высокоэнтропийные
секреты, не пользовательские пароли. Несколько активных сессий разрешены. Logout
отзывает текущую сессию.

### `experiment_steps`

| column | type | constraints |
|---|---|---|
| id | uuid | PK |
| position | integer | unique, positive |
| amount_minor | bigint | positive |
| currency | char(3) | not null |
| reflection_after_days | integer | positive |
| technique_id | uuid | nullable FK techniques |
| active | boolean | not null |
| created_at | timestamptz | not null |

Начальные строки: 50000, 100000, 200000, 500000, 1000000 minor RUB units.

`technique_id` задаёт фиксированную Технику шага. Если он `NULL`, service выбирает
одну из active Techniques, разрешённых для данного шага/категории. Для первого
slice предпочтительна явная связь, чтобы поведение было детерминированным.

### `techniques`

| column | type | constraints |
|---|---|---|
| id | uuid | PK |
| key | varchar | not null |
| version | integer | positive |
| title | text | bounded, not blank |
| instruction | text | bounded, not blank |
| category | varchar | indexed, not null |
| active | boolean | not null |
| created_at | timestamptz | not null |

Unique (`key`, `version`). Таблица является versioned configuration, загружаемой из
`content/ru/techniques.json` seed migration/command. Старые версии не обновляются
на месте и могут стать inactive только для новых выборов.

### `experiment_step_techniques`

| column | type | constraints |
|---|---|---|
| experiment_step_id | uuid | FK steps, composite PK |
| technique_id | uuid | FK techniques, composite PK |
| selection_weight | integer | positive, default 1 |
| active | boolean | not null |

Это допустимый pool для server-side selection. Если у шага указан прямой
`technique_id`, он имеет приоритет и pool не используется. Первый MVP использует
прямую связь; таблица pool может появиться миграцией вместе с первым реальным
экспериментом вариантов, не затрагивая lifecycle или snapshots Интенты.

### `intentions`

| column | type | constraints |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | FK users, indexed, not null |
| experiment_step_id | uuid | FK steps, not null |
| step_position | integer | immutable snapshot |
| amount_minor | bigint | positive, immutable snapshot |
| currency | char(3) | immutable snapshot |
| reflection_after_days | integer | positive, immutable snapshot |
| intention_text_raw | text | bounded, not blank |
| intention_statement | text | bounded snapshot |
| statement_template_key | varchar | not null |
| statement_template_version | integer | positive |
| technique_id | uuid | FK techniques, not null |
| technique_key | varchar | immutable snapshot |
| technique_version | integer | positive immutable snapshot |
| technique_title | text | immutable bounded snapshot |
| technique_instruction | text | immutable bounded snapshot |
| status | varchar/enum | draft, active, completed, cancelled |
| created_at | timestamptz | not null |
| updated_at | timestamptz | not null |
| activated_at | timestamptz | nullable |
| completed_at | timestamptz | nullable |
| reflection_deferred_until | timestamptz | nullable operational metadata |

Ограничения и индексы:

- partial unique index по `user_id` при status IN (`draft`, `active`);
- unique (`user_id`, `step_position`) для MVP-линейки;
- checks согласованности timestamp/status;
- application service запрещает изменение snapshot/text после активации;
- `reflection_deferred_until` может только отложить следующий prompt и не меняет
  lifecycle или immutable snapshot;
- DB trigger для immutable полей рассматривается как дополнительная защита, но не
  заменяет domain tests.

### `outcomes`

| column | type | constraints |
|---|---|---|
| id | uuid | PK |
| intention_id | uuid | FK intentions, unique, not null |
| resolution | varchar/enum | happened, not_happened, uncertain |
| outcome_type | varchar/enum | money, other_amount, opportunity, similar, other, none |
| source_type | varchar/enum | nullable: gift, refund, bonus_or_cashback, extra_income, found_money, saving_or_discount, other |
| amount_received_minor | bigint | nullable, non-negative |
| was_expected | varchar/enum | yes, no, unsure, not_applicable |
| followed_original_intention | varchar/enum | yes, not_yet, chose_other, did_not_spend, not_applicable |
| user_note | text | nullable, bounded |
| occurred_at | timestamptz | nullable |
| created_at | timestamptz | not null |

Допустимые комбинации полей проверяются Pydantic/domain rules и базовыми DB checks.
`resolution` фиксирует ответ пользователя, а не вычисленную системой оценку успеха.
Backend не выводит его автоматически из `source_type`, суммы или `was_expected`.

### `auth_rate_limits`

Первый slice обязан иметь basic rate limiting recovery attempts. Допустима простая
in-process реализация для локального/одиночного deployment. Целевое решение перед
public deploy — PostgreSQL-backed фиксированные/скользящие buckets по HMAC
нормализованного public id и сокращённому сетевому ключу. Оно сохраняет лимит между
рестартами без Redis. Не хранить сырой recovery code или полный IP дольше нужного.

### Domain events

Начать со структурированного application logging через узкий `EventSink` interface.
Отдельная таблица событий нужна только при доказанной продуктовой потребности.

## 7. Authentication design

### Recovery credential

Формат для UX:

```text
INTENTA-{8 Crockford Base32 public chars}-{20 Crockford Base32 secret chars}
```

Для чтения части отображаются группами по 4. Парсер знает, какие первые 8 символов
после префикса являются public id. Секрет содержит 100 бит энтропии, генерируется
OS CSPRNG; неоднозначные символы Crockford нормализуются. Префикс, регистр, пробелы
и дефисы нормализуются строго, длина проверяется до lookup.

Создание аккаунта по **Попробовать**:

1. создать user;
2. создать opaque session и установить cookie;
3. сразу продолжить onboarding без credential gate.

Recovery credential намеренно не создаётся заранее. После активации frontend
открывает экран `/key` и вызывает отдельную операцию issuance. Только когда экран
готов показать ответ, backend:

1. генерирует public id и secret, обработав редкую коллизию public id;
2. сохраняет только Argon2id hash и метаданные;
3. возвращает полный code один раз с `Cache-Control: no-store`.

Так нечего удерживать между созданием session и активацией: ни plaintext в БД, ни
secret в localStorage, ни зашифрованный временный cookie не нужны. Credential имеет
ценность только после успешной выдачи, а пользователь уже получил основную ценность
продукта.

У одноразовой выдачи остаётся неизбежный failure mode: сервер мог commit hash, а
response мог не дойти. В этом случае `GET /me` сообщает только `credential_exists`
и `recovery_code_acknowledged_at`, но не secret. Пока исходная session действует,
экран предлагает **Выпустить новый код**: отдельная подтверждённая операция атомарно
отзывает неизвестный credential, создаёт новый и один раз возвращает новый plaintext.
Это rotation/replacement, а не повторное чтение старого secret. UI блокирует double
submit; endpoint защищён session, CSRF и basic issuance throttling.

Recovery:

1. применить общий и scoped rate limit;
2. нормализовать и разделить credential;
3. найти credential по `public_id`;
4. проверить Argon2id; для несуществующего id выполнить dummy hash verify с близким
   временем;
5. вернуть одинаковую внешнюю ошибку для неизвестного id и неверного секрета;
6. создать новую сессию, не отзывая остальные, и обновить `last_used_at`.

Argon2id параметры выбираются измерением на production-class instance и хранятся в
конфигурации; hash автоматически rehash при успешном входе, если параметры устарели.

### Session and CSRF

- session token: минимум 256 бит из OS CSPRNG, в БД только hash;
- cookie: `HttpOnly`, `Secure` в production, `SameSite=Lax`, `Path=/`, production
  name с префиксом `__Host-`;
- короткий разумный idle/absolute lifetime задаётся конфигурацией;
- rotation после recovery login и значимых auth transitions;
- state-changing запросы требуют CSRF token/header и проверки `Origin`/`Referer`;
- CORS выключен в production same-origin topology;
- ответы auth и приватные ответы имеют `Cache-Control: no-store`;
- logout отзывает серверную сессию и очищает cookie;
- изменение статуса пользователя немедленно блокирует его сессии.

Recovery code не попадает в URL, логи, telemetry, DOM дольше нужного экрана или
clipboard автоматически. Пользователь сам нажимает «Скопировать». Экран можно
отложить; `/me` позволяет ненавязчиво напомнить о невыпущенном/неподтверждённом коде.

## 8. REST API v1

Префикс: `/api/v1`. JSON в `snake_case` либо `camelCase` выбирается один раз до
реализации; ниже показан ресурсный контракт. OpenAPI генерируется FastAPI, schema
фиксируется в CI, TS client регенерируется командой и проверяется на drift.

### Auth and current user

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/anonymous` | прозрачно создать user и session, без recovery secret |
| POST | `/auth/recover` | проверить code и создать session |
| POST | `/auth/logout` | отозвать текущую session |
| GET | `/auth/csrf` | выдать/обновить CSRF token при выбранной реализации |
| GET | `/me` | текущий user и признаки прохождения flow |
| POST | `/me/recovery-credential` | после activation выпустить credential и вернуть code один раз |
| POST | `/me/recovery-credential/replacement` | отозвать старый и один раз выдать новый при живой session |
| POST | `/me/recovery-code-acknowledgement` | подтвердить сохранение code |
| POST | `/me/onboarding-completion` | завершить onboarding идемпотентно |

`POST /auth/anonymous` поддерживает idempotency key, чтобы сетевой retry не создавал
несколько аккаунтов. При уже валидной сессии UI использует `/me`, а не создаёт user.
Первичная выдача recovery credential требует хотя бы одну собственную active
Интенту и отсутствие active credential; иначе возвращает `409`. Replacement требует
живую session, отзывает старый credential и очищает прежний acknowledgement.

### Experiment and intentions

| Method | Path | Purpose |
|---|---|---|
| GET | `/experiment/next` | server-derived доступный следующий шаг или `null` |
| GET | `/intentions` | paginated история только текущего user |
| GET | `/intentions/current` | draft/active текущего user или `null` |
| POST | `/intentions` | создать draft, выбрать Technique и сохранить её snapshot |
| GET | `/intentions/{id}` | получить собственную Интенту |
| PATCH | `/intentions/{id}` | изменить только текст собственного draft |
| POST | `/intentions/{id}/activation` | проверить snapshot и атомарно активировать draft |
| POST | `/intentions/{id}/outcome` | создать единственный Outcome и завершить |
| POST | `/intentions/{id}/reflection-deferral` | продолжить наблюдение и отложить prompt |

Client не передаёт доверенную сумму при создании: он отправляет текст и, при
необходимости, id предложенного шага; backend повторно определяет допустимый шаг.
`activation` и `outcome` принимают idempotency key или имеют естественную
идемпотентную семантику с согласованным повторным response.

Отдельный `/close` не нужен: явное завершение наблюдения создаёт вариант
`POST .../outcome` с `resolution=not_happened|uncertain`. Оно доступно по решению
пользователя, а не по expiration. `reflection_after_days` определяет только мягкий
server-derived prompt (`reflection_due`), не право на завершение и не переход
статуса. Deferral меняет только operational timestamp, не Outcome или lifecycle.

### HTTP semantics

- `401` — нет валидной session;
- `404` — объект отсутствует или не принадлежит пользователю (без enumeration);
- `409` — конфликт состояния/повторный Outcome/уже есть текущая Интента;
- `422` — структурно или доменно неверный input;
- `429` — rate limit;
- ошибки не содержат secret, raw SQL или внутренние stack traces.

Списки paginated с opaque cursor. Версионирование API — path-based. Breaking change
требует `/v2`, additive fields допустимы в `/v1`.

## 9. Content architecture

Root `content/ru` — source files. Каждый JSON имеет `schema_version` и стабильные
ключи, например:

```json
{
  "schema_version": 1,
  "intention": {
    "statement": {
      "v1": "Если в моей жизни неожиданно появятся {amount}, ... {intention_text}"
    }
  }
}
```

`techniques.json` содержит versioned записи `key`, `version`, `title`,
`instruction`, `category`, `active`. Тексты обязаны быть наблюдательными и
нейтральными: они не обещают денег и не приписывают технике причинную силу.

На CI JSON валидируется schema/tests: обязательные ключи, допустимые placeholders,
отсутствие неизвестных параметров и запрещённых продуктовых паттернов. Formatter
не исполняет arbitrary expressions и экранирует значения по контексту отображения.

Разделение ответственности:

- frontend content adapter отдаёт UI copy по ключу;
- backend `ContentService` строит доменно значимые statement;
- backend сохраняет итоговый statement, template key/version и никогда не зависит
  от повторной генерации истории;
- backend выбирает допустимую Technique при создании draft, сразу сохраняет её
  key/version/title/instruction snapshot для показа после записи и проверяет snapshot
  при активации; история не пересобирается из текущего content;
- псевдослучайные второстепенные варианты выбираются CSPRNG при первом выборе и
  сохраняют variant key, если должны быть стабильными;
- будущий AI может реализовать отдельный provider, но доменные use cases не зависят
  от него и MVP provider всегда статический.

## 10. Основные security и privacy risks

| Risk | Mitigation |
|---|---|
| Перебор recovery codes | 100-bit secret, Argon2id, public-id lookup, basic limiter сразу, persistent limiter до public deploy, generic errors |
| Кража session | HTTPS, HttpOnly/Secure/SameSite cookie, token hash, expiry, revocation, rotation |
| CSRF | same-origin, CSRF header/token, Origin/Referer checks, no permissive CORS |
| XSS и утечка намерений | React escaping, запрет raw HTML, CSP, no-store, не логировать user content |
| IDOR / чужие Интенты | каждый repository query scoped по current user; negative authorization tests |
| Изменение active Intention | service state machine, conditional update/lock, DB constraints, immutability tests |
| Race: две текущие Интенты/Outcome | partial unique indexes, unique outcome FK, transaction, idempotency |
| Recovery code в logs/URL | только POST body, request redaction, никогда не query string, no analytics |
| Потеря response одноразовой выдачи | credential replacement при живой session; старый hash отзывается, secret не перечитывается |
| CSRF rotation credential | session + CSRF + Origin check, explicit replacement UX, throttling |
| Timing enumeration | одинаковые ошибки и dummy Argon2 verify для неизвестного public id |
| DB/backup disclosure | минимизация данных, encrypted infrastructure/backups, ограниченные DB roles |
| Mass assignment | explicit Pydantic request DTO; amount/status/user_id не принимаются от client |
| Injection/oversized input | parameterized SQLAlchemy queries, bounds, content-type/body limits |
| Abuse создания аккаунтов | IP/device-agnostic coarse limits без fingerprinting; idempotency |
| Supply-chain/secrets | lockfiles, dependency audit, secret scanning, `.env.example` без секретов |

Не записывать recovery code, cookie, CSRF token или полный приватный пользовательский
текст в access/error logs. Sentry-подобные сервисы, если появятся, требуют redaction.

## 11. Спорные решения, требующие ADR/подтверждения

1. **Same-origin routing.** Рекомендация: `/api` проксируется к FastAPI. Альтернатива
   — отдельный API origin с CORS, но cookie/CSRF становятся сложнее.
2. **Session вместо JWT.** Рекомендация: opaque stateful session с revocation. JWT не
   даёт пользы модульному монолиту и усложняет немедленный logout.
3. **Статус Intention.** Рекомендация: `draft/active/completed/cancelled`, а смысл
   итога хранить в Outcome. Альтернатива из исходного брифа дублирует результат в
   `success/partial/not_happened`.
4. **Money representation.** Рекомендация: minor units `BIGINT`. Для RUB это чуть
   менее наглядно в БД, зато исключает float и готово к валютам с дробной частью.
5. **UUID version.** Рекомендация: UUIDv7 при нативной простой поддержке, иначе v4;
   не добавлять собственную реализацию UUIDv7.
6. **Delayed recovery issuance.** Решение: не создавать credential при anonymous
   signup, а выпускать на готовом `/key` экране после activation. Потерянный response
   лечится replacement при живой session; plaintext нигде не буферизуется.
7. **Rate limiter without Redis.** Рекомендация для публичного MVP — PostgreSQL
   buckets. Для строго локального slice допустим in-process limiter, но до публичного
   deploy его необходимо заменить.
8. **DB trigger immutability.** Рекомендация: service + tests сначала, затем короткий
   trigger как defense in depth, если он останется понятным и тестируемым.
9. **Content shared by two runtimes.** Рекомендация: одни source JSON + валидаторы,
   отдельные тонкие adapters. Не делать общий исполняемый cross-language package.
10. **Next.js rendering.** Рекомендация: преимущественно client interactions после
    bootstrap `/me`; SSR не должен усложнять проксирование cookies без UX-пользы.
11. **Reflection без expiration.** `reflection_after_days` включает только мягкий
    prompt. Никакого автоматического Outcome или закрытия; пользователь может
    продолжать наблюдение сколько угодно.
12. **Technique selection.** Для первого шага рекомендуется явный `technique_id`.
    Server-side выбор из allowlist можно включать позже без изменения lifecycle,
    поскольку снимок уже является частью Intention.
13. **Recovery replacement.** Разрешён только при живой session и отзывает старый
    credential. Это необходимый recovery от потерянного one-time response, но UX
    должен ясно предупреждать, что ранее сохранённый код перестанет работать.

## 12. Implementation plan: vertical slices

Основной application code начинается только после принятия этого анализа.

### Slice 0 — executable foundation

- workspace, pinned toolchains, lint/format/typecheck;
- Next.js и FastAPI health endpoints;
- PostgreSQL Compose, settings, Alembic baseline;
- OpenAPI → generated TS client pipeline;
- content schemas/loaders и CI skeleton.

Результат: обе части запускаются, миграции и contract generation воспроизводимы.

### Milestone 1 — первый полный flow (четыре проверяемых подсреза)

1. **Landing → transparent anonymous session → onboarding.** User/session, basic
   CSRF, validation, ownership и safe logging; credential gate отсутствует.
2. **500 ₽ → draft → paper → basic Technique.** Step/Technique seeds, server-side
   next selection, validated draft, deterministic statement and technique snapshot.
3. **Activation → delayed recovery code → active home.** Atomic state transition,
   one-time issuance/acknowledgement/replacement и immutable snapshots.
4. **Logout → recovery login → same active Intention.** Argon2id, basic rate limit,
   generic errors and E2E auth round trip.

Milestone завершается только после backend critical suite, двух Playwright flow и
ручной проверки 320/375/430 px. Это соответствует шагу 2 исходного задания, но
уменьшает риск посредством интегрируемых подсрезов.

### Slice 2 — Outcome happened

Пошаговая форма → backend validation → единственный Outcome → нейтральное summary.
Добавить race/idempotency и authorization tests.

### Slice 3 — Reflection and user-driven closure

Backend `reflection_due` calculation → мягкий prompt → continue observing либо
явный not happened/uncertain Outcome. Никакого expiration. Тестировать clock и
timezone boundaries.

### Slice 4 — History

Paginated list → detail с immutable snapshot и Outcome → empty/loading/error states.

### Slice 5 — Next intention

Server-selected следующий ExperimentStep → новый draft → повтор того же lifecycle →
состояние исчерпанной лестницы.

### Slice 6 — release hardening

До public deploy: persistent/distributed rate limiting, tuned Argon2 parameters,
CSP/security-header audit, backup/restore exercise, dependency/secret scanning,
accessibility audit, responsive visual QA и production deployment notes. Эти задачи
не блокируют первый executable slice, кроме явно перечисленного ниже baseline.

### Security baseline первого executable slice

Сразу обязательны: OS CSPRNG recovery credential; Argon2id hash без plaintext;
opaque серверная session; ownership в каждом object query; bounded input validation;
basic rate limiting recovery/issuance; redaction секретов; cookie flags,
конфигурируемые для HTTPS production. Более сложное defense in depth выполняется до
public deploy и не задерживает проверку первого end-to-end flow.

## 13. Verification strategy

Backend tests обязаны покрыть создание anonymous account, recovery/invalid code,
session logout, intention create/update/activate, immutability, ownership, outcome,
reflection calculation, Technique snapshot и next-step selection. Integration tests
работают с PostgreSQL, а не SQLite,
чтобы partial indexes, locks и типы совпадали с production.

Frontend component tests покрывают формы и состояния ошибок. Playwright покрывает:

```text
landing → transparent anonymous session → onboarding → 500 ₽ → draft
→ paper → Technique → activation → recovery code → active home
```

и:

```text
logout → recovery code → та же active Intention
```

На каждый change запускать минимально релевантные tests; перед завершением milestone
— lint, typecheck, frontend/backend unit/integration, build и E2E.
