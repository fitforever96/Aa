#!/usr/bin/env bash
# Static build for GitHub Pages: temporarily moves server-only API routes aside.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .pages-tmp
mv src/app/api .pages-tmp/api
trap 'mv .pages-tmp/api src/app/api; rmdir .pages-tmp' EXIT
export NEXT_PUBLIC_BUILD_ID="$(git rev-parse --short HEAD 2>/dev/null || echo local)-$(date -u +%m%d%H%M)"
PAGES=1 npx next build
touch out/.nojekyll
printf '{"build":"%s"}\n' "$NEXT_PUBLIC_BUILD_ID" > out/build.json
echo "Static site in ./out"
