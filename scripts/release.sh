#!/bin/sh
# cut a release: sh scripts/release.sh [--dry-run] [--yes]
# checks main is clean, in sync and its tests pass, writes the CHANGELOG section and the manifest version, commits,
# tags v<version>, pushes, and publishes the GitHub release with that section as its notes
set -e
cd "$(dirname "$0")/.."; . scripts/release-lib.sh
RELEASE_REPO="${RELEASE_REPO:-BjoernSchotte/ccmod-amp}"
dry=0; yes=0
for a in "$@"; do case "$a" in --dry-run) dry=1;; --yes) yes=1;; *) echo "usage: release.sh [--dry-run] [--yes]" >&2; exit 2;; esac; done
[ "$(git branch --show-current)" = main ] || { echo "release.sh: not on main" >&2; exit 1; }
[ -z "$(git status --porcelain)" ] || { echo "release.sh: working tree not clean" >&2; exit 1; }
git fetch -q origin main --tags
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] || { echo "release.sh: main is not in sync with origin/main" >&2; exit 1; }
# no CI here: the gate is the mod's own validation and tests
claude plugin validate . > /dev/null || { echo "release.sh: claude plugin validate failed" >&2; exit 1; }
claude plugin test . > /dev/null || { echo "release.sh: claude plugin test failed" >&2; exit 1; }
v=$(next_version); prev=$(last_stable_tag HEAD)
body=$(changelog "$prev" HEAD)
printf '## %s\n\n%s\n' "$v" "$body"
[ $dry = 1 ] && { echo "(dry run — nothing written)"; exit 0; }
prepend_changelog "$v" "$body"
if [ $yes = 0 ]; then
  ${EDITOR:-vi} CHANGELOG.md
  printf 'release %s? [y/N] ' "$v"; read -r ok
  [ "$ok" = y ] || { git checkout CHANGELOG.md; echo "aborted"; exit 1; }
fi
# the manifest carries the release version, so /plugin shows it
sed -i.bak "s/^  \"version\": \"[^\"]*\"/  \"version\": \"$v\"/" .claude-plugin/plugin.json && rm -f .claude-plugin/plugin.json.bak
git add CHANGELOG.md .claude-plugin/plugin.json && git commit -qm "chore(release): $v"
git tag -a "v$v" -m "ccmod-amp $v"
git push --atomic origin main "v$v"
notes=$(mktemp); notes_for "$v" > "$notes"
gh release create "v$v" --repo "$RELEASE_REPO" --title "ccmod-amp $v" --notes-file "$notes" --verify-tag
rm -f "$notes"
echo "released v$v — https://github.com/$RELEASE_REPO/releases/tag/v$v"
