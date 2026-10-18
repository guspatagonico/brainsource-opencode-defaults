#!/usr/bin/env bash
# SemVer Release Automation — Analyze changes since last tag and output SemVer recommendation
# Author: Gustavo Adrián Salvini <gsalvini@ecimtech.com>
#         https://github.com/guspatagonico — @guspatagonico
# Usage: ./release-semver.sh [--json] [--apply] [--github] [--title "vX.Y.Z"]
# Output: SemVer recommendation, release notes, optional GitHub Release creation

set -euo pipefail

LATEST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
OUTPUT_JSON=false
DRY_RUN=true
CREATE_GITHUB_RELEASE=false
CUSTOM_TITLE=""
PUSH_MODE="manual"

while [[ $# -gt 0 ]]; do
	case "$1" in
		--json) OUTPUT_JSON=true ;;
		--apply) DRY_RUN=false ;;
		--dry-run) DRY_RUN=true ;;
		--github) CREATE_GITHUB_RELEASE=true ;;
		--push=dry-run) PUSH_MODE="dry-run" ;;
		--push=apply) PUSH_MODE="apply" ;;
		--push=manual) PUSH_MODE="manual" ;;
		--title=*) CUSTOM_TITLE="${1#*=}" ;;
		--title)
			shift
			if [[ $# -gt 0 ]]; then
				CUSTOM_TITLE="$1"
			fi
			;;
	esac
	shift
done

if [[ -z "$LATEST_TAG" ]]; then
	echo '{"error":"No git tags found. Create an initial tag (e.g., v0.1.0) first."}'
	exit 1
fi

# ── GitHub remote detection ───────────────────────────────────────────
get_github_remote() {
	local remote_url
	remote_url=$(git remote get-url origin 2>/dev/null || echo "")
	if [[ -z "$remote_url" ]]; then
		echo ""
		return
	fi
	# Handle git@github.com:owner/repo.git and https://github.com/owner/repo.git
	if [[ "$remote_url" =~ github\.com[:/]([^/]+)/([^/]+\.git) ]]; then
		local repo="${BASH_REMATCH[2]%.git}"
		echo "${BASH_REMATCH[1]}/${repo}"
	elif [[ "$remote_url" =~ github\.com[:/]([^/]+)/([^/]+)$ ]]; then
		echo "${BASH_REMATCH[1]}/${BASH_REMATCH[2]}"
	else
		echo ""
	fi
}

GITHUB_REPO=$(get_github_remote)
COMMIT_URL_PREFIX=""
if [[ -n "$GITHUB_REPO" ]]; then
	COMMIT_URL_PREFIX="https://github.com/${GITHUB_REPO}/commit"
fi

# ── Change evidence ───────────────────────────────────────────────────
COMMITS=$(git log --oneline "${LATEST_TAG}..HEAD" 2>/dev/null || echo "")
CHANGED_FILES=$(git diff --name-only "${LATEST_TAG}..HEAD" 2>/dev/null || echo "")
WORKTREE_DIRTY=$(git status --short 2>/dev/null | grep -v '^$' || echo "")

# Count commit types
FEAT_COUNT=0
FIX_COUNT=0
REFACTOR_COUNT=0
CHORE_COUNT=0
DOCS_COUNT=0
TEST_COUNT=0
HAS_BREAKING=false

while IFS= read -r line; do
	[[ -z "$line" ]] && continue
	case "$line" in
		*feat!*) HAS_BREAKING=true ;&
		*feat*:*) FEAT_COUNT=$((FEAT_COUNT + 1)) ;;
		*fix!*) HAS_BREAKING=true ;&
		*fix*:*) FIX_COUNT=$((FIX_COUNT + 1)) ;;
		*refactor!*) HAS_BREAKING=true ;&
		*refactor*:*) REFACTOR_COUNT=$((REFACTOR_COUNT + 1)) ;;
		*BREAKING\ CHANGE:*) HAS_BREAKING=true ;&
		*BREAKING-CHANGE:*) HAS_BREAKING=true ;;
		*chore*:*) CHORE_COUNT=$((CHORE_COUNT + 1)) ;;
		*docs*:*) DOCS_COUNT=$((DOCS_COUNT + 1)) ;;
		*test*:*) TEST_COUNT=$((TEST_COUNT + 1)) ;;
	esac
