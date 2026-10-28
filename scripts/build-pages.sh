#!/usr/bin/env bash
# Static build for GitHub Pages: temporarily moves server-only API routes aside.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .pages-tmp
mv src/app/api .pages-tmp/api
trap 'mv .pages-tmp/api src/app/api; rmdir .pages-tmp' EXIT
PAGES=1 npx next build
touch out/.nojekyll
echo "Static site in ./out"
