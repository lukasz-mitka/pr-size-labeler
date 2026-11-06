import * as core from '@actions/core';
import { GitHub } from './github.ts';
import { readOptions } from './inputs.ts';
import { labelPullRequest } from './labeler.ts';

async function main(): Promise<void> {
  const options = readOptions();
  core.setSecret(options.token);
  await labelPullRequest(new GitHub(options), options, core.info);
}

main().catch((error: unknown) => {
  core.setFailed(error instanceof Error ? error.message : String(error));
});
