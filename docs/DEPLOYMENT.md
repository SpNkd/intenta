# Правила деплоя

Этот документ описывает обязательный минимальный порядок первого и повторного
деплоя Интенты. Секреты, private keys и production `.env` в репозиторий не
добавляются.

## Границы доступа

- На сервер добавляется только публичный SSH-ключ разработчика в
  `authorized_keys`. Приватный `id_rsa` никогда не копируется на сервер.
- Доступ к PostgreSQL извне не открывается. База доступна только приложению по
  private Docker network или localhost.
- TLS завершается на ingress/reverse proxy. FastAPI и Next.js не выставляются
  напрямую в интернет.
- В production требуется `APP_ENV=production`, точный HTTPS origin,
  `__Host-intenta_session`, `SESSION_COOKIE_SECURE=true`, независимый сильный
  `RECOVERY_RATE_LIMIT_HMAC_KEY`, trusted-proxy allowlist и явная политика API
  docs. Полный список переменных — в `.env.example`.

## Перед релизом

1. Проверить чистоту planned diff и отсутствие `.env`, ключей, баз данных,
   screenshots и build artifacts.
2. Запустить `pnpm content:validate`, `pnpm generate:api`, `pnpm lint`,
   `pnpm typecheck`, `pnpm test` и `pnpm build`.
3. Зафиксировать версию исходников в commit/tag, который будет развёрнут.
4. Сделать проверяемый backup PostgreSQL и сохранить информацию о точке
   восстановления отдельно от сервера приложения.

## Релиз

1. Доставить на сервер только зафиксированную версию исходников и production
   secrets через защищённое хранилище/файл с правами `0600`.
2. Собрать образы или зависимости на сервере из этой версии.
3. До переключения трафика выполнить `alembic upgrade head` ровно один раз.
4. Запустить приложение за HTTPS ingress, проверить `/health` и основной
   same-origin путь `web → /api/v1/* → API → PostgreSQL`.
5. Проверить в браузере: anonymous session, создание черновика, activation,
   выдачу и recovery вход по коду. Recovery plaintext не записывается в логи.

## Откат

1. При сбое остановить переключение трафика и сохранить логи без секретов.
2. Вернуть предыдущий образ/commit приложения.
3. Базу откатывать только по заранее подготовленному плану конкретной
   миграции. Нельзя автоматически делать downgrade после migration release.
4. Если данные повреждены, восстановить PostgreSQL из последнего проверенного
   backup в отдельную базу, проверить, и только затем переключать приложение.

## После релиза

- Не оставлять SSH password login, если доступ по ключам уже проверен.
- Не хранить production secrets в shell history, system logs или репозитории.
- Перед каждым повторным deploy повторять preflight и проверку backup.
