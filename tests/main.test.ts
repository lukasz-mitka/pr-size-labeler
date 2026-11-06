import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { fileURLToPath } from 'node:url';
import { inputEnvironment } from './helpers.ts';

const bundle = fileURLToPath(new URL('../dist/index.js', import.meta.url));

test('the generated action includes ESM package metadata', async () => {
  const metadata: unknown = JSON.parse(
    await readFile(new URL('../dist/package.json', import.meta.url), 'utf8'),
  );
  assert.deepEqual(metadata, { type: 'module' });
});

interface Scenario {
  total?: number;
  labels?: string[];
  inputs?: NodeJS.ProcessEnv;
  event?: unknown;
  rawEvent?: string;
  denied?: boolean;
}

interface RecordedRequest {
  method: string | undefined;
  path: string;
  body: unknown;
}

async function runAction(
  context: TestContext,
  {
    total = 1000,
    labels = ['size/l', 'team/review'],
    inputs = {},
    event = { pull_request: { number: 123 } },
    rawEvent,
    denied = false,
  }: Scenario = {},
) {
  const directory = await mkdtemp(join(tmpdir(), 'pr-size-labeler-action-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const eventPath = join(directory, 'event.json');
  await writeFile(eventPath, rawEvent ?? JSON.stringify(event));
  const requests: RecordedRequest[] = [];
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request)
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    const text = Buffer.concat(chunks).toString();
    const path = request.url ?? '';
    requests.push({
      method: request.method,
      path,
      body: text ? (JSON.parse(text) as unknown) : undefined,
    });
    response.setHeader('Content-Type', 'application/json');
    if (request.headers.authorization !== 'token test-token') {
      response.writeHead(401).end('{}');
    } else if (denied) {
      response.writeHead(403).end('{}');
    } else if (path === '/repos/owner/repo/pulls/123') {
      response.end(
        JSON.stringify({
          additions: total,
          deletions: 0,
          labels: labels.map((name) => ({ name })),
        }),
      );
    } else if (path.startsWith('/repos/owner/repo/pulls/123/files?')) {
      response.end(
        JSON.stringify([
          { filename: 'nested/ignored.lock', status: 'modified', additions: 9999, deletions: 0 },
          { filename: 'src/main.ts', status: 'modified', additions: total, deletions: 0 },
        ]),
      );
    } else if (request.method === 'POST' && path === '/repos/owner/repo/issues/123/labels') {
      response.end('[]');
    } else if (
      request.method === 'DELETE' &&
      path.startsWith('/repos/owner/repo/issues/123/labels/')
    ) {
      response.writeHead(204).end();
    } else if (request.method === 'POST' && path === '/repos/owner/repo/issues/123/comments') {
      response.end('{}');
    } else {
      response.writeHead(404).end('{}');
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(
    () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  );
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const env = inputEnvironment({
    GITHUB_REPOSITORY: 'owner/repo',
    GITHUB_EVENT_PATH: eventPath,
    INPUT_GITHUB_API_URL: `http://127.0.0.1:${address.port}`,
    INPUT_MESSAGE_IF_XL: 'Please "split" this PR\nThanks!',
    ...inputs,
  });
  const child = spawn(process.execPath, [bundle], { cwd: directory, env });
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
  child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
  const code = await new Promise<number | null>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => resolve(code));
  });
  return {
    code,
    stdout: Buffer.concat(stdout).toString(),
    stderr: Buffer.concat(stderr).toString(),
    requests,
  };
}

test(
  'bundled action runs outside the checkout and updates labels and a multiline XL comment',
  { timeout: 10_000 },
  async (context) => {
    const result = await runAction(context);
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /Counted modifications.*1000/);
    assert.match(result.stdout, /::add-mask::test-token/);
    const writes = result.requests.filter(({ method }) => method !== 'GET');
    assert.deepEqual(writes, [
      {
        method: 'POST',
        path: '/repos/owner/repo/issues/123/labels',
        body: { labels: ['size/xl'] },
      },
      { method: 'DELETE', path: '/repos/owner/repo/issues/123/labels/size%2Fl', body: undefined },
      {
        method: 'POST',
        path: '/repos/owner/repo/issues/123/comments',
        body: { body: 'Please "split" this PR\nThanks!' },
      },
    ]);
  },
);

test(
  'bundled action applies file ignores without needing the caller workspace',
  { timeout: 10_000 },
  async (context) => {
    const result = await runAction(context, {
      total: 25,
      inputs: { INPUT_FILES_TO_IGNORE: '*.lock' },
    });
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /Counted modifications.*25/);
    assert.deepEqual(result.requests.find(({ method }) => method === 'POST')?.body, {
      labels: ['size/s'],
    });
  },
);

test('bundled action does not repeat the XL comment', { timeout: 10_000 }, async (context) => {
  const result = await runAction(context, { labels: ['size/xl'] });
  assert.equal(result.code, 0, result.stderr);
  assert.ok(!result.requests.some(({ path }) => path.endsWith('/comments')));
});

test(
  'bundled action fails XL checks through the Actions SDK after applying the label',
  { timeout: 10_000 },
  async (context) => {
    const result = await runAction(context, { inputs: { INPUT_FAIL_IF_XL: 'true' } });
    assert.equal(result.code, 1);
    assert.match(result.stdout, /::error::PR is xl/);
    assert.ok(result.requests.some(({ path }) => path.endsWith('/comments')));
  },
);

test(
  'bundled action rejects non-PR events before making API calls',
  { timeout: 10_000 },
  async (context) => {
    const result = await runAction(context, { event: {} });
    assert.equal(result.code, 1);
    assert.match(result.stdout, /::error::Not a pull request event/);
    assert.deepEqual(result.requests, []);
  },
);

test(
  'bundled action reports permission errors and does not attempt writes',
  { timeout: 10_000 },
  async (context) => {
    const result = await runAction(context, { denied: true });
    assert.equal(result.code, 1);
    assert.match(result.stdout, /::error::.*pull-requests: write/);
    assert.ok(result.requests.every(({ method }) => method === 'GET'));
    assert.ok(!result.stderr.includes('test-token'));
  },
);

test(
  'bundled action reports missing required inputs through the Actions SDK',
  { timeout: 10_000 },
  async (context) => {
    const result = await runAction(context, { inputs: { INPUT_GITHUB_TOKEN: '' } });
    assert.equal(result.code, 1);
    assert.match(result.stdout, /::error::Input required and not supplied: GITHUB_TOKEN/);
    assert.deepEqual(result.requests, []);
  },
);

test(
  'bundled action rejects malformed event files before API calls',
  { timeout: 10_000 },
  async (context) => {
    const result = await runAction(context, { rawEvent: '{' });
    assert.equal(result.code, 1);
    assert.match(result.stderr, /SyntaxError/);
    assert.deepEqual(result.requests, []);
  },
);

test(
  'bundled action rejects missing event files before API calls',
  { timeout: 10_000 },
  async (context) => {
    const result = await runAction(context, {
      inputs: { GITHUB_EVENT_PATH: 'missing-event.json' },
    });
    assert.equal(result.code, 1);
    assert.match(result.stdout, /::error::Not a pull request event/);
    assert.deepEqual(result.requests, []);
  },
);
