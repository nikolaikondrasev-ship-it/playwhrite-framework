# Playwright login framework

Автотесты входа на [Sauce Demo](https://www.saucedemo.com): неверные данные показывают ошибку, верные открывают каталог товаров.

`example.com` из шаблона задачи не содержит форму входа. Sauce Demo — публичный стенд с контрактом `data-test`, поэтому локаторы стабильные, а сценарий реально выполняется.

## Запуск

```bash
npm install
npx playwright install chromium
npm test
```

Отчёт: `npm run report`. Режим с браузером: `npm run test:headed`.

Учётные данные демо подставляются по умолчанию (`standard_user` / `secret_sauce`). Свой стенд — скопируйте `.env.example` в `.env`.

## Структура

- `playwright.config.ts` — `baseURL`, `testIdAttribute: data-test`, trace при ретрае
- `src/pages` — Page Object: действия пользователя, локаторы наружу
- `src/fixtures/test.ts` — фикстуры страниц, тесты импортируют `test` и `expect` отсюда
- `src/data/users.ts` — данные и ожидаемые тексты
- `tests/auth/login.spec.ts` — проверки: ошибка, успешный вход, ошибка и сразу успешный вход
- `src/ai` — круг из трёх бесплатных моделей: Gemini, Groq и OpenRouter

## Круг моделей

`npm run review` сначала гоняет Playwright, затем три модели по очереди читают код и лог. В каждом круге роли сдвигаются: автор, критик предыдущего ответа, судья обоих. Следующий круг начинается с другой модели. Остановка — когда судья ставит не меньше 9/10, без блокеров и открытых споров, и прогон зелёный. Не больше `REVIEW_ROUNDS` (по умолчанию 3). Отчёт пишется в `ai-review/consensus.md`.

Ключи бесплатных тарифов лежат в `.env` (см. `.env.example`): [Google AI Studio](https://aistudio.google.com/apikey), [Groq](https://console.groq.com/keys), [OpenRouter](https://openrouter.ai/keys). Модели правят отчёт, исходники тестов остаются как есть.
