const schema = `{
  "score": 0,
  "ready": false,
  "summary": "одна-две фразы о качестве фреймворка",
  "disputes": [],
  "findings": [
    {"severity": "blocker", "file": "путь из комплекта", "issue": "что не так", "fix": "минимальная правка"}
  ]
}`;

export const systemPrompt = `Ты рецензент автотестов Playwright + TypeScript.
Оцениваешь только приложенный код и лог прогона. Не выдумывай файлы, локаторы и падения.
Планка готова: Page Object с действиями на страницах и проверками в тестах, локаторы getByRole/getByTestId, web-first assertions, нет waitForTimeout и хрупких CSS/XPath, тесты изолированы, в логе нет упавших тестов.
score — целое или десятые от 0 до 10. ready=true только при score >= 9, пустых disputes, без severity=blocker и зелёном прогоне.
Верни один JSON-объект без текста вокруг:
${schema}`;

export function authorPrompt(source: string, evidence: string, previous: string | null): string {
  const history = previous
    ? `Итог прошлого круга, его нужно перепроверить, а не пересказать:\n${previous}`
    : 'Это первый круг. Предыдущего судьи нет.';

  return `${history}

Код фреймворка:
${source}

Лог прогона:
${evidence}

Ты автор рецензии. Найди реальные дефекты качества тестов. Если комплект уже на планке и прогон зелёный, верни ready=true, disputes=[] и findings=[].`;
}

export function criticPrompt(source: string, evidence: string, authorJson: string): string {
  return `Код фреймворка:
${source}

Лог прогона:
${evidence}

Рецензия автора:
${authorJson}

Ты критик автора, не второй независимый список пожеланий.
disputes — только утверждения автора, которые противоречат коду или логу. Если автор прав, оставь disputes пустым.
findings — только проблемы, которые автор пропустил. Не копируй его замечания.
score — твоя оценка самого фреймворка.`;
}

export function judgePrompt(source: string, evidence: string, authorJson: string, criticJson: string): string {
  return `Код фреймворка:
${source}

Лог прогона:
${evidence}

Автор:
${authorJson}

Критик:
${criticJson}

Ты судья этого круга. Сверь оба ответа с кодом.
Закрой спор, если одна сторона подтверждается кодом: не переноси его в disputes.
Оставь в disputes только то, что по коду решить нельзя.
В findings оставь только подтверждённые проблемы. ready=true запрещён, пока есть открытый спор, blocker или упавший прогон.`;
}
