#!/bin/bash

set -eou pipefail
set -x

dir=$(basename "$(pwd)")
sha=$(git log --pretty=tformat:%H -1);
webdir=~/web/www.gigamonkeys.com/misc/bhs/

mkdir -p "$webdir"
cp "$@" $webdir
cd $webdir
git add .
git commit -m "Publish $dir $sha" .
git push
