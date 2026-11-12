import { createHash } from 'node:crypto';

export type ChatModel = {
  readonly id: string;
  readonly label: string;
  readonly model: string;
  readonly complete: (system: string, user: string) => Promise<string>;
};

export type FindingSeverity = 'low' | 'medium' | 'high' | 'critical';

export type Finding = {
  readonly file: string;
  readonly issue: string;
  readonly fix: string;
  readonly severity: FindingSeverity;
};

export type Review = {
  readonly score: number;
  readonly ready: boolean;
  readonly summary: string;
  readonly disputes: readonly string[];
  readonly findings: readonly Finding[];
};

export function seats(roundIndex: number, models: readonly ChatModel[]): { author: ChatModel; critic: ChatModel; judge: ChatModel } {
  const n = models.length;
  if (n < 2) {
    throw new Error('В круге должно быть как минимум 2 модели');
  }
  return {
    author: models[roundIndex % n],
    critic: models[(roundIndex + 1) % n],
    judge: models[(roundIndex + 2) % n],
  };
}

export function converged(review: Review): boolean {
  return review.score >= 9 && review.ready && review.findings.length === 0;
}

export function parseReview(raw: string): Review {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Не удалось распарсить JSON ревью: ${error instanceof Error ? error.message : 'неизвестная ошибка'}`);
  }

  if (!json || typeof json !== 'object') {
    throw new Error('Ревью не является объектом');
  }

  const obj = json as Record<string, unknown>;

  const score = Number(obj.score);
  if (!Number.isInteger(score) || score < 0 || score > 10) {
    throw new Error('Поле score должно быть целым числом от 0 до 10');
  }

  const ready = Boolean(obj.ready);

  const summary = typeof obj.summary === 'string' ? obj.summary.trim() : '';
  if (!summary) {
    throw new Error('Поле summary обязательно и должно быть строкой');
  }

  const disputes = Array.isArray(obj.disputes)
    ? obj.disputes.map((item) => String(item).trim()).filter(Boolean)
    : [];

  const findingsRaw = Array.isArray(obj.findings) ? obj.findings : [];
  const findings: Finding[] = [];

  for (const item of findingsRaw) {
    if (!item || typeof item !== 'object') continue;
    const f = item as Record<string, unknown>;
    const file = typeof f.file === 'string' ? f.file.trim() : 'unknown';
    const issue = typeof f.issue === 'string' ? f.issue.trim() : '';
    const fix = typeof f.fix === 'string' ? f.fix.trim() : '';
    const severityRaw = typeof f.severity === 'string' ? f.severity.trim() : 'medium';
    const severity: FindingSeverity = ['low', 'medium', 'high', 'critical'].includes(severityRaw)
      ? (severityRaw as FindingSeverity)
      : 'medium';

    if (issue && fix) {
      findings.push({ file, issue, fix, severity });
    }
  }

  return {
    score,
    ready,
    summary,
    disputes,
    findings,
  };
}

export function hashSource(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 12);
}