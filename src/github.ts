import { getOctokit } from '@actions/github';
import picomatch from 'picomatch';
import type { ActionOptions, ChangeOptions, GitHubClient } from './types.ts';

function count(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error('GitHub API returned an invalid change count');
  }
  return value;
}

export class GitHub implements GitHubClient {
  private readonly octokit: ReturnType<typeof getOctokit>;
  private readonly pull: { owner: string; repo: string; pull_number: number };
  private readonly issue: { owner: string; repo: string; issue_number: number };

  constructor(
    {
      token,
      apiUrl,
      repository,
      number,
    }: Pick<ActionOptions, 'token' | 'apiUrl' | 'repository' | 'number'>,
    fetcher: typeof fetch = fetch,
  ) {
    this.octokit = getOctokit(token, {
      baseUrl: apiUrl.replace(/\/+$/, ''),
      userAgent: 'pr-size-labeler',
      request: { fetch: fetcher, timeout: 30_000 },
    });
    this.pull = { ...repository, pull_number: number };
    this.issue = { ...repository, issue_number: number };
  }

  private async request<Result>(operation: () => Promise<{ data: Result }>): Promise<Result> {
    try {
      const { data } = await operation();
      return data;
    } catch (error) {
      if (error instanceof Error && 'status' in error && typeof error.status === 'number') {
        const permissions = [401, 403].includes(error.status)
          ? ' Set permissions: pull-requests: write on the job. For forks, use pull_request_target without checking out PR code.'
          : '';
        throw new Error(`GitHub API request failed (HTTP ${error.status}).${permissions}`, {
          cause: error,
        });
      }
      throw error;
    }
  }

  async calculateTotalModifications(
    options: ChangeOptions,
    maxModifications = Infinity,
  ): Promise<number> {
    const { filesToIgnore, ignoreLineDeletions, ignoreFileDeletions } = options;
    if (!filesToIgnore.length && !ignoreFileDeletions) {
      const pull = await this.request(() => this.octokit.rest.pulls.get(this.pull));
      return count(pull.additions) + (ignoreLineDeletions ? 0 : count(pull.deletions));
    }

    if (maxModifications <= 0) return 0;
    const ignored = picomatch(filesToIgnore, {
      bash: true,
      dot: true,
      nobrace: true,
      noext: true,
      nonegate: true,
    });
    let total = 0;
    for (let page = 1; ; page++) {
      const files = await this.request(() =>
        this.octokit.rest.pulls.listFiles({
          ...this.pull,
          per_page: 100,
          page,
        }),
      );
      if (!Array.isArray(files)) throw new Error('GitHub API returned an invalid file list');
      for (const file of files) {
        if (typeof file.filename !== 'string')
          throw new Error('GitHub API returned an invalid filename');
        if ((ignoreFileDeletions || ignoreLineDeletions) && file.status === 'removed') continue;
        if (ignored(file.filename)) continue;
        total += count(file.additions) + (ignoreLineDeletions ? 0 : count(file.deletions));
        if (total >= maxModifications) return total;
      }
      if (files.length < 100) return total;
      if (page === 30) {
        throw new Error(
          'GitHub only returns up to 3,000 changed files; cannot determine the filtered PR size',
        );
      }
    }
  }

  async getLabels(): Promise<string[]> {
    const pull = await this.request(() => this.octokit.rest.pulls.get(this.pull));
    if (
      !Array.isArray(pull.labels) ||
      pull.labels.some((label) => typeof label.name !== 'string')
    ) {
      throw new Error('GitHub API returned an invalid label list');
    }
    return pull.labels.map(({ name }) => name);
  }

  async addLabel(label: string): Promise<void> {
    await this.request(() =>
      this.octokit.rest.issues.addLabels({ ...this.issue, labels: [label] }),
    );
  }

  async removeLabel(label: string): Promise<void> {
    await this.request(() => this.octokit.rest.issues.removeLabel({ ...this.issue, name: label }));
  }

  async comment(message: string): Promise<void> {
    await this.request(() =>
      this.octokit.rest.issues.createComment({ ...this.issue, body: message }),
    );
  }
}
