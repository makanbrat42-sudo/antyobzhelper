# API для будущего Discord-бота

Discord-бот пока не разработан. Сервер готов к подключению.

## Авторизация

Администратор создаёт сервисный токен в «API и Discord» и выбирает права (scopes). Токен показывается один раз, в базе хранится только SHA-256 хеш. Бот передаёт `Authorization: Bearer aoh_svc_…`. Токен не связан с учётной записью администратора и может быть отозван.

| Scope | Назначение |
|---|---|
| `discord.link` | привязка Discord ↔ подтверждённый VK |
| `discord.read` | чтение заявки кандидата / заявок сотрудника по Discord ID |
| `discord.voice` | события голосового канала обзвона |

## Эндпоинты

`POST /api/service/discord/link` — `{ "code": "ABCD-EFGH", "discordId": "123…" }`
Кандидат проходит VK ID на `/link` (бот может дать ему ссылку), получает код и отправляет его боту. Discord ID привязывается только к VK ID, подтверждённому через OAuth.

`GET /api/service/discord/lookup?kind=candidate&discordId=…` → кандидат, активная заявка, закреплённый обзвонщик (с его `discordId`).

`GET /api/service/discord/lookup?kind=staff&discordId=…` → сотрудник (Discord ID указывается в профиле) и его заявки в работе.

`POST /api/service/discord/voice` — `{ "applicationId": 1052, "type": "CHANNEL_CREATED" | "CALLER_JOINED" | "CANDIDATE_JOINED" | "CHANNEL_DELETED", "channelId": "…" }`
Пишет событие в хронологию заявки; ID канала сохраняется в активном обзвоне.

## Планируемый сценарий бота

1. Кандидат заходит на сервер → бот предлагает подтвердить VK по ссылке `/link`.
2. Кандидат отправляет код → `link`.
3. Бот находит заявку → `lookup`, создаёт временный голосовой канал → `voice CHANNEL_CREATED`.
4. Входит обзвонщик → `voice CALLER_JOINED`. Начало/завершение обзвона и результат сейчас фиксируются на сайте; при разработке бота можно добавить сервисные эндпоинты start/finish на базе `startCall`/`finishCall` (`src/server/services/calls.ts`).
5. После завершения бот удаляет канал → `voice CHANNEL_DELETED`.
