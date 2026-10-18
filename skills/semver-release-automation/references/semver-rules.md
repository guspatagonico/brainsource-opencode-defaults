# SemVer Classification Rules

Deterministic decision matrix for bump level classification from conventional commits.

## Core principle

**SemVer is about the public API contract.** A change that breaks the contract is major. A change that adds to the contract is minor. Everything else is patch.

For this project, the API contract includes:
- HTTP endpoints (additions, removals, response shape changes)
- Frontend components exposed as reusable
- `src/services/*` function signatures
- Configuration files consumed by consumers (API base URL, auth flows)

## Decision matrix

| Evidence present | Decision | Requires confirm? |
|---|---|---|
| `!` after type in commit header (`feat!:`, `fix!:`) | `major` | YES |
| `BREAKING CHANGE:` / `BREAKING-CHANGE:` in body | `major` | YES |
| Removed endpoint, renamed route, changed auth flow | `major` | YES |
| Removed exported function/component without replacement | `major` | YES |
| Changed required config variable name or meaning | `major` | YES |
| `feat:` commit(s), no breaking signals | `minor` | NO |
| Only `fix:`, `refactor:`, `chore:`, `docs:`, `test:`, `style:` | `patch` | NO |
| Only `build:`, `ci:` | `patch` (default) | NO |

## Ambiguity resolution

When signals are mixed:

1. If ANY breaking signal → `major` (safety first)
2. If `feat:` present but also many `fix:` → `minor` (features win over fixes)
3. If only `chore:` but large diff → propose `patch` and explain
4. If unsure between `minor` and `patch` → lean `patch` (less risky, can correct later)

## Commit type to bump mapping

| Type | Default bump | Notes |
|---|---|---|
| `feat` | `minor` | New backward-compatible functionality |
| `fix` | `patch` | Bug fix |
| `refactor` | `patch` | Internal restructuring, no behavior change |
| `perf` | `patch` | Performance improvement (unless breaking) |
| `chore` | `patch` | Maintenance, dependency updates |
| `docs` | `patch` | Documentation changes |
| `test` | `patch` | Test additions/changes |
| `style` | `patch` | Formatting, linting |
| `build` | `patch` | Build system, tooling config |
| `ci` | `patch` | CI/CD pipeline changes |
| `revert` | `patch` | Reverting a previous change |

## Breaking change heuristics (beyond `!` markers)

Even without explicit `BREAKING CHANGE:` markers, the following patterns signal a major bump:

### API endpoints
- Deleted route handler (file removed from `api/`)
- Changed HTTP method for existing route
- Changed required request body field name or type
- Changed response shape (removed field, changed field type)
- Changed auth requirement (was public, now requires token)

### Service layer (`src/services/`)
- Removed exported function
- Changed function signature (added required param, changed param order, changed return type)
- Removed or renamed service file

### Components
- Removed exported component
- Changed required prop
- Changed behavior that consumers depend on (e.g., changed event handler callback shape)

### Configuration
- Changed required env var name or default
- Changed build output directory name (breaking CI/deploy)

## Version bump examples

| Last tag | Changes | Bump | New version |
|---|---|---|---|
| v0.9.1 | fix(dashboard): normalize version badge | `patch` | v0.9.2 |
| v0.9.1 | feat(dashboard): add analytics export | `minor` | v0.10.0 |
| v0.9.1 | feat!: remove legacy API v1 endpoints | `major` | v1.0.0 |
| v0.9.1 | refactor(services): extract auth module | `patch` | v0.9.2 |
| v1.2.3 | fix: + docs: + chore: | `patch` | v1.2.4 |
| v1.2.3 | feat: add new tool + fix: minor bugs | `minor` | v1.3.0 |

## Edge cases

### Pre-release version (v0.x.y)
SemVer spec allows breaking changes in minor bumps while in v0.x.y. However, this project treats v0.x.y strictly:
- `patch` for fixes/chores
- `minor` for new features (even if breaking, since v0.x.y allows it, but still require confirmation)
- `major` reserved for v1.0.0 graduation

### No tag exists (first release)
- Create v0.1.0 as initial baseline
- OR if the project has existing releases without tags, create a tag matching `package.json` version

### Non-linear history
- If commits since last tag include merge commits, extract the conventional messages from merged branches
- Use `git log --first-parent` to follow main-line history for cleaner analysis

### Backport to previous major
- e.g., current is v2.0.1, fixing a bug for v1.x users
- Bump the v1.x series independently: v1.5.6 → v1.5.7
- Does not affect the current major line
