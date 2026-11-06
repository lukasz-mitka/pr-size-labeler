import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

const metadata = parse(readFileSync(new URL('../action.yml', import.meta.url), 'utf8')) as {
  inputs: Record<string, { default: string }>;
};

export function inputEnvironment(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const defaults = Object.fromEntries(
    Object.entries(metadata.inputs).map(([name, input]) => [
      `INPUT_${name.toUpperCase()}`,
      name === 'GITHUB_TOKEN'
        ? 'test-token'
        : name === 'github_api_url'
          ? (overrides.GITHUB_API_URL ?? 'https://api.github.com')
          : input.default,
    ]),
  );
  return {
    ...Object.fromEntries(
      Object.entries(process.env).filter(([name]) => !name.startsWith('INPUT_')),
    ),
    ...defaults,
    ...overrides,
  };
}
