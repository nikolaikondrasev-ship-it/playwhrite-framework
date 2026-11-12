import type { ChatModel } from './protocol';

type ModelTarget = {
  readonly label: string;
  readonly url: string;
  readonly keyEnv: string;
  readonly model: string;
  readonly extraHeaders?: Record<string, string>;
};

type AgentSlot = {
  readonly id: string;
  readonly label: string;
  readonly targets: readonly ModelTarget[];
};

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_HEADERS = {
  'HTTP-Referer': 'http://localhost/playwright-login-framework',
  'X-Title': 'playwright-login-framework',
};

const slots: readonly AgentSlot[] = [
  {
    id: 'agent-1',
    label: 'Agent 1 (Gemini -> Fallback)',
    targets: [
      {
        label: 'Gemini 3.8 Flash',
        url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
        keyEnv: 'GEMINI_API_KEY',
        model: process.env.GEMINI_MODEL?.trim() || 'gemini-3.8-flash',
      },
      {
        label: 'Google Gemini via OpenRouter',
        url: OPENROUTER_URL,
        keyEnv: 'OPENROUTER_API_KEY',
        model: 'google/gemini-2.0-flash-001',
        extraHeaders: OPENROUTER_HEADERS,
      },
      {
        label: 'Llama 3.3 70B (OpenRouter)',
        url: OPENROUTER_URL,
        keyEnv: 'OPENROUTER_API_KEY',
        model: 'meta-llama/llama-3.3-70b-instruct',
        extraHeaders: OPENROUTER_HEADERS,
      },
    ],
  },
  {
    id: 'agent-2',
    label: 'Agent 2 (Claude -> Fallback)',
    targets: [
      {
        label: 'Claude 3.5 Sonnet',
        url: OPENROUTER_URL,
        keyEnv: 'OPENROUTER_API_KEY',
        model: process.env.OPENROUTER_MODEL?.trim() || 'anthropic/claude-3.5-sonnet',
        extraHeaders: OPENROUTER_HEADERS,
      },
      {
        label: 'DeepSeek V3 (Fallback)',
        url: OPENROUTER_URL,
        keyEnv: 'OPENROUTER_API_KEY',
        model: 'deepseek/deepseek-chat',
        extraHeaders: OPENROUTER_HEADERS,
      },
    ],
  },
  {
    id: 'agent-3',
    label: 'Agent 3 (DeepSeek / Qwen)',
    targets: [
      {
        label: 'DeepSeek V3',
        url: OPENROUTER_URL,
        keyEnv: 'OPENROUTER_API_KEY',
        model: 'deepseek/deepseek-chat',
        extraHeaders: OPENROUTER_HEADERS,
      },
      {
        label: 'Qwen 2.5 72B',
        url: OPENROUTER_URL,
        keyEnv: 'OPENROUTER_API_KEY',
        model: 'qwen/qwen-2.5-72b-instruct',
        extraHeaders: OPENROUTER_HEADERS,
      },
    ],
  },
];

export class MissingModelKeysError extends Error {
  readonly missing: readonly string[];

  constructor(missing: readonly string[]) {
    super(`Нет ни одного рабочего ключа в .env. Нужен хотя бы OPENROUTER_API_KEY (и опционально GEMINI_API_KEY).`);
    this.name = 'MissingModelKeysError';
    this.missing = missing;
  }
}

export function createModels(env: NodeJS.ProcessEnv = process.env): ChatModel[] {
  const models: ChatModel[] = [];

  for (const slot of slots) {
    const availableTargets = slot.targets.filter((t) => Boolean(env[t.keyEnv]?.trim()));
    if (availableTargets.length === 0) continue;

    models.push({
      id: slot.id,
      label: slot.label,
      model: availableTargets[0].model,
      complete: (system, user) => chatWithFallback(slot.label, availableTargets, env, system, user),
    });
  }

  if (models.length < 2) {
    throw new MissingModelKeysError(['OPENROUTER_API_KEY']);
  }

  return models;
}

async function chatWithFallback(
  slotLabel: string,
  targets: readonly ModelTarget[],
  env: NodeJS.ProcessEnv,
  system: string,
  user: string,
): Promise<string> {
  const errors: string[] = [];

  for (const target of targets) {
    const key = env[target.keyEnv]?.trim() ?? '';
    if (!key) continue;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await fetch(target.url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
            ...target.extraHeaders,
          },
          body: JSON.stringify({
            model: target.model,
            temperature: 0.2,
            max_tokens: 1500,
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: user },
            ],
          }),
          // Жесткий таймаут 25 сек на попытку, чтобы не висеть вечно
          signal: AbortSignal.timeout(25_000),
        });

        if (response.status === 429 || response.status === 503 || response.status >= 500) {
          const text = await response.text();
          errors.push(`${target.label} (${response.status}): ${text.slice(0, 120)}`);
          await delay(1_500);
          continue;
        }

        const body = await response.text();
        if (!response.ok) {
          errors.push(`${target.label} (${response.status}): ${body.slice(0, 150)}`);
          break; // 400/401/404 не ретраим, сразу идем к следующей модели
        }

        return readMessage(body, target.label);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${target.label} (net/timeout): ${msg}`);
        await delay(1_000);
      }
    }
  }

  throw new Error(`[${slotLabel}] Все резервные модели недоступны:\n${errors.join('\n')}`);
}

function readMessage(body: string, label: string): string {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new Error(`${label} вернул не JSON`);
  }

  if (!payload || typeof payload !== 'object') {
    throw new Error(`${label} вернул пустой ответ`);
  }

  const choices = (payload as { choices?: unknown }).choices;
  const first = Array.isArray(choices) ? choices[0] : undefined;
  if (!first || typeof first !== 'object') {
    throw new Error(`${label} не прислал choices`);
  }

  const message = (first as { message?: unknown }).message;
  let text = messageText(message);

  if (text.trim() === '') {
    throw new Error(`${label} прислал пустой текст`);
  }

  const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (match) {
    text = match[1];
  } else {
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      text = text.substring(firstBrace, lastBrace + 1);
    }
  }

  return text.trim();
}

function messageText(message: unknown): string {
  if (!message || typeof message !== 'object') return '';

  const content = (message as { content?: unknown }).content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (!part || typeof part !== 'object' || !('text' in part)) return '';
        return String((part as { text: unknown }).text);
      })
      .join('');
  }

  const reasoning = (message as { reasoning?: unknown }).reasoning;
  return typeof reasoning === 'string' ? reasoning : '';
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}