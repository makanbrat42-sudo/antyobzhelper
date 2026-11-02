# Публикация

Рекомендуемая бесплатная схема для 5–10 сотрудников: **Vercel Hobby** (сайт + все webhook-эндпоинты) и **Supabase Free** (PostgreSQL). Отдельный постоянно работающий сервер не нужен: VK Callback API и Google Apps Script вызывают обычные HTTP-эндпоинты.

## Проверенные условия тарифов (ноябрь 2026)

| Что | Условие | Как учтено в проекте |
|---|---|---|
| Vercel Hobby — назначение | Тариф для личного некоммерческого использования ([Hobby plan](https://vercel.com/docs/accounts/plans/hobby)) | Если проект коммерческий — нужен Pro ($20/мес). Решите сами. |
| Vercel Hobby — cron | Только раз в сутки ([Cron usage](https://vercel.com/docs/cron-jobs/usage-and-pricing)) | `vercel.json`: обслуживание в 03:00 UTC (очистка, повтор неудачных доставок VK). |
| Vercel — длительность функций | До 300 с на Hobby ([Functions limits](https://vercel.com/docs/functions/limitations)) | SSE-соединение живёт 50 с и переподключается. |
| Vercel — при превышении лимитов | Функция недоступна до сброса периода ([Hobby plan](https://vercel.com/docs/accounts/plans/hobby)) | Риск — см. ниже. |
| Supabase Free | 500 МБ БД, 2 проекта, пауза после 7 дней без активности, без бэкапов ([Pricing](https://supabase.com/pricing)) | Ежедневный cron обращается к БД → проект не засыпает. Бэкапы — GitHub Actions. |

*Условия пересказаны по официальным страницам; перед публикацией сверьтесь с ними — тарифы меняются.*

### Риски бесплатного варианта
- **SSE и лимиты Vercel.** Каждая открытая вкладка держит функцию `/api/events` до 50 с подряд. Для 5–10 сотрудников это укладывается в типичные лимиты, но расход зависит от того, сколько вкладок открыто весь день. Следите за Usage в панели Vercel. Если лимит близок — интерфейс всё равно работает: данные обновляются при фокусе окна и периодически (очередь — раз в 30 с).
- **Холодный старт.** Первая функция после простоя отвечает 1–3 с. VK ждёт ответ Callback API несколько секунд и повторяет событие при неудаче; повторы отсекаются по `event_id`.
- **Supabase без бэкапов.** Настройте workflow `.github/workflows/backup.yml` (ниже).

Если нужна гарантированная доступность или коммерческое использование: Vercel Pro + Supabase Pro ($25/мес, ежедневные бэкапы), либо VPS (~5 €/мес) с `npm run build && npm start` и PostgreSQL.

## Шаги (требуют ваших аккаунтов)

> Я не создаю аккаунты и не публикую проект без вашего подтверждения. Все шаги ниже выполняете вы.

1. **Git и GitHub.** Локальный репозиторий уже создан (ветка `main`, файлы добавлены в индекс). Укажите своё имя и почту, сделайте первый коммит и отправьте в **приватный** репозиторий — команды в разделе «Загрузка на GitHub» ниже.
2. **Supabase.** Создайте проект (регион **Frankfurt / eu-central-1** — рядом с функциями Vercel `fra1`). Кнопка **Connect** на странице проекта:
   - `DATABASE_URL` — **Transaction pooler** (порт 6543), строка как есть, с вашим паролем. Дополнительно задайте `DB_POOL_MAX=2` (размер пула на одну функцию).
   - `DIRECT_URL` — **Session pooler** (порт 5432). Обязательно: через него идут миграции при каждом деплое. Direct connection подходит только при наличии IPv6/IPv4 add-on.
3. **Vercel.** Add New → Project → импорт репозитория из GitHub. Framework — Next.js. Build Command оставьте по умолчанию: Vercel сам выполнит скрипт `vercel-build` (prisma generate → migrate deploy → seed → next build). Регион функций — `fra1` (`vercel.json`, Hobby допускает один регион).
4. **Переменные окружения в Vercel** (Settings → Environment Variables) — все из `.env.example`. Отметьте для них только окружение **Production**: preview-деплои тоже запускают миграции, и с общими переменными они меняли бы рабочую базу.
   - `APP_URL` = `https://<проект>.vercel.app` (без `/` в конце)
   - `SESSION_SECRET` — 32+ случайных символа: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`
   - `SETUP_TOKEN` — случайная строка; удалите после назначения администратора
   - `GOOGLE_FORMS_SECRET`, `CRON_SECRET` — случайные строки
   - VK-переменные — см. [VK.md](VK.md)
   - **Не задавайте** `DEV_LOGIN_ENABLED` в production (в production он и так игнорируется).
5. Задеплойте, откройте сайт, войдите через VK ID, откройте `/setup` и введите `SETUP_TOKEN`.
6. Настройте VK-бота и Google Forms ([VK.md](VK.md), [GOOGLE_FORMS.md](GOOGLE_FORMS.md)).

## Резервные копии

- **Автоматически:** GitHub → Settings → Secrets → Actions → `DATABASE_BACKUP_URL` (прямое подключение Supabase, порт 5432). Workflow `backup.yml` каждый день делает `pg_dump` и хранит артефакт 30 дней. Репозиторий должен быть приватным — в дампе персональные данные.
- **Вручную:** `npm run db:backup` (нужен `DIRECT_URL`). Восстановление дампа: `pg_restore --clean --no-owner -d "<url>" файл.dump`.
- Перед изменением схемы на production делайте копию, затем `npm run db:migrate`.

## Загрузка на GitHub

Git установлен (`C:\Program Files\Git`). Если команда `git` не находится в терминале Kiro — перезапустите Kiro, чтобы обновился PATH.

```powershell
# 1. Один раз: имя и почта для коммитов (почта как в аккаунте GitHub или ...@users.noreply.github.com)
git config --global user.name "Ваше имя"
git config --global user.email "you@example.com"

# 2. Проверить, что в коммит не попадают .env, node_modules, .next, backups
git status

# 3. Первый коммит
git commit -m "AntyObzhelp: первая версия"

# 4. На github.com: New repository → имя antyobzhelp → Private → без README/.gitignore/license → Create
#    Затем подключить и отправить (подставьте свой логин):
git remote add origin https://github.com/<логин>/antyobzhelp.git
git push -u origin main
```

При первом `git push` откроется окно входа в GitHub (Git Credential Manager) — войдите в браузере. Пароль в терминал вводить не нужно.
