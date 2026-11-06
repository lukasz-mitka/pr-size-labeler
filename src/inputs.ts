import * as core from '@actions/core';
import * as github from '@actions/github';
import type { ActionOptions, Size } from './types.ts';

export type ActionContext = Pick<typeof github.context, 'repo' | 'payload'>;
export type ActionInputs = Pick<typeof core, 'getInput' | 'getBooleanInput'>;

export function readOptions(
  context: ActionContext = github.context,
  inputs: ActionInputs = core,
): ActionOptions {
  const repository = context.repo;
  if (
    !repository.owner ||
    !repository.repo ||
    !/^[^/\s]+$/.test(repository.owner) ||
    !/^[^/\s]+$/.test(repository.repo)
  ) {
    throw new Error('GITHUB_REPOSITORY must be owner/repository');
  }
  const number = context.payload.pull_request?.number;
  if (!Number.isSafeInteger(number) || !number || number <= 0) {
    throw new Error('Not a pull request event');
  }
  const token = inputs.getInput('GITHUB_TOKEN', { required: true });
  const apiUrl = inputs.getInput('github_api_url', { required: true });
  if (!['http:', 'https:'].includes(new URL(apiUrl).protocol)) {
    throw new Error('Invalid github_api_url');
  }

  const size = (name: string): Size => {
    const label = inputs.getInput(`${name}_label`, { required: true });
    if (name === 'xl') return { label, max: Infinity };
    const value = inputs.getInput(`${name}_max_size`, { required: true });
    const max = Number(value);
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(max)) {
      throw new Error(`${name}_max_size must be a non-negative safe integer`);
    }
    return { label, max };
  };

  return {
    repository,
    number,
    token,
    apiUrl,
    sizes: [size('xs'), size('s'), size('m'), size('l'), size('xl')],
    filesToIgnore: inputs.getInput('files_to_ignore').split(/\s+/).filter(Boolean),
    ignoreLineDeletions: inputs.getBooleanInput('ignore_line_deletions'),
    ignoreFileDeletions: inputs.getBooleanInput('ignore_file_deletions'),
    failIfXl: inputs.getBooleanInput('fail_if_xl'),
    messageIfXl: inputs.getInput('message_if_xl', { trimWhitespace: false }),
  };
}
