import { readFile } from 'node:fs/promises';

const defaultMessage =
  'This PR exceeds the recommended size of 1000 lines. ' +
  'Please make sure you are NOT addressing multiple issues with one PR. ' +
  'Note this PR might be rejected due to its size.\n';

export async function readOptions(env = process.env) {
  const input = (name, fallback = '') => env[`INPUT_${name.toUpperCase()}`] ?? fallback;
  const required = (name) => {
    if (!env[name]?.trim()) throw new Error(`Missing required environment variable: ${name}`);
    return env[name].trim();
  };
  const boolean = (name) => {
    const value = input(name, 'false').trim();
    if (!['true', 'false'].includes(value)) throw new Error(`${name} must be true or false`);
    return value === 'true';
  };

  const repository = required('GITHUB_REPOSITORY');
  if (!/^[^/\s]+\/[^/\s]+$/.test(repository))
    throw new Error('GITHUB_REPOSITORY must be owner/repository');
  const event = JSON.parse(await readFile(required('GITHUB_EVENT_PATH'), 'utf8'));
  const number = event.pull_request?.number;
  if (!Number.isSafeInteger(number) || number <= 0) throw new Error('Not a pull request event');

  const token = input('GITHUB_TOKEN').trim();
  if (!token) throw new Error('GITHUB_TOKEN input is required');
  const apiUrl = input('github_api_url', env.GITHUB_API_URL ?? 'https://api.github.com').trim();
  if (!['http:', 'https:'].includes(new URL(apiUrl).protocol))
    throw new Error('Invalid github_api_url');

  const sizes = ['xs', 's', 'm', 'l', 'xl'].map((size, index) => {
    const label = input(`${size}_label`, `size/${size}`).trim();
    if (!label) throw new Error(`${size}_label must not be empty`);
    let max = Infinity;
    if (size !== 'xl') {
      const value = input(`${size}_max_size`, ['10', '100', '500', '1000'][index]).trim();
      max = Number(value);
      if (!/^\d+$/.test(value) || !Number.isSafeInteger(max)) {
        throw new Error(`${size}_max_size must be a non-negative safe integer`);
      }
    }
    return { label, max };
  });

  return {
    repository,
    number,
    token,
    apiUrl,
    sizes,
    filesToIgnore: input('files_to_ignore').trim().split(/\s+/).filter(Boolean),
    ignoreLineDeletions: boolean('ignore_line_deletions'),
    ignoreFileDeletions: boolean('ignore_file_deletions'),
    failIfXl: boolean('fail_if_xl'),
    messageIfXl: input('message_if_xl', defaultMessage),
  };
}
