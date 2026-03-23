#!/usr/bin/env bash
set -euo pipefail
# Heavily adapted from https://stackoverflow.com/a/34518749/5323344
sha=$(git rev-parse --short HEAD)
date=$(git log -1 --pretty=tformat:%aI "$sha")
status=""
if ! (git diff --exit-code > /dev/null && git diff --cached --exit-code > /dev/null); then
    status+=" / dirty "
fi
if [[ -n "$(git ls-files --other --exclude-standard)" ]]; then
    status+=" / untracked "
fi
if [[ -n "${WORKTREE_BRANCH:-}" ]]; then
    status+=" / worktree: $WORKTREE_BRANCH "
fi
echo "$sha $status($date)"
