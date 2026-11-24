#!/usr/bin/env bash
#
# Bump the Dicoogle Next version across the backend Maven reactor and the webapp.
#
# Usage:
#   scripts/bump-version.sh <version> [--next <dev-version>] [--no-git]
#
# Examples:
#   # Release 0.0.1: set version, commit "chore: release 0.0.1", tag v0.0.1,
#   # then move to 0.0.2-SNAPSHOT in a second commit.
#   scripts/bump-version.sh 0.0.1 --next 0.0.2-SNAPSHOT
#
#   # Only set the version (still commits + tags if it is not a SNAPSHOT).
#   scripts/bump-version.sh 0.1.0
#
#   # Only edit files, no git operations.
#   scripts/bump-version.sh 0.1.0-SNAPSHOT --no-git
#
# Nothing is ever pushed; the script prints the push command at the end.
# Set MVN=mvn to use a system Maven instead of the ./mvnw wrapper.

set -euo pipefail

usage() {
  sed -n '3,20p' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-1}"
}

die() { echo "error: $*" >&2; exit 1; }

VERSION=""
NEXT=""
DO_GIT=1

while [[ $# -gt 0 ]]; do
  case "$1" in
    --next) [[ $# -ge 2 ]] || die "--next requires a value"; NEXT="$2"; shift 2 ;;
    --no-git) DO_GIT=0; shift ;;
    -h|--help) usage 0 ;;
    -*) die "unknown option: $1" ;;
    *) [[ -z "$VERSION" ]] || die "unexpected argument: $1"; VERSION="$1"; shift ;;
  esac
done

[[ -n "$VERSION" ]] || usage

SEMVER_RE='^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$'
[[ "$VERSION" =~ $SEMVER_RE ]] || die "invalid version: $VERSION (expected X.Y.Z or X.Y.Z-QUALIFIER)"
[[ -z "$NEXT" || "$NEXT" =~ $SEMVER_RE ]] || die "invalid --next version: $NEXT"
[[ -z "$NEXT" || "$NEXT" == *-SNAPSHOT ]] || die "--next should be a -SNAPSHOT version (got $NEXT)"
[[ -z "$NEXT" || $DO_GIT -eq 1 ]] || die "--next requires git (it commits between the two bumps)"

ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || die "not inside a git repository"
cd "$ROOT"

BACKEND="$ROOT/backend"
WEBAPP="$ROOT/webapp"
[[ -f "$BACKEND/pom.xml" ]] || die "backend/pom.xml not found"

current_version() {
  # First <version> after the closing </parent> of the reactor root pom.
  awk '/<\/parent>/ {p=1; next} p && /<version>/ {gsub(/.*<version>|<\/version>.*/, ""); print; exit}' \
    "$BACKEND/pom.xml"
}

set_version() {
  local v="$1"
  echo "==> Setting version $v"

  (cd "$BACKEND" && ${MVN:-./mvnw} -B -q -ntp versions:set \
      -DnewVersion="$v" -DprocessAllModules=true -DgenerateBackupPoms=false)

  if [[ -f "$WEBAPP/package.json" ]]; then
    command -v npm >/dev/null || die "npm not found (needed to update webapp/package.json)"
    (cd "$WEBAPP" && npm version "$v" --no-git-tag-version --allow-same-version >/dev/null)
  fi

  local actual
  actual="$(current_version)"
  [[ "$actual" == "$v" ]] || die "backend/pom.xml reports $actual after bump, expected $v"
}

commit() {
  local msg="$1"
  git add -A -- backend webapp/package.json webapp/package-lock.json
  git commit -q -m "$msg"
  echo "    committed: $msg"
}

if [[ $DO_GIT -eq 1 ]]; then
  [[ -z "$(git status --porcelain)" ]] || die "working tree is not clean; commit or stash first"
  if [[ "$VERSION" != *-SNAPSHOT ]] && git rev-parse -q --verify "refs/tags/v$VERSION" >/dev/null; then
    die "tag v$VERSION already exists"
  fi
fi

FROM="$(current_version)"
echo "Current version: $FROM"
[[ "$FROM" != "$VERSION" ]] || die "already at $VERSION"

set_version "$VERSION"

TAG=""
if [[ $DO_GIT -eq 1 ]]; then
  if [[ "$VERSION" == *-SNAPSHOT ]]; then
    commit "chore: bump version to $VERSION"
  else
    commit "chore: release $VERSION"
    TAG="v$VERSION"
    git tag -a "$TAG" -m "Release $VERSION"
    echo "    tagged: $TAG"
  fi

  if [[ -n "$NEXT" ]]; then
    set_version "$NEXT"
    commit "chore: prepare next development version $NEXT"
  fi
fi

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
echo
echo "Done: $FROM -> $VERSION${NEXT:+ -> $NEXT}"
if [[ $DO_GIT -eq 1 ]]; then
  echo "Review with: git log --oneline -3${TAG:+ && git show $TAG --stat}"
  echo "Push with:   git push origin $BRANCH${TAG:+ && git push origin $TAG}"
else
  echo "Files changed (not committed):"
  git status --short
fi
