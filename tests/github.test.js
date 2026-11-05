import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { GitHub } from '../src/github.js';

const pull = JSON.parse(
  await readFile(new URL('./fixtures/pull_request_api', import.meta.url), 'utf8'),
);
const files = JSON.parse(
  await readFile(new URL('./fixtures/pull_request_files_api', import.meta.url), 'utf8'),
);
const options = { filesToIgnore: [], ignoreLineDeletions: false, ignoreFileDeletions: false };

function client(handler) {
  return new GitHub(
    {
      token: 'test-token',
      apiUrl: 'https://example.test/api/v3/',
      repository: 'owner/repo',
      number: 123,
    },
    handler,
  );
}

function pageFiles(filename, additions = 1, deletions = 1, status = 'modified') {
  return Array.from({ length: 100 }, () => ({ filename, additions, deletions, status }));
}

for (const [overrides, expected] of [
  [{}, 174],
  [{ ignoreLineDeletions: true }, 173],
  [{ ignoreFileDeletions: true }, 2779],
  [{ filesToIgnore: ['*.lock', '.editorconfig'] }, 517],
  [{ filesToIgnore: ['*.lock', '.editorconfig'], ignoreLineDeletions: true }, 224],
  [{ filesToIgnore: ['*.lock', '.editorconfig'], ignoreFileDeletions: true }, 394],
]) {
  test(`counts fixture changes: ${JSON.stringify(overrides)}`, async () => {
    const github = client(async (url) => Response.json(url.includes('/files?') ? files : pull));
    assert.equal(await github.calculateTotalModifications({ ...options, ...overrides }), expected);
  });
}

test('paginates full pages and stops at a short final page', async () => {
  const requests = [];
  const github = client(async (url) => {
    requests.push(url);
    return Response.json(url.endsWith('page=1') ? pageFiles('file.txt') : files);
  });
  assert.equal(
    await github.calculateTotalModifications({ ...options, ignoreFileDeletions: true }),
    2979,
  );
  assert.equal(requests.length, 2);
  assert.ok(requests[1].endsWith('per_page=100&page=2'));
});

test('fetches an empty final page when the last populated page has 100 files', async () => {
  let requests = 0;
  const github = client(async () => Response.json(++requests === 1 ? pageFiles('file.txt') : []));
  assert.equal(
    await github.calculateTotalModifications({ ...options, ignoreFileDeletions: true }),
    200,
  );
  assert.equal(requests, 2);
});

for (const cutoff of [100, 150]) {
  test(`stops counting immediately at cutoff ${cutoff}`, async () => {
    let requests = 0;
    const github = client(async () => {
      requests++;
      return Response.json(pageFiles('file.txt', 1, 0));
    });
    assert.equal(
      await github.calculateTotalModifications({ ...options, ignoreFileDeletions: true }, cutoff),
      cutoff,
    );
    assert.equal(requests, cutoff === 100 ? 1 : 2);
  });
}

test('does not request files when the largest cutoff is zero', async () => {
  const github = client(() => assert.fail('Unexpected request'));
  assert.equal(
    await github.calculateTotalModifications({ ...options, ignoreFileDeletions: true }, 0),
    0,
  );
});

for (const [settings, firstPage] of [
  [{ filesToIgnore: ['*.lock'] }, pageFiles('nested/file.lock', 100, 100)],
  [{ ignoreFileDeletions: true }, pageFiles('deleted.txt', 0, 100, 'removed')],
  [{ filesToIgnore: ['*.lock'], ignoreLineDeletions: true }, pageFiles('file.txt', 0, 100)],
]) {
  test(`continues past ignored changes: ${JSON.stringify(settings)}`, async () => {
    let requests = 0;
    const github = client(async () =>
      Response.json(
        ++requests === 1
          ? firstPage
          : [{ filename: 'included.txt', status: 'modified', additions: 2, deletions: 0 }],
      ),
    );
    assert.equal(await github.calculateTotalModifications({ ...options, ...settings }, 2), 2);
    assert.equal(requests, 2);
  });
}

test('matches full paths with Bash-style stars, dotfiles, classes, and literal negation', async () => {
  const filenames = [
    'a.lock',
    'nested/a.lock',
    '.hidden.lock',
    'docs/deep/page.md',
    'file1.txt',
    '!literal',
    'keep.txt',
  ];
  const github = client(async () =>
    Response.json(
      filenames.map((filename) => ({
        filename,
        status: 'modified',
        additions: 1,
        deletions: 0,
      })),
    ),
  );
  assert.equal(
    await github.calculateTotalModifications({
      ...options,
      filesToIgnore: ['*.lock', 'docs/*', 'file[0-9].txt', '!literal'],
    }),
    1,
  );
});