done <<< "$COMMITS"

# Also check full commit bodies for breaking signals
if echo "$(git log --format='%B' "${LATEST_TAG}..HEAD")" | grep -qi 'BREAKING.CHANGE'; then
	HAS_BREAKING=true
fi

# Decision logic
if [[ "$HAS_BREAKING" == true ]]; then
	BUMP="major"
	RATIONALE="Breaking changes detected (! or BREAKING CHANGE marker in commits)"
elif [[ $FEAT_COUNT -gt 0 ]]; then
	BUMP="minor"
	RATIONALE="$FEAT_COUNT feature commit(s) present with no breaking changes"
else
	BUMP="patch"
	RATIONALE="Only fixes/chores/docs/refactors — no features or breaking changes"
fi

# Current version from package.json
CURRENT_VERSION=$(node -p "require('./package.json').version" 2>/dev/null || echo "0.0.0")
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"

# Calculate next version
case "$BUMP" in
	major)
		NEXT_MAJOR=$((MAJOR + 1))
		NEXT_MINOR=0
		NEXT_PATCH=0
		;;
	minor)
		NEXT_MAJOR=$MAJOR
		NEXT_MINOR=$((MINOR + 1))
		NEXT_PATCH=0
		;;
	patch)
		NEXT_MAJOR=$MAJOR
		NEXT_MINOR=$MINOR
		NEXT_PATCH=$((PATCH + 1))
		;;
esac

NEXT_VERSION="${NEXT_MAJOR}.${NEXT_MINOR}.${NEXT_PATCH}"
RELEASE_TAG="v${NEXT_VERSION}"
RELEASE_COMMIT_MSG="chore(release): bump to ${RELEASE_TAG}"
RELEASE_DATE=$(date +%Y-%m-%d)

if [[ -n "$CUSTOM_TITLE" ]]; then
	RELEASE_TITLE="$CUSTOM_TITLE"
else
	RELEASE_TITLE="${RELEASE_TAG}"
fi

if [[ "$DRY_RUN" == true ]]; then
	MODE_NOTE="Dry-run mode. Use --apply to execute. Push is manual (git push --follow-tags)."
else
	MODE_NOTE="Apply mode ready. Push with: git push --follow-tags"
fi

CHANGED_FILES_COUNT=$(echo "$CHANGED_FILES" | grep -c '^' 2>/dev/null || echo 0)

