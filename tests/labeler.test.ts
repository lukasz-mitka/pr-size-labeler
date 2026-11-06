import assert from 'node:assert/strict';
import { test } from 'node:test';
import { labelFor, labelPullRequest } from '../src/labeler.ts';
import type { ChangeOptions, LabelingOptions } from '../src/types.ts';

function options(overrides: Partial<LabelingOptions> = {}): LabelingOptions {
  return {
    sizes: [
      { label: 'size/xs', max: 10 },
      { label: 'size/s', max: 100 },
      { label: 'size/m', max: 500 },
      { label: 'size/l', max: 1000 },
      { label: 'size/xl', max: Infinity },
    ],
    filesToIgnore: [],
    ignoreLineDeletions: false,
    ignoreFileDeletions: false,
    failIfXl: false,
    messageIfXl: 'Please split this PR',
    ...overrides,
  };
}

function fakeGithub(total = 1000, labels: string[] = []) {
  const calls: [string, (string | number)?][] = [];
  return {
    calls,
    async calculateTotalModifications(_settings: ChangeOptions, cutoff: number): Promise<number> {
      calls.push(['count', cutoff]);
      return total;
    },
    async getLabels(): Promise<string[]> {
      return [...labels];
    },
    async addLabel(label: string): Promise<void> {
      calls.push(['add', label]);
      if (!labels.includes(label)) labels.push(label);
    },
    async removeLabel(label: string): Promise<void> {
      calls.push(['remove', label]);
      labels.splice(labels.indexOf(label), 1);
    },
    async comment(message: string): Promise<void> {
      calls.push(['comment', message]);
    },
  };
}

for (const [total, expected] of [
  [0, 'xs'],
  [9, 'xs'],
  [10, 's'],
  [99, 's'],
  [100, 'm'],
  [499, 'm'],
  [500, 'l'],
  [999, 'l'],
  [1000, 'xl'],
  [10000, 'xl'],
] as const) {
  test(`${total} changes receive size/${expected}`, () => {
    assert.equal(labelFor(total, options().sizes), `size/${expected}`);
  });
}

test('adds the new size before removing only stale configured labels', async () => {
  const github = fakeGithub(250, ['size/xs', 'size/l', 'team/review', 'size/other']);
  await labelPullRequest(github, options(), () => {});
  assert.deepEqual(github.calls, [
    ['count', 1000],
    ['add', 'size/m'],
    ['remove', 'size/xs'],
    ['remove', 'size/l'],
  ]);
});

test('does not remove the current label, including duplicate configured names', async () => {
  const settings = options();
  settings.sizes[0].label = 'size/xl';
  const github = fakeGithub(1000, ['size/xl', 'team/review']);
  await labelPullRequest(github, settings, () => {});
  assert.deepEqual(github.calls, [
    ['count', 1000],
    ['add', 'size/xl'],
  ]);
});

test('comments when a PR becomes XL but not on subsequent XL runs', async () => {
  const github = fakeGithub(1000, ['size/l']);
  await labelPullRequest(github, options(), () => {});
  await labelPullRequest(github, options(), () => {});
  assert.deepEqual(
    github.calls.filter(([method]) => method === 'comment'),
    [['comment', 'Please split this PR']],
  );
});

test('comments again after a PR shrinks and returns to XL', async () => {
  const labels = ['size/xl'];
  await labelPullRequest(fakeGithub(250, labels), options(), () => {});
  const github = fakeGithub(1000, labels);
  await labelPullRequest(github, options(), () => {});
  assert.ok(github.calls.some(([method]) => method === 'comment'));
});

test('does not comment when the XL message is empty', async () => {
  const github = fakeGithub();
  await labelPullRequest(github, options({ messageIfXl: '' }), () => {});
  assert.ok(!github.calls.some(([method]) => method === 'comment'));
});

test('fails an XL PR only after updating labels and commenting', async () => {
  const github = fakeGithub();
  await assert.rejects(
    labelPullRequest(github, options({ failIfXl: true }), () => {}),
    /PR is xl/,
  );
  assert.deepEqual(github.calls.at(-1), ['comment', 'Please split this PR']);
});

test('fail_if_xl also fails when the XL label already exists', async () => {
  const github = fakeGithub(1000, ['size/xl']);
  await assert.rejects(
    labelPullRequest(github, options({ failIfXl: true }), () => {}),
    /PR is xl/,
  );
  assert.deepEqual(github.calls.at(-1), ['add', 'size/xl']);
});

test('uses the largest cutoff when thresholds are out of order', async () => {
  const settings = options();
  settings.sizes[2].max = 1200;
  const github = fakeGithub(1100);
  await labelPullRequest(github, settings, () => {});
  assert.deepEqual(github.calls, [
    ['count', 1200],
    ['add', 'size/m'],
  ]);
});

for (const [settings, total, expected] of [
  [options(), 1500, 'Counted modifications (additions + deletions): 1500'],
  [options({ ignoreFileDeletions: true }), 1000, 'Counted at least 1000 modifications'],
  [
    options({ filesToIgnore: ['*.lock'] }),
    999,
    'Counted modifications (additions + deletions): 999',
  ],
] as const) {
  test(`logs ${expected}`, async () => {
    const messages: string[] = [];
    await labelPullRequest(fakeGithub(total), settings, (message) => messages.push(message));
    assert.ok(messages[0]?.startsWith(expected));
  });
}

for (const method of [
  'calculateTotalModifications',
  'getLabels',
  'addLabel',
  'removeLabel',
  'comment',
] as const) {
  test(`stops immediately when ${method} fails`, async () => {
    const github = fakeGithub(1000, ['size/l']);
    github[method] = async () => {
      github.calls.push(['failure']);
      throw new Error('API failed');
    };
    await assert.rejects(
      labelPullRequest(github, options(), () => {}),
      /API failed/,
    );
    assert.deepEqual(github.calls.at(-1), ['failure']);
  });
}