test('root-only patterns do not ignore nested files, and filenames can contain spaces', async () => {
  const github = client(async () =>
    Response.json([
      { filename: 'package-lock.json', status: 'modified', additions: 100, deletions: 0 },
      { filename: 'nested/package-lock.json', status: 'modified', additions: 2, deletions: 0 },
      { filename: 'file with spaces.txt', status: 'modified', additions: 3, deletions: 0 },
    ]),
  );
  assert.equal(
    await github.calculateTotalModifications({ ...options, filesToIgnore: ['package-lock.json'] }),
    5,
  );
});

test('reads label names including spaces', async () => {
  const github = client(async () =>
    Response.json({ labels: [{ name: 'size/needs review' }, { name: 'size/xl' }] }),
  );
  assert.deepEqual(await github.getLabels(), ['size/needs review', 'size/xl']);
});

test('sends authenticated JSON requests and URL-encodes labels on GitHub Enterprise', async () => {
  const requests = [];
  const github = client(async (url, init) => {
    requests.push({ url, ...init });
    return new Response(null, { status: 204 });
  });
  await github.addLabel('size/"new"');
  await github.removeLabel('size/old label');
  await github.comment('Please "split" this PR\nThanks! \\');
  assert.equal(requests[0].url, 'https://example.test/api/v3/repos/owner/repo/issues/123/labels');
  assert.equal(requests[0].headers.authorization, 'token test-token');
  assert.equal(requests[0].headers['content-type'], 'application/json; charset=utf-8');
  assert.deepEqual(JSON.parse(requests[0].body), { labels: ['size/"new"'] });
  assert.equal(requests[1].method, 'DELETE');
  assert.ok(requests[1].url.endsWith('/labels/size%2Fold%20label'));
  assert.deepEqual(JSON.parse(requests[2].body), { body: 'Please "split" this PR\nThanks! \\' });
});

for (const status of [401, 403, 404, 500]) {
  test(`rejects HTTP ${status} errors`, async () => {
    const github = client(async () => new Response(null, { status }));
    await assert.rejects(github.addLabel('size/s'), (error) => {
      assert.match(error.message, new RegExp(`HTTP ${status}`));
      if ([401, 403].includes(status)) assert.match(error.message, /pull-requests: write/);
      assert.ok(!error.message.includes('test-token'));
      return true;
    });
  });
}

test('propagates failure on a later page without returning a partial count', async () => {
  let requests = 0;
  const github = client(async () =>
    ++requests === 1 ? Response.json(pageFiles('file.txt')) : new Response(null, { status: 403 }),
  );
  await assert.rejects(
    github.calculateTotalModifications({ ...options, ignoreFileDeletions: true }, 1000),
    /HTTP 403/,
  );
});

test('propagates network and malformed response failures', async () => {
  await assert.rejects(
    client(async () => {
      throw new Error('Network failed');
    }).getLabels(),
    /HTTP 500/,
  );
  await assert.rejects(
    client(async () => new Response('invalid JSON')).getLabels(),
    /invalid label list/,
  );
});

for (const body of [
  { message: 'not an array' },
  [{ filename: null }],
  [{ filename: 'file.txt', additions: -1 }],
]) {
  test(`rejects malformed file responses: ${JSON.stringify(body)}`, async () => {
    const github = client(async () => Response.json(body));
    await assert.rejects(
      github.calculateTotalModifications({ ...options, ignoreFileDeletions: true }),
      /invalid/,
    );
  });
}

test('rejects invalid PR counts and label lists', async () => {
  await assert.rejects(
    client(async () => Response.json({ additions: '1' })).calculateTotalModifications(options),
    /invalid change count/,
  );
  await assert.rejects(
    client(async () => Response.json({ labels: {} })).getLabels(),
    /invalid label list/,
  );
});

test('fails instead of undercounting when GitHub truncates the file list at 3,000 files', async () => {
  let requests = 0;
  const github = client(async () => {
    requests++;
    return Response.json(pageFiles('ignored.lock'));
  });
  await assert.rejects(
    github.calculateTotalModifications({ ...options, filesToIgnore: ['*.lock'] }),
    /3,000 changed files/,
  );
  assert.equal(requests, 30);
});
