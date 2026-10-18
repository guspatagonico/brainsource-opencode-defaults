## GitHub Release Notes format

When `--github` flag is used, the script auto-generates GitHub-optimized release notes with:

- Commit hash links to GitHub (`[\`abc1234\`](https://github.com/owner/repo/commit/abc1234)`)
- Type/scope prefix stripped for clean titles
- Commit body bullet points as sub-details
- Full Changelog compare link at the bottom

```
## What's Changed

### 🚀 Features
- **add semver-release-automation skill** ([`ecbff02`](https://github.com/.../commit/ecbff02))
  - SKILL.md with triggers, mode detection, step-by-step workflow, safety gates
  - references/semver-rules.md: full decision matrix, edge cases
  - scripts/release-semver.sh: bash helper for automated analysis

### 🐛 Fixes
- **fix redirect loop on expired auth token** ([`f7g8h9b`](https://github.com/.../commit/f7g8h9b))
  - Token expiry now correctly triggers logout instead of infinite retry

### 🔧 Refactors
- **extract token management to dedicated service** ([`j0k1l2c`](https://github.com/.../commit/j0k1l2c))

### 📝 Documentation
- **update deployment guide with new env vars** ([`m3n4o5d`](https://github.com/.../commit/m3n4o5d))

### 🧹 Chores
- **bump react to 18.5.0** ([`p6q7r8e`](https://github.com/.../commit/p6q7r8e))

**Full Changelog**: https://github.com/owner/repo/compare/v0.9.1...v0.10.0
```

### Category emoji mapping

| Commit type | GitHub section |
|---|---|
| `feat:` | 🚀 Features |
| `fix:` | 🐛 Fixes |
| `refactor:` | 🔧 Refactors |
| `docs:` | 📝 Documentation |
| `chore:` | 🧹 Chores |
| `test:` | ✅ Tests |
| `feat!:` / `fix!:` / breaking | 💥 Breaking Changes |

### Notes

- Release bump commits (`chore(release): bump to vX.Y.Z`) are automatically excluded from release notes.
- Commit hash is linked to GitHub if remote is detected.
- Full Changelog link uses GitHub's `/compare/<from>...<to>` format.

## Template structure

```
## v<version> (<date>)

### 💥 Breaking Changes

- <description> (<commit-hash>)

### 🚀 Features

- <description> (<commit-hash>)

### 🐛 Fixes

- <description> (<commit-hash>)

### 🔧 Refactors

- <description> (<commit-hash>)

### 📝 Documentation

- <description> (<commit-hash>)

### 🧹 Chores

- <description> (<commit-hash>)

### ⚠️ Migration Notes (only if major)

Step-by-step guide for users upgrading from previous major version.
```

## Section rules

### Breaking Changes
- Only present when bump is `major`
- Each entry: what broke + what to do instead
- Include migration path if available
- Reference affected files/routes

### Features
- New capabilities, new endpoints, new components
- Describe what was added, not how it was implemented
- If feature is user-facing, describe the user impact

### Fixes
- Bug fixes only
- Describe the problem that was fixed
- Reference issue number if available

### Refactors
- Internal changes with no behavior alteration
- Describe what was restructured and why
- Note if it enables future work

### Documentation
- README, inline docs, ADRs, guides
- Note what was documented

### Chores
- Dependency updates, build config, CI changes, tooling
- List version bumps for major dependencies

### Migration Notes
- Only present for `major` bumps
- Clear, numbered steps
- Code examples for before/after where relevant

## Description formatting

Descriptions are derived from conventional commit subjects (body is used for detail when available):

| Commit subject | Release note entry |
|---|---|
| `feat(dashboard): add analytics export button` | Add analytics export button to dashboard |
| `fix(auth): handle expired token redirect` | Fix redirect loop on expired auth token |
| `refactor(services): extract tokenService` | Extract token management to dedicated service |
| `chore(deps): bump react from 18.3.0 to 18.4.0` | Bump react to 18.4.0 |
| `docs: update deployment guide` | Update deployment guide |

## Commit hash format

Short hash (7 chars) in monospace:
- `<commit-hash>` rendered as inline code
- Links to GitHub: `[<short-hash>](https://github.com/<org>/<repo>/commit/<full-hash>)`

## Example: patch release

```
## v0.9.2 (2026-05-22)

### 🐛 Fixes

- Normalize app version badge to fixed bottom-left 10px (`137738d`)
- Fix unnecessary scroll in superadmin dashboard view (`137738d`)

### 🔧 Refactors

- Use git tags as source of truth for app version (`a1b2c3d`)
```

## Example: minor release

```
## v0.10.0 (2026-06-15)

### 🚀 Features

- Add analytics CSV export with date range filter (`d4e5f6a`)
- Add institution onboarding wizard (`g7h8i9b`)

### 🐛 Fixes

- Fix sidebar visibility on mobile in superadmin view (`j0k1l2c`)

### 🧹 Chores

- Bump lucide-react to 0.400.0 (`m3n4o5d`)
```

## Example: major release

```
## v1.0.0 (2026-07-01)

### 💥 Breaking Changes

- Remove legacy `/api/v1/*` endpoints — all clients must use `/api/v2/*` (`p6q7r8e`)
- Rename `src/services/auth.ts` to `src/services/authService.ts` — update all imports (`s9t0u1f`)

### 🚀 Features

- Complete dashboard redesign with new component library (`v2w3x4g`)
- Add role-based access control for all routes (`y5z6a7h`)

### 🐛 Fixes

- Fix data race in institution creation flow (`b8c9d0i`)

### ⚠️ Migration Notes

1. Update all API calls from `/api/v1/` to `/api/v2/` — see [API v2 docs](docs/api-v2.md)
2. Replace `import { login } from 'src/services/auth'` with `import { login } from 'src/services/authService'`
3. Review route permissions — all routes now require explicit role assignment in `src/App.tsx`
```
