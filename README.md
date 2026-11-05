# Pull Request Size Labeler

Add size labels to pull requests based on added and deleted lines. This JavaScript action runs on Node.js 24 and uses Octokit to interact with GitHub. It works on Linux, macOS, and Windows runners without Bash, curl, jq, a checkout, or an npm install in your workflow.

## Usage

Create `.github/workflows/labeler.yml`:

```yaml
name: Label PR size

on:
  pull_request_target:
    types: [opened, synchronize, reopened]

permissions:
  pull-requests: write

jobs:
  labeler:
    runs-on: ubuntu-latest
    steps:
      - uses: lukasz-mitka/pr-size-labeler@v1
```

The token is supplied automatically. The job needs `pull-requests: write` to read the PR, update labels, and post comments. `pull_request_target` allows labeling PRs from forks with a writable token. Do not check out or execute PR code in this privileged workflow. For same-repository PRs, `pull_request` can also be used.

Self-hosted runners must support Node.js 24 actions (runner v2.327.1 or later).

### Configuration

All inputs are optional, and their names and defaults are unchanged from the Bash action:

```yaml
- uses: lukasz-mitka/pr-size-labeler@v1
  with:
    xs_label: 'size/xs'
    xs_max_size: '10'
    s_label: 'size/s'
    s_max_size: '100'
    m_label: 'size/m'
    m_max_size: '500'
    l_label: 'size/l'
    l_max_size: '1000'
    xl_label: 'size/xl'
    fail_if_xl: 'false'
    message_if_xl: >
      This PR exceeds the recommended size of 1000 lines.
      Please make sure you are NOT addressing multiple issues with one PR.
      Note this PR might be rejected due to its size.
    files_to_ignore: |
      package-lock.json
      */package-lock.json
      *.lock
      docs/*
    ignore_line_deletions: 'false'
    ignore_file_deletions: 'false'
```

## Inputs

| Name                    | Default                 | Description                                                                                                                    |
| ----------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `GITHUB_TOKEN`          | `${{ github.token }}`   | Token for GitHub API calls.                                                                                                    |
| `xs_label`              | `size/xs`               | Extra-small PR label.                                                                                                          |
| `xs_max_size`           | `10`                    | Exclusive upper bound for XS.                                                                                                  |
| `s_label`               | `size/s`                | Small PR label.                                                                                                                |
| `s_max_size`            | `100`                   | Exclusive upper bound for S.                                                                                                   |
| `m_label`               | `size/m`                | Medium PR label.                                                                                                               |
| `m_max_size`            | `500`                   | Exclusive upper bound for M.                                                                                                   |
| `l_label`               | `size/l`                | Large PR label.                                                                                                                |
| `l_max_size`            | `1000`                  | Exclusive upper bound for L.                                                                                                   |
| `xl_label`              | `size/xl`               | Label when no smaller category matches.                                                                                        |
| `fail_if_xl`            | `false`                 | Fail the step after labeling an XL PR. A required status check can then block merging.                                         |
| `message_if_xl`         | Message shown above     | Comment when a PR gains the XL label. Set to `''` to disable.                                                                  |
| `github_api_url`        | `${{ github.api_url }}` | GitHub API base URL, including `/api/v3` for GitHub Enterprise Server.                                                         |
| `files_to_ignore`       | `''`                    | Whitespace-separated glob patterns matched against full repository-relative paths.                                             |
| `ignore_line_deletions` | `false`                 | Count only added lines.                                                                                                        |
| `ignore_file_deletions` | `false`                 | Exclude completely removed files, but still count deletions in modified files. Redundant when `ignore_line_deletions` is true. |

Thresholds must be non-negative integers; labels must not be empty. Boolean inputs accept `true` or `false`. Inputs are validated before any API writes.

## Sizing And Labels

By default, size is additions plus deletions. A replaced line usually counts twice: once as a deletion and once as an addition. The exclusive cutoffs produce these ranges:

| Label     | Changed lines |
| --------- | ------------- |
| `size/xs` | 0-9           |
| `size/s`  | 10-99         |
| `size/m`  | 100-499       |
| `size/l`  | 500-999       |
| `size/xl` | 1000 or more  |

The action adds the selected label before removing other configured size labels. It never replaces the entire label list, so unrelated labels, including those added concurrently by other workflows, are preserved.

An XL comment is posted only if the PR does not already have the configured XL label. It is not repeated on subsequent XL runs, but is posted again if the PR shrinks and later returns to XL. `fail_if_xl` fails every XL run, after label and comment updates.

Without file filtering, the action reads aggregate PR statistics. When `files_to_ignore` or `ignore_file_deletions` is set, it fetches changed files in pages of 100. Counting stops as soon as the largest configured cutoff is reached, since further changes cannot affect the label. The log then reports a lower bound rather than an exact total. GitHub returns at most 3,000 changed files; if all 3,000 are scanned without reaching a cutoff or a short final page, the action fails instead of assigning a potentially incorrect size.

### File Ignore Patterns

Patterns use [picomatch](https://github.com/micromatch/picomatch) with Bash-style stars and dotfile matching. They are case-sensitive and match the full path, not just the filename. A `*` can span directory separators:

- `package-lock.json` matches only that root file.
- `*/package-lock.json` matches copies in subdirectories.
- `*.lock` matches lockfiles at any depth, including dotfiles.
- `docs/*` matches all paths under `docs/`, including nested files.

Separate patterns with spaces, tabs, or newlines. Do not put quotes around individual patterns in a YAML block scalar. Shell expansion is never performed, so patterns behave the same regardless of files in the caller's workspace. Brace expansion, extended globs, and leading `!` negation are disabled. Paths containing spaces can be matched using wildcards, but cannot be listed literally because whitespace separates patterns.

## Development

Use Node.js 24 or later and npm:

```bash
npm ci
npm test
npm run lint
npm run format:check
pre-commit run --all-files --show-diff-on-failure
```

`npm test` builds the action and runs Node's built-in test runner. Tests mock GitHub calls, and end-to-end tests execute the bundle against a local API server from temporary directories outside the checkout. No real credentials or network access to GitHub are needed.

After changing source or dependencies, run `npm run build` and include the generated `dist/` files alongside the source and `package-lock.json`. The bundle includes Octokit and picomatch, so action consumers do not install dependencies. CI tests Node.js 24 on Linux, macOS, and Windows, runs ESLint and Prettier through pre-commit, and verifies that the committed bundle matches the source.

See the [contribution guidelines](.github/CONTRIBUTIONS.md) for more details.

## License

[MIT](LICENSE)
