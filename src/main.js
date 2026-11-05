import { GitHub } from './github.js';
import { readOptions } from './inputs.js';
import { labelPullRequest } from './labeler.js';

async function main() {
  const options = await readOptions();
  await labelPullRequest(new GitHub(options), options);
}

main().catch((error) => {
  const message = String(error.message ?? error)
    .replaceAll('%', '%25')
    .replaceAll('\r', '%0D')
    .replaceAll('\n', '%0A');
  console.error(`::error::${message}`);
  process.exitCode = 1;
});
