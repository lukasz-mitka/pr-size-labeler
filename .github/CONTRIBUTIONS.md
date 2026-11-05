# Contribution Guide

Thank you for your interest in contributing to our project! We welcome contributions from the community and appreciate your efforts to help improve our codebase. To ensure a smooth collaboration process, please follow the guidelines outlined below.

## License

By contributing to this project, you agree to maintain the MIT license for your contributions. All code and documentation submitted as part of your contributions will be subject to the terms and conditions of the MIT license.

## Semantic Versioning

We adhere to Semantic Versioning (SemVer) when introducing new fixes and features. When making changes that may affect the public contract or assumptions that current users might have made, we will:

1. Discuss the proposed changes openly within the project's communication channels (e.g., issue threads, pull requests) before making a decision.
2. If the changes are agreed upon and deemed beneficial, we will publish a new major version to indicate that the GitHub Action is no longer backward compatible in terms of the public contract or assumptions.

## Code Quality

To maintain a consistent and readable codebase, we kindly ask you to follow the existing code patterns and conventions. This includes:

- Writing short functions with clear purpose and naming.
- Keeping plain JavaScript modules focused: `inputs.js` parses configuration, `github.js` uses Octokit, `labeler.js` controls labeling, and `main.js` is the action entrypoint.
- Following the established coding style and best practices.

While we don't aim to be overly strict, we appreciate your willingness to adhere to the existing patterns and maintain a minimum level of code quality.

Use Node.js 24 or later. Install development dependencies from the lockfile:

```bash
npm ci
```

Run static analysis and formatting checks from the repository root:

```bash
npm run lint
npm run format:check
pre-commit run --all-files --show-diff-on-failure
```

Run `npm run format` to apply formatting. The pre-commit hooks use the locally installed ESLint and Prettier, so run `npm ci` first.

## Testing

Tests use Node's built-in test runner and strict assertions. Unit tests mock Octokit's HTTP transport. Integration tests run the bundled action against a local HTTP server from external temporary directories. Do not call the real GitHub API or use real tokens in tests.

To build the bundle and run all tests:

```bash
npm test
```

For a focused test after building:

```bash
node --test tests/labeler.test.js
```

Write tests for new behavior and edge cases under `tests/`, using `*.test.js` filenames. Preserve coverage for exclusive cutoffs, file-ignore patterns, paginated counting and early exit, label preservation, XL comments, and API errors.

## Distribution

The action runs the committed `dist/index.cjs` bundle, not the source directly. After changing source or dependencies, rebuild it:

```bash
npm run build
```

Include the generated `dist/` files and `package-lock.json` with your changes. Do not edit the bundle or lockfile by hand. CI runs tests on Linux, macOS, and Windows with Node.js 24, and rejects stale bundles. Keep the privileged `pull_request_target` self-test on the trusted base branch; never check out PR code in that job.

## Contribution Process

To contribute to this project, you can follow the common steps you would follow to contribute to any other Open Source project, that is:

1. Fork the repository and create a new branch for your feature or bug fix.
2. Make your changes in the new branch, ensuring that your code follows the project's coding style and conventions.
3. Write clear and concise commit messages that describe the purpose of your changes.
4. Update the unit tests if the change requires testing, ie not a documentation change.
5. Push your changes to your forked repository.
6. Submit a pull request to the main repository, clearly explaining the purpose and scope of your changes by populating the pull request template.
7. Engage in the discussion and address any feedback or questions raised during the code review process.

We will review your contribution and provide feedback as soon as possible. Once your changes have been approved, they will be merged into the main branch.

Thank you for your contribution and support!