# ── GitHub Release Notes generator ─────────────────────────────────────
generate_release_notes() {
	local breaking_entries=""
	local feat_entries=""
	local fix_entries=""
	local refactor_entries=""
	local docs_entries=""
	local chore_entries=""
	local test_entries=""

	# Parse each commit with full body
	while IFS= read -r line; do
		[[ -z "$line" ]] && continue

		local hash=$(echo "$line" | awk '{print $1}')
		local subject=$(echo "$line" | sed -E 's/^[a-f0-9]+ //')

		# Get full body for this commit
		local body
		body=$(git log --format='%B' -n 1 "$hash" 2>/dev/null | sed '1d' | sed '/^$/d' | sed 's/^[ ]*//')

		local hash_link="$hash"
		if [[ -n "$COMMIT_URL_PREFIX" ]]; then
			hash_link="[\`$hash\`](${COMMIT_URL_PREFIX}/${hash})"
		else
			hash_link="\`$hash\`"
		fi

		# Format entry: bold subject line, then body bullets if present
		local entry=""
		# Extract subject without the type(scope): prefix for cleaner display
		local display_subject
		display_subject=$(echo "$subject" | sed -E 's/^[a-z]+(\([^)]*\))?!?:[ ]*//')
		entry="- **${display_subject}** (${hash_link})"

		if [[ -n "$body" ]]; then
			while IFS= read -r body_line; do
				[[ -z "$body_line" ]] && continue
				entry+=$'\n'"  ${body_line}"
			done <<< "$body"
		fi

		# Skip release bump commits (they're the tag itself)
		case "$subject" in
			*"chore(release): bump to"*) continue ;;
			*"chore(release): bump"*) continue ;;
		esac

		# Classify and append to the right section
		case "$subject" in
			*feat!*|*fix!*|*refactor!*|*chore!*|*docs!*|*test!*)
				breaking_entries+="$entry"$'\n'
				;&
		esac
		case "$subject" in
			*feat*:*) feat_entries+="$entry"$'\n' ;;
			*fix*:*)  fix_entries+="$entry"$'\n' ;;
			*refactor*:*) refactor_entries+="$entry"$'\n' ;;
			*chore*:*) chore_entries+="$entry"$'\n' ;;
			*docs*:*) docs_entries+="$entry"$'\n' ;;
			*test*:*) test_entries+="$entry"$'\n' ;;
		esac
	done <<< "$COMMITS"

	# Build the full release notes
	local notes="## What's Changed"$'\n'

	if [[ -n "$breaking_entries" ]]; then
		notes+=$'\n'"### 💥 Breaking Changes"$'\n'$'\n'
		notes+="$breaking_entries"$'\n'
	fi

	if [[ -n "$feat_entries" ]]; then
		notes+=$'\n'"### 🚀 Features"$'\n'$'\n'
		notes+="$feat_entries"$'\n'
	fi

	if [[ -n "$fix_entries" ]]; then
		notes+=$'\n'"### 🐛 Fixes"$'\n'$'\n'
		notes+="$fix_entries"$'\n'
	fi

	if [[ -n "$refactor_entries" ]]; then
		notes+=$'\n'"### 🔧 Refactors"$'\n'$'\n'
		notes+="$refactor_entries"$'\n'
	fi

	if [[ -n "$docs_entries" ]]; then
		notes+=$'\n'"### 📝 Documentation"$'\n'$'\n'
		notes+="$docs_entries"$'\n'
	fi

	if [[ -n "$chore_entries" ]]; then
		notes+=$'\n'"### 🧹 Chores"$'\n'$'\n'
		notes+="$chore_entries"$'\n'
	fi

	if [[ -n "$test_entries" ]]; then
		notes+=$'\n'"### ✅ Tests"$'\n'$'\n'
		notes+="$test_entries"$'\n'
	fi

	# Full Changelog compare link
	if [[ -n "$GITHUB_REPO" ]]; then
		notes+=$'\n'"**Full Changelog**: https://github.com/${GITHUB_REPO}/compare/${LATEST_TAG}...${RELEASE_TAG}"$'\n'
	fi

	echo "$notes"
}

RELEASE_NOTES=$(generate_release_notes)

# ── Output ────────────────────────────────────────────────────────────

