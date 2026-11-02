# AntyObzhelp

Система кадрового подразделения: **Google Forms → сервер → VK-бот (руководство) → очередь обзвонщиков → проверка → история и отчёты.**

Стек: Next.js 16 (App Router, Route Handlers), React 19, TypeScript, Tailwind CSS 4, компоненты в стиле shadcn/ui на Radix, Framer Motion, TanStack Query, Recharts, Prisma 7 + PostgreSQL, Zod, SSE.

## Быстрый старт (локально, Windows)

Нужен только Node.js ≥ 20.19. Docker и установленный PostgreSQL не требуются — используется встроенный PostgreSQL (`embedded-postgres`), данные хранятся в `%LOCALAPPDATA%\antyobzhelp\pgdata`.

```powershell
npm install
copy .env.example .env        # заполните SESSION_SECRET, SETUP_TOKEN, GOOGLE_FORMS_SECRET
npm run db:local              # терминал 1: PostgreSQL на порту 5433 (держите открытым)
npm run db:migrate            # терминал 2: применить миграции
npm run db:seed               #             должности и разрешения по умолчанию
npm run dev                   #             http://localhost:3000
```

Без настроенного VK ID можно войти через «Тестовый вход» на странице `/login` — только при `DEV_LOGIN_ENABLED=true` и не в production.

Первый администратор: войдите, откройте «Первоначальная настройка администратора» и введите `SETUP_TOKEN`. Работает, только пока нет активного администратора; права первому пользователю автоматически не выдаются.

## Команды

| Команда | Назначение |
|---|---|
| `npm run dev` | dev-сервер |
| `npm run build` / `npm start` | production-сборка и запуск |
| `npm run typecheck` | проверка TypeScript |
| `npm run lint` | ESLint |
| `npm test` | тесты (Vitest, реальная PostgreSQL — база `antyobzhelp_test`) |
| `npm run smoke` | сквозная проверка по HTTP против запущенного dev-сервера (только локальная БД) |
| `npm run db:backup` | резервная копия (pg_dump или JSON) в `./backups` |

## Документация

- [docs/DEPLOY.md](docs/DEPLOY.md) — публикация на Vercel + Supabase, ограничения бесплатных тарифов, резервные копии.
- [docs/VK.md](docs/VK.md) — VK ID (вход) и VK-бот сообщества (Callback API).
- [docs/GOOGLE_FORMS.md](docs/GOOGLE_FORMS.md) — подключение формы через Google Apps Script.
- [docs/DISCORD_API.md](docs/DISCORD_API.md) — API для будущего Discord-бота.
- [PROGRESS.md](PROGRESS.md) — что сделано, что осталось.

## Ключевые правила

- Кандидатам **не отправляется никаких автоматических сообщений**. VK-бот пишет только активным сотрудникам; сообщения не-сотрудников игнорируются.
- Автоотказ `AUTO_REJECTED_COOLDOWN`: после результата обзвона «Не прошёл» повторная подача возможна через 120 часов (настраивается). Ограничение отсчитывается от серверного времени завершения обзвона, ровно 120 ч — уже разрешено. Отказ руководства, перенос, отказ кандидата и отмена ограничений не создают.
- Ссылка на VK в анкете не доказывает владение аккаунтом. В режиме STRICT (по умолчанию) совпадение по неподтверждённой ссылке отправляет заявку на ручную проверку VK ID. Подтверждённый VK — код со страницы `/link` (кандидат входит через VK ID).
- Права проверяются на сервере (RBAC), решения через VK-бота — дополнительно по флагам «Руководства КП», заново при каждом нажатии.
