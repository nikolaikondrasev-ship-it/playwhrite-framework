import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import { createModels, MissingModelKeysError } from './providers';
import { runReviewLoop, type RoundTranscript, type Voice } from './review-loop';
import { collectSources } from './sources';
import type { Review } from './protocol';

const root = path.resolve(__dirname, '../..');
dotenv.config({ path: path.join(root, '.env'), quiet: true });

async function main(): Promise<void> {
  const models = createModels();
  const maxRounds = readRounds(process.env.REVIEW_ROUNDS);
  const evidence = await runPlaywright(root);
  const source = await collectSources(root);
  const result = await runReviewLoop({
    models,
    source,
    evidence: evidence.output,
    maxRounds,
    onVoice: (round, item) => {
      console.log(`Круг ${round}, ${roleName(item.role)} ${item.label}: ${item.review.score}/10`);
    },
  });

  const ideal = evidence.ok && result.converged;
  const report = renderReport({
    models: models.map((model) => `${model.label} (${model.model})`),
    testsOk: evidence.ok,
    resultRounds: result.rounds,
    final: result.final,
    ideal,
  });
  const reportPath = path.join(root, 'ai-review', 'consensus.md');
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, report, 'utf8');

  console.log(report);
  console.log(`\nОтчёт: ${reportPath}`);
  process.exitCode = ideal ? 0 : 2;
}

function readRounds(value: string | undefined): number {
  const parsed = Number(value ?? 3);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 5) {
    throw new Error('REVIEW_ROUNDS должен быть целым от 1 до 5');
  }
  return parsed;
}

function runPlaywright(cwd: string): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['playwright', 'test', '--reporter=line'], {
      cwd,
      shell: true,
      env: process.env,
    });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('Прогон Playwright превысил 2 минуты'));
    }, 120_000);

    let output = '';
    child.stdout.on('data', (chunk: Buffer) => {
      output += String(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      output += String(chunk);
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      const text = output.trim().slice(-3000);
      resolve({
        ok: code === 0,
        output: text === '' ? 'Лог прогона пуст' : text,
      });
    });
  });
}

function renderReport(input: {
  models: readonly string[];
  testsOk: boolean;
  resultRounds: readonly RoundTranscript[];
  final: Review;
  ideal: boolean;
}): string {
  const rounds = input.resultRounds
    .map((round) => {
      const voices = round.voices
        .map((item) => `### ${roleName(item.role)} — ${item.label} / ${item.model}\n\n${renderReview(item.review)}`)
        .join('\n\n');
      return `## Круг ${round.round}\n\n${voices}`;
    })
    .join('\n\n');

  return `# Циклическая проверка

Модели: ${input.models.join('; ')}
Прогон Playwright: ${input.testsOk ? 'зелёный' : 'есть падения'}
Кругов: ${input.resultRounds.length}
Итог судьи: ${input.final.score}/10, ready=${input.final.ready ? 'true' : 'false'}
Сошлись: ${input.ideal ? 'да' : 'нет'}

${rounds}

## Итог

${renderReview(input.final)}
`;
}

function renderReview(review: Review): string {
  const disputes = review.disputes.length > 0 ? review.disputes.map((item) => `- ${item}`).join('\n') : '- споров нет';
  const findings =
    review.findings.length > 0
      ? review.findings.map((item) => `- [${item.severity}] \`${item.file}\`: ${item.issue} → ${item.fix}`).join('\n')
      : '- замечаний нет';

  return [`Оценка: ${review.score}/10`, `Готово: ${review.ready ? 'да' : 'нет'}`, review.summary, '', 'Споры:', disputes, '', 'Замечания:', findings].join(
    '\n',
  );
}

function roleName(role: Voice['role']): string {
  if (role === 'author') return 'Автор';
  if (role === 'critic') return 'Критик';
  return 'Судья';
}

main().catch((error: unknown) => {
  if (error instanceof MissingModelKeysError) {
    console.error(error.message);
  } else if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error('Проверка остановилась');
  }
  process.exitCode = 1;
});