if [[ "$OUTPUT_JSON" == true ]]; then
	# Escape release notes for JSON
	RN_ESCAPED=$(echo "$RELEASE_NOTES" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))' 2>/dev/null || echo "\"release notes serialization error\"")
	cat <<JSONEOF
{
  "latestTag": "${LATEST_TAG}",
  "currentVersion": "${CURRENT_VERSION}",
  "recommendedBump": "${BUMP}",
  "decisionRationale": "${RATIONALE}",
  "nextVersion": "${NEXT_VERSION}",
  "releaseTag": "${RELEASE_TAG}",
  "releaseTitle": "${RELEASE_TITLE}",
  "releaseDate": "${RELEASE_DATE}",
  "releaseCommitMessage": "${RELEASE_COMMIT_MSG}",
  "githubRepo": "${GITHUB_REPO}",
  "releaseNotes": ${RN_ESCAPED},
  "evidence": {
    "featCount": ${FEAT_COUNT},
    "fixCount": ${FIX_COUNT},
    "refactorCount": ${REFACTOR_COUNT},
    "choreCount": ${CHORE_COUNT},
    "docsCount": ${DOCS_COUNT},
    "testCount": ${TEST_COUNT},
    "hasBreaking": ${HAS_BREAKING},
    "changedFiles": ${CHANGED_FILES_COUNT}
  },
  "dryRun": ${DRY_RUN},
  "githubRelease": ${CREATE_GITHUB_RELEASE},
  "note": "${MODE_NOTE}"
}
JSONEOF
else
	echo "=== SemVer Release Analysis ==="
	echo "Baseline tag:      ${LATEST_TAG}"
	echo "Current version:   ${CURRENT_VERSION}"
	echo ""
	echo "Recommended bump:  ${BUMP}"
	echo "Next version:      ${NEXT_VERSION}"
	echo "Release tag:       ${RELEASE_TAG}"
	echo "Release title:     ${RELEASE_TITLE}"
	echo "Release date:      ${RELEASE_DATE}"
	echo "Release commit:    ${RELEASE_COMMIT_MSG}"
	echo "GitHub repo:       ${GITHUB_REPO:-not detected}"
	echo ""
	echo "Rationale: ${RATIONALE}"
	echo ""
	echo "Evidence:"
	echo "  Features:  ${FEAT_COUNT}"
	echo "  Fixes:     ${FIX_COUNT}"
	echo "  Refactors: ${REFACTOR_COUNT}"
	echo "  Chores:    ${CHORE_COUNT}"
	echo "  Docs:      ${DOCS_COUNT}"
	echo "  Tests:     ${TEST_COUNT}"
	echo "  Breaking:  ${HAS_BREAKING}"
	echo ""
	echo "──────────────────────────────────────────────────"
	echo "  GitHub Release Notes"
	echo "──────────────────────────────────────────────────"
	echo ""
	echo "$RELEASE_NOTES"
	echo ""

	if [[ "$DRY_RUN" == true ]]; then
		echo "Mode: DRY-RUN (no changes made)"
		echo "To apply:    ./release-semver.sh --apply"
		if [[ "$CREATE_GITHUB_RELEASE" == true ]]; then
			echo "GitHub Release: would be created with the notes above"
		fi
		echo "Then push:   git push --follow-tags"
	else
		echo "Mode: APPLY"
		echo "Running: pnpm release:${BUMP}"
		pnpm "release:${BUMP}"
		echo "✓ Release committed and tagged locally."

		# Push phase
		if [[ "$PUSH_MODE" == "apply" ]]; then
			echo "Pushing: git push --follow-tags"
			git push --follow-tags
			echo "✓ Pushed to origin."
		elif [[ "$PUSH_MODE" == "dry-run" ]]; then
			echo "Push dry-run — would run: git push --follow-tags"
		else
			echo "Push reminder: git push --follow-tags"
		fi

		# GitHub Release creation
		if [[ "$CREATE_GITHUB_RELEASE" == true ]]; then
			if [[ -z "$GITHUB_REPO" ]]; then
				echo "⚠ GitHub remote not detected. Skipping release creation."
			elif ! command -v gh &>/dev/null; then
				echo "⚠ gh CLI not found. Install from https://cli.github.com"
			else
				echo ""
				echo "Creating GitHub Release..."
				RELEASE_NOTES_FILE=$(mktemp)
				echo "$RELEASE_NOTES" > "$RELEASE_NOTES_FILE"
				gh release create "${RELEASE_TAG}" \
					--title "${RELEASE_TITLE}" \
					--notes-file "$RELEASE_NOTES_FILE" \
					--draft=false
				rm -f "$RELEASE_NOTES_FILE"
				echo "✓ GitHub Release created: https://github.com/${GITHUB_REPO}/releases/tag/${RELEASE_TAG}"
			fi
		fi
	fi
fi
