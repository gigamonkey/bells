#!/bin/bash

set -eou pipefail

dir=$(basename "$(pwd)")
sha=$(git log --pretty=tformat:%H -1);
webdir=~/web/www.gigamonkeys.com/misc/bhs/

echo "Copying files to $webdir"
mkdir -p "$webdir"
cp -R "$@" $webdir
cd $webdir

echo "Git adding."
git add .

if git diff --cached --quiet .; then
  echo "Nothing to publish — working tree unchanged from last publish."
  exit 0
else
    echo "Committing and pushing."
    git commit -m "Publish $dir $sha" .
    git push
fi
