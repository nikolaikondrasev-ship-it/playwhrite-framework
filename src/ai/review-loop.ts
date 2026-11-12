import { authorPrompt, criticPrompt, judgePrompt, systemPrompt } from './prompts';
import { converged, parseReview, seats, type ChatModel, type Review } from './protocol';

export type Voice = {
  readonly role: 'author' | 'critic' | 'judge';
  readonly label: string;
  readonly model: string;
  readonly review: Review;
};

export type RoundTranscript = {
  readonly round: number;
  readonly voices: readonly Voice[];
};

export type LoopResult = {
  readonly rounds: readonly RoundTranscript[];
  readonly final: Review;
  readonly converged: boolean;
};

type LoopOptions = {
  readonly models: readonly ChatModel[];
  readonly source: string;
  readonly evidence: string;
  readonly maxRounds?: number;
  readonly pauseMs?: number;
  readonly pause?: (ms: number) => Promise<void>;
  readonly onVoice?: (round: number, voice: Voice) => void;
};

export async function runReviewLoop(options: LoopOptions): Promise<LoopResult> {
  const maxRounds = options.maxRounds ?? 3;
  const pause = options.pause ?? delay;
  const pauseMs = options.pauseMs ?? 2_000;
  const rounds: RoundTranscript[] = [];
  let previous: Review | null = null;

  for (let index = 0; index < maxRounds; index += 1) {
    const round = index + 1;
    const { author, critic, judge } = seats(round - 1, options.models);
    const voices: Voice[] = [];

    const authorReview = await ask(
      author,
      authorPrompt(options.source, options.evidence, previous ? JSON.stringify(previous) : null),
    );
    voices.push(publish(options, round, voice('author', author, authorReview)));
    await pause(pauseMs);

    const criticReview = await ask(critic, criticPrompt(options.source, options.evidence, JSON.stringify(authorReview)));
    voices.push(publish(options, round, voice('critic', critic, criticReview)));
    await pause(pauseMs);

    const judgeReview = await ask(
      judge,
      judgePrompt(options.source, options.evidence, JSON.stringify(authorReview), JSON.stringify(criticReview)),
    );
    voices.push(publish(options, round, voice('judge', judge, judgeReview)));

    rounds.push({ round, voices });
    previous = judgeReview;

    if (converged(judgeReview) || round === maxRounds) {
      return { rounds, final: judgeReview, converged: converged(judgeReview) };
    }

    await pause(pauseMs);
  }

  throw new Error('Круг рецензий завершился без итога');
}

async function ask(model: ChatModel, user: string): Promise<Review> {
  const first = await model.complete(systemPrompt, user);
  try {
    return parseReview(first);
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'ответ не разобран';
    const second = await model.complete(
      systemPrompt,
      `${user}\n\nПредыдущий ответ отклонён: ${reason}. Верни только один JSON-объект по схеме.`,
    );
    return parseReview(second);
  }
}

function voice(role: Voice['role'], model: ChatModel, review: Review): Voice {
  return { role, label: model.label, model: model.model, review };
}

function publish(options: LoopOptions, round: number, item: Voice): Voice {
  options.onVoice?.(round, item);
  return item;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}