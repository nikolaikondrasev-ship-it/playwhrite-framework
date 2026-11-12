import { readFile } from 'node:fs/promises';
import path from 'node:path';

const files = [
  'playwright.config.ts',
  'src/data/users.ts',
  'src/pages/login.page.ts',
  'src/pages/inventory.page.ts',
  'src/fixtures/test.ts',
  'tests/auth/login.spec.ts',
] as const;

export async function collectSources(root: string): Promise<string> {
  const parts = await Promise.all(
    files.map(async (file) => {
      const text = await readFile(path.join(root, file), 'utf8');
      return `----- ${file} -----\n${text.trim()}`;
    }),
  );

  return parts.join('\n\n');
}
