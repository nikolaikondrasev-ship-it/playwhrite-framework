import { expect, test } from '@playwright/test';
import { converged, parseReview, seats, type ChatModel, type Review } from '../../src/ai/protocol';
import { runReviewLoop } from '../../src/ai/review-loop';

const ready: Review = {
  score: 9,
  ready: true,
  summary: 'Фреймворк на планке, прогон зелёный.',
  disputes: [],
  findings: [],
};

test('разбор рецензии принимает JSON в тексте и считает схождение', () => {
  const parsed = parseReview(`Комментарий модели\n\`\`\`json\n${JSON.stringify(ready)}\n\`\`\``);

  expect(parsed).toEqual(ready);
  expect(converged(parsed)).toBe(true);
  expect(
    converged({
      ...ready,
      findings: [{ severity: 'blocker', file: 'tests/auth/login.spec.ts', issue: 'нет проверки', fix: 'добавить expect' }],
    }),
  ).toBe(false);
  expect(converged({ ...ready, score: 8 })).toBe(false);
  expect(converged({ ...ready, disputes: ['спор о локаторе'] })).toBe(false);
});

test('роли по кругу меняются, и цикл останавливается на судье', async () => {
  const order: string[] = [];
  const models = [model('gemini'), model('groq'), model('openrouter')];

  const result = await runReviewLoop({
    models,
    source: 'код',
    evidence: '3 passed',
    maxRounds: 3,
    pauseMs: 0,
    pause: async () => undefined,
  });

  expect(order).toEqual(['gemini', 'groq', 'openrouter', 'groq', 'openrouter', 'gemini']);
  expect(seats(0, models).author.id).toBe('gemini');
  expect(seats(1, models).author.id).toBe('groq');
  expect(result.rounds).toHaveLength(2);
  expect(result.converged).toBe(true);
  expect(result.final.ready).toBe(true);

  function model(id: string): ChatModel {
    return {
      id,
      label: id,
      model: id,
      async complete(system: string, user: string) {
        expect(system).toContain('score');
        order.push(id);
        const round = user.includes('Предыдущий ответ отклонён') ? 'repair' : (user.match(/Круг/)?.[0] ?? 'call');
        expect(round).not.toBe('repair');
        const calls = order.filter((item) => item === id).length;
        const closed = id === 'gemini' && calls === 2;
        return JSON.stringify(
          closed
            ? ready
            : {
                score: 7,
                ready: false,
                summary: `${id} ещё видит открытый вопрос.`,
                disputes: id === 'groq' ? ['автор завысил оценку'] : [],
                findings: [],
              },
        );
      },
    };
  }
});
