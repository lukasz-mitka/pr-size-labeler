#!/usr/bin/env bash
set -euo pipefail

PR_SIZE_LABELER_HOME="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." >/dev/null 2>&1 && pwd)"
export PR_SIZE_LABELER_HOME

source "$PR_SIZE_LABELER_HOME/src/ensure.sh"
source "$PR_SIZE_LABELER_HOME/src/github.sh"
source "$PR_SIZE_LABELER_HOME/src/github_actions.sh"
source "$PR_SIZE_LABELER_HOME/src/labeler.sh"
source "$PR_SIZE_LABELER_HOME/src/misc.sh"

main() {
  ensure::env_variable_exist "GITHUB_REPOSITORY"
  ensure::env_variable_exist "GITHUB_EVENT_PATH"

  export GITHUB_TOKEN="$INPUT_GITHUB_TOKEN"
  export GITHUB_API_URL="$INPUT_GITHUB_API_URL"

  labeler::label \
    "$INPUT_XS_LABEL" \
    "$INPUT_XS_MAX_SIZE" \
    "$INPUT_S_LABEL" \
    "$INPUT_S_MAX_SIZE" \
    "$INPUT_M_LABEL" \
    "$INPUT_M_MAX_SIZE" \
    "$INPUT_L_LABEL" \
    "$INPUT_L_MAX_SIZE" \
    "$INPUT_XL_LABEL" \
    "$INPUT_FAIL_IF_XL" \
    "$INPUT_MESSAGE_IF_XL" \
    "$INPUT_FILES_TO_IGNORE" \
    "$INPUT_IGNORE_LINE_DELETIONS" \
    "$INPUT_IGNORE_FILE_DELETIONS"

  exit $?
}

main
