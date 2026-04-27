#!/usr/bin/env bash

set -eou pipefail

tmp=$(mktemp)

cp "$1" "$tmp"
jq < "$tmp" > "$1"
