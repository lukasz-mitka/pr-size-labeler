import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { readOptions } from '../src/inputs.js';

async function environment(context, event = { pull_request: { number: 123 } }) {
  const directory = await mkdtemp(join(tmpdir(), 'pr-size-labeler-inputs-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const eventPath = join(directory, 'event.json');
  await writeFile(eventPath, JSON.stringify(event));
  return {
    GITHUB_REPOSITORY: 'owner/repo',
    GITHUB_EVENT_PATH: eventPath,
    INPUT_GITHUB_TOKEN: 'test-token',
  };
}

test('reads default options from an event in an external temporary directory', async (context) => {
  const settings = await readOptions(await environment(context));
  assert.equal(settings.number, 123);
  assert.equal(settings.apiUrl, 'https://api.github.com');
  assert.deepEqual(
    settings.sizes.map(({ max }) => max),
    [10, 100, 500, 1000, Infinity],
  );
  assert.deepEqual(
    settings.sizes.map(({ label }) => label),
    ['size/xs', 'size/s', 'size/m', 'size/l', 'size/xl'],
  );
  assert.deepEqual(settings.filesToIgnore, []);
  assert.equal(settings.ignoreLineDeletions, false);
  assert.equal(settings.ignoreFileDeletions, false);
  assert.equal(settings.failIfXl, false);
  assert.match(settings.messageIfXl, /1000 lines/);
});

test('reads custom inputs, whitespace-separated globs, zero cutoffs, and an empty message', async (context) => {
  const env = await environment(context);
  Object.assign(env, {
    INPUT_XS_LABEL: 'tiny PR',
    INPUT_XS_MAX_SIZE: '0',
    INPUT_FILES_TO_IGNORE: ' *.lock\n docs/*\t.editorconfig ',
    INPUT_IGNORE_LINE_DELETIONS: 'true',
    INPUT_IGNORE_FILE_DELETIONS: 'true',
    INPUT_FAIL_IF_XL: 'true',
    INPUT_MESSAGE_IF_XL: '',
    INPUT_GITHUB_API_URL: 'https://enterprise.test/api/v3',
  });
  const settings = await readOptions(env);
  assert.deepEqual(settings.sizes[0], { label: 'tiny PR', max: 0 });
  assert.deepEqual(settings.filesToIgnore, ['*.lock', 'docs/*', '.editorconfig']);
  assert.equal(settings.ignoreLineDeletions, true);
  assert.equal(settings.ignoreFileDeletions, true);
  assert.equal(settings.failIfXl, true);
  assert.equal(settings.messageIfXl, '');
  assert.equal(settings.apiUrl, 'https://enterprise.test/api/v3');
});

test('uses the runner GitHub Enterprise API URL by default', async (context) => {
  const env = await environment(context);
  env.GITHUB_API_URL = 'https://enterprise.test/api/v3';
  assert.equal((await readOptions(env)).apiUrl, env.GITHUB_API_URL);
});

for (const name of ['GITHUB_REPOSITORY', 'GITHUB_EVENT_PATH', 'INPUT_GITHUB_TOKEN']) {
  test(`rejects missing ${name}`, async (context) => {
    const env = await environment(context);
    delete env[name];
    await assert.rejects(readOptions(env), /required/);
  });
}

for (const event of [
  {},
  { number: 123 },
  { pull_request: { number: 0 } },
  { pull_request: { number: '123' } },
]) {
  test(`rejects a non-PR event: ${JSON.stringify(event)}`, async (context) => {
    await assert.rejects(
      readOptions(await environment(context, event)),
      /Not a pull request event/,
    );
  });
}

for (const value of ['-1', '1.5', 'ten', '', '9007199254740992']) {
  test(`rejects invalid threshold ${JSON.stringify(value)}`, async (context) => {
    const env = await environment(context);
    env.INPUT_XS_MAX_SIZE = value;
    await assert.rejects(readOptions(env), /xs_max_size/);
  });
}

for (const [name, value, message] of [
  ['INPUT_XS_LABEL', '', /xs_label/],
  ['INPUT_FAIL_IF_XL', 'yes', /fail_if_xl/],
  ['INPUT_IGNORE_LINE_DELETIONS', '', /ignore_line_deletions/],
  ['INPUT_IGNORE_FILE_DELETIONS', '1', /ignore_file_deletions/],
  ['INPUT_GITHUB_API_URL', 'file:///tmp/api', /github_api_url/],
  ['GITHUB_REPOSITORY', 'invalid', /owner\/repository/],
]) {
  test(`rejects invalid ${name}`, async (context) => {
    const env = await environment(context);
    env[name] = value;
    await assert.rejects(readOptions(env), message);
  });
}

test('fails clearly on unreadable or malformed event files', async (context) => {
  const env = await environment(context);
  await writeFile(env.GITHUB_EVENT_PATH, '{');
  await assert.rejects(readOptions(env), SyntaxError);
  await rm(env.GITHUB_EVENT_PATH);
  await assert.rejects(readOptions(env), /ENOENT/);
});
