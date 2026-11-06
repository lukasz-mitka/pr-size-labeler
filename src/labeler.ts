import type { GitHubClient, LabelingOptions, Sizes } from './types.ts';

export function labelFor(total: number, sizes: Sizes): string {
  return (sizes.find(({ max }) => total < max) ?? sizes[4]).label;
}

export async function labelPullRequest(
  github: GitHubClient,
  options: LabelingOptions,
  log: (message: string) => void = console.log,
): Promise<void> {
  const { sizes, filesToIgnore, ignoreFileDeletions, messageIfXl, failIfXl } = options;
  const maxModifications = Math.max(...sizes.slice(0, -1).map(({ max }) => max));
  const total = await github.calculateTotalModifications(options, maxModifications);
  if ((filesToIgnore.length || ignoreFileDeletions) && total >= maxModifications) {
    log(
      `Counted at least ${total} modifications (additions + deletions), largest size cutoff reached`,
    );
  } else {
    log(`Counted modifications (additions + deletions): ${total}`);
  }
  log(`Ignoring files (if present): ${filesToIgnore.join(' ')}`);

  const label = labelFor(total, sizes);
  const xlLabel = sizes[4].label;
  const labels = await github.getLabels();
  const shouldComment = label === xlLabel && messageIfXl && !labels.includes(label);

  log(`Labeling pull request with ${label}`);
  await github.addLabel(label);
  const sizeLabels = new Set(sizes.map(({ label: name }) => name));
  for (const staleLabel of new Set(labels)) {
    if (staleLabel !== label && sizeLabels.has(staleLabel)) {
      await github.removeLabel(staleLabel);
    }
  }

  if (label === xlLabel) {
    if (shouldComment) await github.comment(messageIfXl);
    if (failIfXl) throw new Error('PR is xl, please, shorten this!');
  }
}
