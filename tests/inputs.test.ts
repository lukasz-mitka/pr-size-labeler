import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { readOptions, type ActionContext } from '../src/inputs.ts';
import { inputEnvironment } from './helpers.ts';

const context: ActionContext = {
  repo: { owner: 'owner', repo: 'repo' },
  payload: { pull_request: { number: 123 } },
};

function useInputs(testContext: TestContext, overrides: NodeJS.ProcessEnv = {}): void {
  const original = process.env;
  process.env = inputEnvironment(overrides);
  testContext.after(() => {
    process.env = original;
  });
}

test('reads action metadata defaults through the Actions SDK', (testContext) => {
  useInputs(testContext);
  const settings = readOptions(context);
  assert.equal(settings.number, 123);
  assert.deepEqual(settings.repository, { owner: 'owner', repo: 'repo' });
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

test('reads custom inputs, whitespace-separated globs, zero cutoffs, and an empty message', (testContext) => {
  useInputs(testContext, {
    INPUT_XS_LABEL: 'tiny PR',
    INPUT_XS_MAX_SIZE: '0',
    INPUT_FILES_TO_IGNORE: ' *.lock\n docs/*\t.editorconfig ',
    INPUT_IGNORE_LINE_DELETIONS: 'true',
    INPUT_IGNORE_FILE_DELETIONS: 'true',
    INPUT_FAIL_IF_XL: 'true',
    INPUT_MESSAGE_IF_XL: '',
    INPUT_GITHUB_API_URL: 'https://enterprise.test/api/v3',
  });
  const settings = readOptions(context);
  assert.deepEqual(settings.sizes[0], { label: 'tiny PR', max: 0 });
  assert.deepEqual(settings.filesToIgnore, ['*.lock', 'docs/*', '.editorconfig']);
  assert.equal(settings.ignoreLineDeletions, true);
  assert.equal(settings.ignoreFileDeletions, true);
  assert.equal(settings.failIfXl, true);
  assert.equal(settings.messageIfXl, '');
  assert.equal(settings.apiUrl, 'https://enterprise.test/api/v3');
});

test('preserves comment whitespace and multiline content', (testContext) => {
  useInputs(testContext, { INPUT_MESSAGE_IF_XL: '  Please split\nthis PR.  \n' });
  assert.equal(readOptions(context).messageIfXl, '  Please split\nthis PR.  \n');
});

test('uses the runner GitHub Enterprise API URL supplied by action metadata', (testContext) => {
  useInputs(testContext, { GITHUB_API_URL: 'https://enterprise.test/api/v3' });
  assert.equal(readOptions(context).apiUrl, 'https://enterprise.test/api/v3');
});

for (const value of ['true', 'True', 'TRUE', 'false', 'False', 'FALSE']) {
  test(`accepts SDK boolean spelling ${value}`, (testContext) => {
    useInputs(testContext, { INPUT_FAIL_IF_XL: value });
    assert.equal(readOptions(context).failIfXl, value.toLowerCase() === 'true');
  });
}

for (const name of ['INPUT_GITHUB_TOKEN', 'INPUT_GITHUB_API_URL']) {
  test(`rejects missing ${name}`, (testContext) => {
    useInputs(testContext, { [name]: '' });
    assert.throws(() => readOptions(context), /required/);
  });
}

for (const payload of [
  {},
  { number: 123 },
  { pull_request: { number: 0 } },
  { pull_request: { number: '123' } },
]) {
  test(`rejects a non-PR event: ${JSON.stringify(payload)}`, (testContext) => {
    useInputs(testContext);
    assert.throws(
      () => readOptions({ ...context, payload: payload as ActionContext['payload'] }),
      /Not a pull request event/,
    );
  });
}

for (const value of ['-1', '1.5', 'ten', '', '9007199254740992']) {
  test(`rejects invalid threshold ${JSON.stringify(value)}`, (testContext) => {
    useInputs(testContext, { INPUT_XS_MAX_SIZE: value });
    assert.throws(() => readOptions(context), /xs_max_size/);
  });
}

for (const [name, value, message] of [
  ['INPUT_XS_LABEL', '', /xs_label/],
  ['INPUT_FAIL_IF_XL', 'yes', /YAML 1.2/],
  ['INPUT_IGNORE_LINE_DELETIONS', '', /YAML 1.2/],
  ['INPUT_IGNORE_FILE_DELETIONS', '1', /YAML 1.2/],
  ['INPUT_GITHUB_API_URL', 'file:///tmp/api', /github_api_url/],
] as const) {
  test(`rejects invalid ${name}`, (testContext) => {
    useInputs(testContext, { [name]: value });
    assert.throws(() => readOptions(context), message);
  });
}

for (const repo of [
  { owner: '', repo: 'repo' },
  { owner: 'owner', repo: '' },
  { owner: 'owner/repo', repo: 'extra' },
]) {
  test(`rejects invalid repository ${JSON.stringify(repo)}`, (testContext) => {
    useInputs(testContext);
    assert.throws(() => readOptions({ ...context, repo }), /owner\/repository/);
  });
}
